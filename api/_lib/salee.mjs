// Envio do aviso de compra ao Salee.ai (GHL) com reenvio garantido.
import crypto from "node:crypto";
// O estado de cada envio fica guardado na própria Square, num atributo do pedido ("salee_status"),
// que pode ser atualizado mesmo depois do pedido concluído. Sem banco de dados.
//   valor: "ok|<tentativas>|<data>"  ou  "pendente|<tentativas>|<data>|<erro>"  ou  "enviando|<tentativas>|<data>"
import { config, square, chavePedido, codigoIngresso, evento } from "./square.mjs";
import { montarPayload } from "./payload.mjs";

const ATTR = "salee_status";
const ESPERA = { compra: [0, 600], pagina_confirmacao: [0] }; // tentativas imediatas (ms); a varredura e o manual usam [0, 700, 2000]
const MAX_TENTATIVAS = 60;

async function garanteDefinicao() {
  const r = await square(`/v2/orders/custom-attribute-definitions/${ATTR}`);
  if (r.ok) return;
  await square("/v2/orders/custom-attribute-definitions", {
    method: "POST",
    body: {
      idempotency_key: `def-${ATTR}`,
      custom_attribute_definition: {
        key: ATTR, name: "Envio ao Salee.ai", description: "Status do aviso de compra enviado ao Salee.ai (site metodorei.com)",
        schema: { $ref: "https://developer-production-s.squarecdn.com/schemas/v1/common.json#squareup.common.String" },
        visibility: "VISIBILITY_HIDDEN",
      },
    },
  });
}

export async function lerStatus(orderId) {
  const r = await square(`/v2/orders/${orderId}/custom-attributes/${ATTR}`);
  if (!r.ok) return { estado: "novo", tentativas: 0, versao: null };
  const ca = r.data.custom_attribute || {};
  const [estado, tent, quando, erro] = String(ca.value || "").split("|");
  return { estado: estado || "novo", tentativas: Number(tent) || 0, quando, erro, versao: ca.version };
}

async function gravarStatus(orderId, valor, versao) {
  const body = { idempotency_key: crypto.randomUUID(), custom_attribute: { value: valor.slice(0, 1000) } };
  if (versao) body.custom_attribute.version = versao;
  let r = await square(`/v2/orders/${orderId}/custom-attributes/${ATTR}`, { method: "POST", body });
  // conta nova: a definição do atributo ainda não existe (a Square responde 400 ou 404) — cria e tenta de novo
  if (!r.ok && !versao) { await garanteDefinicao(); body.idempotency_key = crypto.randomUUID(); r = await square(`/v2/orders/${orderId}/custom-attributes/${ATTR}`, { method: "POST", body }); }
  if (!r.ok) console.error("salee_status", orderId, r.status, JSON.stringify(r.data && r.data.errors || "").slice(0, 300));
  return r.ok ? r.data.custom_attribute.version : null;
}

// Remonta o aviso a partir do que está na Square (pedido + pagamento) — o mesmo no primeiro envio e nos reenvios.
export async function payloadDoPedido(orderId) {
  const o = await square(`/v2/orders/${orderId}`);
  if (!o.ok || !o.data.order) throw new Error("pedido não encontrado");
  const ord = o.data.order, md = ord.metadata || {};
  const ev = evento(md.evento);
  if (!ev) throw new Error("evento desconhecido: " + md.evento);
  const t = ev.tiers[md.tipo];
  const tender = (ord.tenders || [])[0];
  let pagamento = null;
  if (tender && tender.payment_id) {
    const p = await square(`/v2/payments/${tender.payment_id}`);
    if (p.ok) pagamento = p.data.payment;
  }
  const itens = (ord.line_items || []).slice().sort((a, b) => Number((a.metadata || {}).n) - Number((b.metadata || {}).n));
  const unit = itens[0] ? itens[0].base_price_money.amount : 0;
  const total = ord.total_money ? ord.total_money.amount : 0;
  const desconto = ord.total_discount_money ? ord.total_discount_money.amount : 0;
  const lang = md.idioma || "pt";
  const site = (process.env.SITE_URL || "https://www.metodorei.com").replace(/\/$/, "");
  const link = `${site}${lang === "pt" ? "" : "/" + lang}/pedido?o=${encodeURIComponent(orderId)}&k=${chavePedido(orderId)}`;
  const ingressos = itens.map((li, i) => {
    const m = li.metadata || {}, n = Number(m.n) || i + 1;
    return { n, codigo: codigoIngresso(orderId, n), titular: m.titular || md.comprador, email: m.email || "", convidado: m.convidado === "1" };
  });
  const [utm_source, utm_medium, utm_campaign] = String(md.utm || "").split("/");
  return montarPayload({
    cfg: config(), ev, t, ord, pagamento, lang, link, ingressos,
    nome: md.comprador || "", email: md.email || "", telefone: md.telefone || "",
    q: { tier: md.tipo, qty: itens.length, unit, subtotal: unit * itens.length, desconto, total, cupom: md.cupom ? { codigo: md.cupom } : null },
    utm: { utm_source, utm_medium, utm_campaign },
  });
}

async function postar(url, payload) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 3000);
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctl.signal });
    return r.ok ? null : `HTTP ${r.status}`;
  } catch (e) { return e.name === "AbortError" ? "tempo esgotado" : e.message; }
  finally { clearTimeout(tm); }
}

// Envia (ou reenvia) o aviso de um pedido. Não faz nada se já foi entregue ou se outro processo está enviando agora.
export async function enviarSalee(orderId, { origem = "compra", forcar = false } = {}) {
  const url = process.env.GHL_WEBHOOK_URL;
  if (!url) return { ok: false, motivo: "sem_url" };
  const st = await lerStatus(orderId);
  if (st.estado === "ok" && !forcar) return { ok: true, jaEnviado: true };
  if (st.estado === "enviando" && Date.now() - new Date(st.quando).getTime() < 90000) return { ok: false, motivo: "em_andamento" };
  if (st.tentativas >= MAX_TENTATIVAS && !forcar) return { ok: false, motivo: "limite" };
  // trava otimista: se outro processo gravar antes, a versão muda e este desiste
  const agora = () => new Date().toISOString();
  let versao = await gravarStatus(orderId, `enviando|${st.tentativas}|${agora()}`, st.versao);
  if (!versao) {
    // outro processo pegou este pedido agora? então desiste; se não, segue e envia mesmo sem conseguir marcar o status
    const de_novo = await lerStatus(orderId);
    if (de_novo.estado === "ok" || (de_novo.estado === "enviando" && de_novo.versao !== st.versao)) return { ok: false, motivo: "concorrencia" };
  }
  let payload;
  try { payload = await payloadDoPedido(orderId); }
  catch (e) { await gravarStatus(orderId, `pendente|${st.tentativas}|${agora()}|${e.message}`, versao); return { ok: false, motivo: e.message }; }
  let tentativas = st.tentativas, erro = null;
  for (const ms of ESPERA[origem] || [0, 700, 2000]) {
    if (ms) await new Promise((r) => setTimeout(r, ms));
    tentativas++;
    payload.envio_tentativa = tentativas;
    payload.reenvio = tentativas > 1;
    payload.envio_origem = origem;
    erro = await postar(url, payload);
    if (!erro) break;
  }
  await gravarStatus(orderId, erro ? `pendente|${tentativas}|${agora()}|${erro}` : `ok|${tentativas}|${agora()}`, versao);
  if (erro) console.error("salee", orderId, erro);
  return { ok: !erro, tentativas, erro };
}

// Pedidos recentes do site que ainda não foram entregues ao Salee.ai.
export async function pendentes(dias = 14) {
  const cfg = config();
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const lista = [];
  let cursor;
  do {
    const r = await square("/v2/orders/search", {
      method: "POST",
      body: { location_ids: [cfg.locationId], limit: 100, cursor,
        query: { filter: { date_time_filter: { created_at: { start_at: desde } }, state_filter: { states: ["COMPLETED", "OPEN"] } }, sort: { sort_field: "CREATED_AT", sort_order: "DESC" } } },
    });
    if (!r.ok) break;
    for (const o of r.data.orders || []) {
      const md = o.metadata || {};
      if (!md.evento) continue; // não é do site
      const pago = o.state === "COMPLETED" || (o.total_money && o.total_money.amount === 0);
      if (!pago) continue;
      const st = await lerStatus(o.id);
      if (st.estado !== "ok") lista.push({ pedido: o.id, criado: o.created_at, comprador: md.comprador, email: md.email, evento: md.evento, tipo: md.tipo, ...st });
    }
    cursor = r.data.cursor;
  } while (cursor && lista.length < 500);
  return lista;
}
