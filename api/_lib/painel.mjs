// Painel do time de eventos: sessão (cookie assinado) e leitura de vendas (Square) e leads (Salee.ai / GHL).
import crypto from "node:crypto";
import { CATALOGO } from "./catalogo.mjs";
import { config, square, confere, chavePedido, codigoIngresso } from "./square.mjs";
import { storeAtivo, lerLeads } from "./leads-store.mjs";

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
// Eventos antigos que já saíram do catálogo mas ainda aparecem nos carrinhos do Salee.ai.
const ANTIGOS = [
  { slug: "dallas", cidade: "Dallas", uf: "TX", apelidos: ["/cart-dl", "/cart-pre-", "/cart-vip"] },
  { slug: "jackson", cidade: "Jacksonville", uf: "FL", apelidos: ["jack"] },
];

export function listaEventos() {
  return [
    ...EVENTOS.map((e) => ({ slug: e.slug, marca: e.marca || "Método REI", tipos: Object.fromEntries(Object.entries(e.tiers).map(([k, t]) => [k, t.nome])), cidade: e.cidade, uf: e.uf, inicio: e.inicio, fim: e.fim, datas_texto: e.datas_texto })),
    ...ANTIGOS.map(({ apelidos, ...e }) => e),
  ];
}

// Descobre evento e tipo de ingresso a partir do nome do funil e do endereço do carrinho no Salee.ai
// (ex.: "METHODO REI Miami" + "/cart-vip-miami" → miami / vip).
export function classificar(nome, url = "") {
  const t = sem(`${nome} ${url}`);
  const u = sem(url);
  if (!t.trim()) return { evento: "", tipo: "" };
  let ev = EVENTOS.find((e) => t.includes(sem(e.cidade)) || t.includes(e.slug));
  if (!ev) ev = ANTIGOS.find((e) => t.includes(e.slug) || t.includes(sem(e.cidade)) || e.apelidos.some((a) => (a.endsWith("-") ? u.startsWith(a) : u === a || u.startsWith(a + "?") || (a.length > 4 && !a.startsWith("/") && t.includes(a)))));
  if (!ev) return { evento: "", tipo: "" };
  const tipo = /vip/.test(u) ? "vip" : /-rei\b/.test(u) ? "rei" : "standard";
  return { evento: ev.slug, tipo };
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
const LOC = () => process.env.GHL_LOCATION_ID;

async function ghl(path, { method = "GET", body } = {}, tentativa = 0) {
  const r = await fetch(GHL + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.GHL_API_TOKEN}`, Version: "2021-07-28", Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 429 && tentativa < 4) {
    await new Promise((ok) => setTimeout(ok, 1500 * (tentativa + 1)));
    return ghl(path, { method, body }, tentativa + 1);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`ghl ${path.split("?")[0]} ${r.status} ${(data && data.message) || ""}`.trim());
  return data;
}

async function ghlLista(recurso) {
  const out = [];
  for (let offset = 0; offset < 10000; offset += 100) {
    const d = await ghl(`/payments/${recurso}?altId=${LOC()}&altType=location&limit=100&offset=${offset}`);
    const lista = d.data || [];
    out.push(...lista);
    if (lista.length < 100) break;
  }
  return out;
}

async function emLotes(itens, n, fn) {
  const out = [];
  for (let i = 0; i < itens.length; i += n) out.push(...(await Promise.all(itens.slice(i, i + n).map(fn))));
  return out;
}

const FONES = new Map(); // telefone por contato do Salee.ai, guardado enquanto a função estiver quente

const doMetodoRei = (o) => /metodorei\.com/i.test((o.sourceMeta && o.sourceMeta.domain) || "");

// Pedidos dos carrinhos do Salee.ai em (pag.)metodorei.com: pagos viram vendas; não pagos viram leads de carrinho.
let pedidosCache = { ate: 0, p: null };
export function pedidosGhl() {
  if (pedidosCache.p && pedidosCache.ate > Date.now()) return pedidosCache.p;
  const p = carregarPedidosGhl();
  pedidosCache = { ate: Date.now() + 60000, p };
  p.catch(() => { pedidosCache = { ate: 0, p: null }; });
  return p;
}

async function carregarPedidosGhl() {
  const [ordens, transacoes] = await Promise.all([ghlLista("orders"), ghlLista("transactions")]);
  const txPorPedido = {};
  for (const t of transacoes) (txPorPedido[t.entityId] ||= []).push(t);
  const mr = ordens.filter(doMetodoRei);
  // pedidos com mais de um produto: busca o detalhe para contar ingressos (ignora order bumps)
  const multi = mr.filter((o) => o.paymentStatus === "paid" && o.totalProducts > 1);
  const qtd = {};
  await emLotes(multi, 5, async (o) => {
    try {
      const d = await ghl(`/payments/orders/${o._id}?altId=${LOC()}&altType=location`);
      qtd[o._id] = (d.items || []).filter((i) => !i.bumpProduct).reduce((s, i) => s + (Number(i.qty) || 1), 0) || 1;
    } catch { qtd[o._id] = o.totalProducts; }
  });
  const ids = [...new Set(mr.filter((o) => o.paymentStatus === "paid" && o.contactId).map((o) => o.contactId))].filter((id) => !FONES.has(id));
  for (let i = 0; i < ids.length; i += 5) {
    await Promise.all(ids.slice(i, i + 5).map(async (id) => {
      try { FONES.set(id, telefoneContato((await ghl(`/contacts/${id}`)).contact || {})); } catch {}
    }));
    if (i + 5 < ids.length) await new Promise((ok) => setTimeout(ok, 600));
  }
  const fones = Object.fromEntries(FONES);
  const vendas = [], carrinhos = [];
  for (const o of mr) {
    const meta = o.sourceMeta || {};
    const txs = txPorPedido[o._id] || [];
    const c = classificar(o.sourceName, meta.pageUrl);
    const base = {
      ghl_id: o._id, ghl_tx: txs.map((t) => t._id), contato_id: o.contactId,
      data: o.createdAt, comprador: o.contactName || "", email: o.contactEmail || "",
      produto: o.sourceName || "Método REI", carrinho: `${meta.domain || ""}${meta.pageUrl || ""}`,
      evento: c.evento, tipo: c.tipo, moeda: o.currency || "USD",
    };
    if (o.paymentStatus === "paid") {
      const ok = txs.find((t) => t.status === "succeeded");
      vendas.push({
        ...base, id: o._id, numero: o._id.slice(-8).toUpperCase(), origem: "pag", metodo_rei: true,
        total: Number(o.amount) || 0, desconto: Number(o.discount) || 0, cupom: o.couponCode || "",
        reembolso: txs.reduce((s, t) => s + (Number(t.amountRefunded) || 0), 0), taxa: 0,
        qtd: qtd[o._id] || 1, recibo: "", ref_ghl: o._id, descricao: o.sourceName || "", descricao_ghl: `${o.sourceName || ""} · ${base.carrinho}`,
        metodo: ok ? (ok.paymentProviderType === "square" ? "Cartão (Square)" : Number(o.amount) ? "Manual" : "Cupom / gratuito") : "—",
        telefone: fones[o.contactId] || "", utm: "", idioma: "", ingressos: [], link: "",
      });
    } else {
      carrinhos.push(base);
    }
  }
  for (const v of vendas) v.liquido = Math.round((v.total - v.reembolso) * 100) / 100;
  return { vendas, carrinhos };
}

// Junta as vendas do Salee.ai com as da Square: a venda paga com cartão aparece nos dois;
// fica a linha do Salee.ai (tem evento e tipo) com recibo, taxa e reembolso da Square.
export function juntar(linhasSquare, vendasGhl) {
  const porRef = {};
  for (const v of vendasGhl) for (const k of [v.ghl_id, ...v.ghl_tx]) porRef[k] = v;
  const resto = [];
  for (const l of linhasSquare) {
    const v = l.origem === "pag" && porRef[l.ref_ghl];
    if (!v) { resto.push(l); continue; }
    Object.assign(v, {
      reembolso: l.reembolso || v.reembolso, taxa: l.taxa, recibo: l.recibo, metodo: l.metodo, square_id: l.id,
      comprador: v.comprador || l.comprador, email: v.email || l.email, telefone: l.telefone || v.telefone,
    });
    v.liquido = Math.round((v.total - v.reembolso) * 100) / 100;
  }
  // Vendas "Método Rei" da Square sem par no Salee.ai continuam contando, mas sem evento.
  return [...resto, ...vendasGhl];
}

// ---------- leads ----------
export const TAG_LEAD = "Método REI - Lista Geral";

async function contatosComTag(tag) {
  const out = [];
  let searchAfter;
  for (let i = 0; i < 50; i++) {
    const d = await ghl("/contacts/search", {
      method: "POST",
      body: { locationId: LOC(), pageLimit: 100, filters: [{ field: "tags", operator: "eq", value: tag }], sort: [{ field: "dateAdded", direction: "desc" }], ...(searchAfter ? { searchAfter } : {}) },
    });
    const lista = d.contacts || [];
    out.push(...lista);
    if (lista.length < 100 || !lista[lista.length - 1].searchAfter) break;
    searchAfter = lista[lista.length - 1].searchAfter;
  }
  return out;
}

// Alguns formulários do Salee.ai gravam o telefone num campo personalizado em vez do campo "phone".
const pareceFone = (v) => typeof v === "string" && /^[\d\s().+-]{8,25}$/.test(v.trim()) && v.replace(/\D/g, "").length >= 8;
function telefoneContato(c) {
  if (c.phone) return c.phone;
  const cf = (c.customFields || []).find((f) => pareceFone(f.value));
  return cf ? cf.value.replace(/^\+\d+\s+\+/, "+").trim() : "";
}

const linkContato = (id) => `${(process.env.GHL_APP_URL || "https://app.gohighlevel.com").replace(/\/$/, "")}/v2/location/${LOC()}/contacts/detail/${id}`;

function linhaLead(c, fonte, extra = {}) {
  const tags = c.tags || [];
  const tag = (pre) => (tags.find((t) => sem(t).startsWith(sem(pre))) || "").slice(pre.length).trim();
  const att = c.attributionSource || c.lastAttributionSource || {};
  return {
    id: c.id, data: c.dateAdded, nome: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.contactName || "",
    email: c.email || "", telefone: telefoneContato(c), cidade: c.city || "", estado: c.state || "",
    idioma: tag("Idioma:").toUpperCase(), interesse: tag("Interesse:"), fonte,
    origem: att.utmSource || att.sessionSource || c.source || "", campanha: att.campaign || att.utmCampaign || "",
    comprou: tags.some((t) => sem(t) === sem("Método REI - Comprou")), link: linkContato(c.id), ...extra,
  };
}

// Fontes: cópia guardada pelo próprio site (formulário da home e checkout), contatos do Salee.ai com as tags
// do site (caso a cópia ainda não existisse) e carrinhos do Salee.ai em pag.metodorei.com que não foram pagos.
function linhaSite(l) {
  const home = l.origem !== "checkout_site";
  let host = "";
  try { host = l.referrer ? new URL(l.referrer).hostname.replace(/^www\./, "") : ""; } catch {}
  return {
    id: l.email + l.data_envio, data: l.data_envio, nome: l.nome || "", email: l.email || "", telefone: l.telefone || "",
    cidade: l.cidade || "", estado: l.estado || "", idioma: (l.idioma || "").toUpperCase(),
    interesse: (l.edicao_interesse || "").replace(/^m[eé]todo rei - /i, ""),
    fonte: home ? "Formulário da home" : "Checkout do site (não pagou)",
    origem: l.utm_source || host || "direto", campanha: l.utm_campaign || "", profissao: l.profissao || "",
    salee: home ? (l.salee === "ok" ? "ok" : l.salee || "") : "", link: "",
  };
}

export async function leads(desde) {
  const ativo = ghlAtivo();
  const [site, home, checkout, ghlPedidos] = await Promise.all([
    storeAtivo() ? lerLeads(desde) : [],
    ativo ? contatosComTag(TAG_LEAD) : [],
    ativo ? contatosComTag("Checkout") : [],
    ativo ? pedidosGhl() : { vendas: [], carrinhos: [] },
  ]);
  const out = new Map();
  // cópia do site: um por e-mail e fonte (o mais recente)
  for (const l of site.sort((a, b) => String(b.data_envio).localeCompare(String(a.data_envio)))) {
    const r = linhaSite(l);
    const k = `${r.fonte}|${r.email}`;
    if (!out.has(k)) out.set(k, r);
  }
  const emails = new Set([...out.values()].map((r) => r.email));
  for (const c of home) if (!emails.has((c.email || "").toLowerCase())) out.set(c.id, linhaLead(c, "Formulário da home"));
  for (const c of checkout) {
    if (out.has(c.id) || emails.has((c.email || "").toLowerCase())) continue;
    const t = (c.tags || []).find((x) => /^m[eé]todo rei - /i.test(x) && !/lista geral|comprou/i.test(x)) || "";
    out.set(c.id, linhaLead(c, "Checkout do site (não pagou)", { interesse: t.replace(/^m[eé]todo rei - /i, "") }));
  }
  // carrinhos não pagos, sem quem acabou comprando depois
  const compradores = new Set(ghlPedidos.vendas.map((v) => v.contato_id));
  const abandonos = new Map();
  for (const c of ghlPedidos.carrinhos) if (c.contato_id && !compradores.has(c.contato_id) && !out.has(c.contato_id) && !abandonos.has(c.contato_id) && !emails.has((c.email || "").toLowerCase())) abandonos.set(c.contato_id, c);
  const contatos = await emLotes([...abandonos.values()], 8, async (c) => {
    try { return (await ghl(`/contacts/${c.contato_id}`)).contact; } catch { return null; }
  });
  [...abandonos.values()].forEach((c, i) => {
    const ct = contatos[i] || { id: c.contato_id, contactName: c.comprador, email: c.email, dateAdded: c.data };
    const ev = listaEventos().find((e) => e.slug === c.evento);
    out.set(c.contato_id, linhaLead({ ...ct, dateAdded: c.data }, "Carrinho pag.metodorei (não pagou)", { interesse: ev ? ev.cidade : c.produto }));
  });
  return [...out.values()].filter((l) => String(l.data) >= desde).sort((a, b) => String(b.data).localeCompare(String(a.data)));
}
