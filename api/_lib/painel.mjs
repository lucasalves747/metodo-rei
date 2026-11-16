// Painel do time de eventos: sessão (cookie assinado) e leitura de vendas (Square) e leads (Salee.ai / GHL).
import crypto from "node:crypto";
import { CATALOGO } from "./catalogo.mjs";
import { config, square, confere, chavePedido, codigoIngresso } from "./square.mjs";

// ---------- sessão ----------
const COOKIE = "painel";
const DIAS = 7;
const segredo = () => process.env.PAINEL_SEGREDO || `painel:${process.env.TICKET_SECRET || ""}`;
const assina = (s) => crypto.createHmac("sha256", segredo()).update(s).digest("base64url");

export const senhaConfere = (s) => Boolean(process.env.PAINEL_SENHA) && confere(s, process.env.PAINEL_SENHA);

export function abrirSessao(res) {
  const exp = String(Date.now() + DIAS * 86400000);
  res.setHeader("Set-Cookie", `${COOKIE}=${exp}.${assina(exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DIAS * 86400}`);
}
export function fecharSessao(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}
export function sessaoValida(req) {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split(".");
  return Boolean(exp && sig) && confere(sig, assina(exp)) && Number(exp) > Date.now();
}

// ---------- eventos ----------
const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const EVENTOS = Object.values(CATALOGO.eventos);
// Eventos antigos que já saíram do catálogo mas ainda aparecem nos nomes de produto do GHL.
const ANTIGOS = [{ slug: "dallas", cidade: "Dallas" }];

export function listaEventos() {
  return [...EVENTOS.map((e) => ({ slug: e.slug, cidade: e.cidade, uf: e.uf, inicio: e.inicio, fim: e.fim, datas_texto: e.datas_texto })), ...ANTIGOS];
}

// Tenta descobrir evento e tipo de ingresso a partir de um texto livre (nome do produto/funil no GHL).
export function classificar(texto) {
  const t = sem(texto);
  if (!t) return { evento: "", tipo: "" };
  const ev = [...EVENTOS, ...ANTIGOS].find((e) => t.includes(sem(e.cidade)) || t.includes(e.slug));
  const resto = t.replace(/metodo rei/g, "");
  const tipo = /\bvip\b/.test(resto) ? "vip" : /\brei\b/.test(resto) ? "rei" : /standard|geral|individual/.test(resto) ? "standard" : "";
  return { evento: ev ? ev.slug : "", tipo };
}

// ---------- Square ----------
async function todos(path, body, campo) {
  const out = [];
  let cursor;
  do {
    const r = await square(path, { method: "POST", body: { ...body, cursor } });
    if (!r.ok) throw new Error(`square ${path} ${r.status}`);
    out.push(...(r.data[campo] || []));
    cursor = r.data.cursor;
  } while (cursor && out.length < 5000);
  return out;
}

async function pagamentos(desde) {
  const out = [];
  let cursor;
  do {
    const q = new URLSearchParams({ begin_time: desde, limit: "100", location_id: config().locationId, ...(cursor ? { cursor } : {}) });
    const r = await square(`/v2/payments?${q}`);
    if (!r.ok) throw new Error(`square payments ${r.status}`);
    out.push(...(r.data.payments || []));
    cursor = r.data.cursor;
  } while (cursor && out.length < 5000);
  return out;
}

async function clientes(ids) {
  const mapa = {};
  for (let i = 0; i < ids.length; i += 100) {
    const r = await square("/v2/customers/bulk-retrieve", { method: "POST", body: { customer_ids: ids.slice(i, i + 100) } });
    for (const [id, v] of Object.entries((r.data && r.data.responses) || {})) if (v.customer) mapa[id] = v.customer;
  }
  return mapa;
}

const din = (m) => (m && m.amount ? m.amount / 100 : 0);
const nomeCliente = (c) => (c ? [c.given_name, c.family_name].filter(Boolean).join(" ") || c.company_name || "" : "");

// Lê todas as vendas da conta Square a partir de `desde` e normaliza.
// origem: "site" (checkout do metodorei.com), "pag" (funis do Salee/GHL em pag.metodorei.com), "outra" (PDV, link de pagamento, manual).
export async function vendas(desde) {
  const cfg = config();
  const [ordens, pags] = await Promise.all([
    todos("/v2/orders/search", { location_ids: [cfg.locationId], limit: 500, query: { filter: { date_time_filter: { created_at: { start_at: desde } } }, sort: { sort_field: "CREATED_AT", sort_order: "DESC" } } }, "orders"),
    pagamentos(desde),
  ]);
  const pagPorOrdem = {};
  for (const p of pags) if (p.order_id && (!pagPorOrdem[p.order_id] || p.status === "COMPLETED")) pagPorOrdem[p.order_id] = p;
  const idsCliente = [...new Set(ordens.map((o) => o.customer_id || (pagPorOrdem[o.id] || {}).customer_id).filter(Boolean))];
  const cli = idsCliente.length ? await clientes(idsCliente) : {};
  const site = (process.env.SITE_URL || "https://www.metodorei.com").replace(/\/$/, "");

  const linhas = [];
  for (const o of ordens) {
    const md = o.metadata || {};
    const p = pagPorOrdem[o.id];
    const origem = md.evento ? "site" : (o.source && o.source.name === "LeadConnect") ? "pag" : "outra";
    const total = din(o.total_money);
    const pago = o.state === "COMPLETED" || (p && p.status === "COMPLETED") || (origem === "site" && o.state !== "CANCELED" && total === 0 && md.cupom);
    if (!pago) continue; // carrinhos abertos e pagamentos recusados não são venda
    const reembolso = din(p && p.refunded_money) || (o.return_amounts ? din(o.return_amounts.total_money) : 0);
    const taxa = p && p.processing_fee ? p.processing_fee.reduce((s, f) => s + din(f.amount_money), 0) : 0;
    const c = cli[o.customer_id || (p && p.customer_id)];
    const itens = o.line_items || [];
    const base = {
      id: o.id, numero: o.id.slice(-8).toUpperCase(), data: o.created_at, origem,
      total, desconto: din(o.total_discount_money), reembolso, taxa, liquido: Math.round((total - reembolso) * 100) / 100,
      recibo: (p && p.receipt_url) || "", ref_ghl: (p && p.reference_id) || o.reference_id || "",
      descricao: (p && p.statement_description_identifier) || itens.map((i) => i.name).filter(Boolean).join(", "),
      metodo: p ? (p.wallet_details ? p.wallet_details.brand || "Carteira" : p.card_details ? `${p.card_details.card.card_brand} •${p.card_details.card.last_4}` : p.source_type) : "Cupom",
    };
    if (origem === "site") {
      linhas.push({
        ...base, evento: md.evento, tipo: md.tipo || "", qtd: itens.length, cupom: md.cupom || "", utm: md.utm || "", idioma: md.idioma || "",
        comprador: md.comprador || nomeCliente(c), email: md.email || (c && c.email_address) || "", telefone: md.telefone || (c && c.phone_number) || "",
        ingressos: itens.map((i, k) => ({ codigo: codigoIngresso(o.id, Number((i.metadata || {}).n) || k + 1), titular: (i.metadata || {}).titular || i.note || "", email: (i.metadata || {}).email || "" })),
        link: process.env.TICKET_SECRET ? `${site}/pedido?o=${encodeURIComponent(o.id)}&k=${chavePedido(o.id)}` : "",
      });
    } else {
      linhas.push({
        ...base, evento: "", tipo: "", qtd: itens.reduce((s, i) => s + (Number(i.quantity) || 1), 0) || 1, cupom: "", utm: "", idioma: "",
        comprador: nomeCliente(c) || (p && p.billing_address ? [p.billing_address.first_name, p.billing_address.last_name].filter(Boolean).join(" ") : ""),
        email: (c && c.email_address) || (p && p.buyer_email_address) || "", telefone: (c && c.phone_number) || "", ingressos: [], link: "",
      });
    }
  }
  for (const l of linhas) {
    l.produto = l.origem === "site" ? "Método REI" : l.origem === "pag" ? (l.descricao || "Funil sem nome").replace(/\.\.\.$/, "…") : "Outras (PDV / manual)";
    l.metodo_rei = l.origem === "site" || /m[eé]todo rei/i.test(l.descricao);
  }
  return { ambiente: cfg.env, linhas };
}

// ---------- GHL (Salee.ai) ----------
const GHL = "https://services.leadconnectorhq.com";
export const ghlAtivo = () => Boolean(process.env.GHL_API_TOKEN && process.env.GHL_LOCATION_ID);

async function ghl(path, { method = "GET", body } = {}) {
  const r = await fetch(GHL + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.GHL_API_TOKEN}`, Version: "2021-07-28", Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`ghl ${path.split("?")[0]} ${r.status} ${(data && data.message) || ""}`.trim());
  return data;
}

// Transações de pagamento do GHL: dão o nome do produto/funil de cada venda feita em pag.metodorei.com.
export async function transacoesGhl(desde) {
  const loc = process.env.GHL_LOCATION_ID;
  const out = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const q = new URLSearchParams({ altId: loc, altType: "location", limit: "100", offset: String(offset), startAt: desde.slice(0, 10) });
    const d = await ghl(`/payments/transactions?${q}`);
    const lista = d.data || d.transactions || [];
    out.push(...lista);
    if (lista.length < 100) break;
  }
  return out;
}

// Junta o nome do produto do GHL às vendas "pag" e classifica evento/tipo.
export function enriquecer(linhas, transacoes) {
  const porChave = {};
  for (const t of transacoes) {
    const nome = [t.entitySourceName, t.entitySourceMeta && t.entitySourceMeta.name, t.productName, (t.lineItems || []).map((i) => i.name || (i.product && i.product.name)).join(" ")].filter(Boolean).join(" · ");
    const info = { produto: nome, contato: t.contactName || "", email: t.contactEmail || "" };
    for (const k of [t._id, t.entityId, t.chargeId, t.chargeSnapshot && t.chargeSnapshot.id]) if (k) porChave[k] = info;
  }
  for (const l of linhas) {
    if (l.origem !== "pag") continue;
    const info = porChave[l.ref_ghl] || porChave[l.id];
    if (!info) continue;
    l.descricao_ghl = info.produto;
    if (/m[eé]todo rei/i.test(info.produto)) l.metodo_rei = true;
    l.comprador = l.comprador || info.contato;
    l.email = l.email || info.email;
    const c = classificar(info.produto);
    l.evento = c.evento;
    l.tipo = c.tipo;
  }
  return linhas;
}

// Leads da comunidade (formulário da home): contatos com a tag "Método REI - Lista Geral".
export const TAG_LEAD = "Método REI - Lista Geral";
export async function leads(desde) {
  const loc = process.env.GHL_LOCATION_ID;
  const out = [];
  let searchAfter;
  for (let i = 0; i < 50; i++) {
    const d = await ghl("/contacts/search", {
      method: "POST",
      body: {
        locationId: loc, pageLimit: 100,
        filters: [{ field: "tags", operator: "contains", value: TAG_LEAD }, { field: "dateAdded", operator: "range", value: { gte: desde, lte: new Date().toISOString() } }],
        sort: [{ field: "dateAdded", direction: "desc" }],
        ...(searchAfter ? { searchAfter } : {}),
      },
    });
    const lista = d.contacts || [];
    out.push(...lista);
    if (lista.length < 100) break;
    searchAfter = lista[lista.length - 1].searchAfter;
    if (!searchAfter) break;
  }
  return out.map((c) => {
    const tags = c.tags || [];
    const tag = (pre) => (tags.find((t) => sem(t).startsWith(sem(pre))) || "").slice(pre.length).trim();
    const att = c.attributionSource || c.lastAttributionSource || {};
    return {
      id: c.id, data: c.dateAdded, nome: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.contactName || "",
      email: c.email || "", telefone: c.phone || "", cidade: c.city || "", estado: c.state || "",
      idioma: tag("Idioma:"), interesse: tag("Interesse:"), comprou: tags.some((t) => sem(t) === sem("Método REI - Comprou")),
      origem: att.utmSource || c.source || "", campanha: att.campaign || att.utmCampaign || "",
      link: `${(process.env.GHL_APP_URL || "https://app.gohighlevel.com").replace(/\/$/, "")}/v2/location/${loc}/contacts/detail/${c.id}`,
    };
  });
}
