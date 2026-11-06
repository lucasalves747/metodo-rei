// Cria o pedido na Square, cobra o pagamento e avisa o Salee.ai (GHL).
import crypto from "node:crypto";
import { config, square, cotar, corpo, json, limpa, emailOk, chavePedido, codigoIngresso, assinaturaIngresso } from "../_lib/square.mjs";

const ERROS_CARTAO = {
  CARD_DECLINED: "recusado", GENERIC_DECLINE: "recusado", INSUFFICIENT_FUNDS: "saldo", CVV_FAILURE: "cvv",
  ADDRESS_VERIFICATION_FAILURE: "cep", INVALID_EXPIRATION: "validade", EXPIRATION_FAILURE: "validade",
  INVALID_CARD: "cartao", INVALID_CARD_DATA: "cartao", CARD_NOT_SUPPORTED: "nao_suportado",
  TRANSACTION_LIMIT: "limite", VERIFY_CVV_FAILURE: "cvv", VERIFY_AVS_FAILURE: "cep", INVALID_PIN: "cartao",
  CARD_DECLINED_VERIFICATION_REQUIRED: "verificacao", CARD_DECLINED_CALL_ISSUER: "recusado",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { erro: "metodo" });
  const cfg = config();
  if (!cfg.enabled) return json(res, 503, { erro: "indisponivel" });
  let b;
  try { b = await corpo(req); } catch { return json(res, 400, { erro: "pedido" }); }

  const q = cotar(b);
  if (q.erro) return json(res, 400, { erro: q.erro });
  if (b.cupom && q.cupomErro) return json(res, 400, { erro: "cupom", cupomErro: q.cupomErro });
  if (Number(b.totalEsperado) !== q.total) return json(res, 409, { erro: "preco_mudou", total: q.total });

  const nome = limpa(b.comprador && b.comprador.nome, 80);
  const email = limpa(b.comprador && b.comprador.email, 120).toLowerCase();
  const telefone = limpa(b.comprador && b.comprador.telefone, 30);
  if (!nome || !emailOk(email) || telefone.replace(/\D/g, "").length < 7) return json(res, 400, { erro: "dados" });
  const lang = ["pt", "en", "es"].includes(b.lang) ? b.lang : "pt";
  const convidados = Array.isArray(b.convidados) ? b.convidados.slice(0, q.qty - 1) : [];
  const titulares = [{ nome, email }];
  for (let i = 1; i < q.qty; i++) {
    const g = convidados[i - 1] || {};
    const gn = limpa(g.nome, 80), ge = limpa(g.email, 120).toLowerCase();
    titulares.push({ nome: gn || nome, email: emailOk(ge) ? ge : "", convidado: Boolean(gn || emailOk(ge)) });
  }
  const chave = limpa(b.idempotencia, 60) || crypto.randomUUID();
  const ev = q.ev, t = q.t;

  // 1) pedido
  const order = {
    location_id: cfg.locationId,
    reference_id: `${ev.slug}-${q.tier}`.slice(0, 40),
    source: { name: "metodorei.com" },
    line_items: titulares.map((p, i) => ({
      uid: `ing-${i + 1}`,
      name: `Método REI ${ev.cidade} — ${t.nome}`,
      variation_name: `Ingresso ${i + 1}`,
      quantity: "1",
      base_price_money: { amount: q.unit, currency: "USD" },
      note: p.nome.slice(0, 500),
      metadata: { titular: p.nome.slice(0, 255), email: p.email.slice(0, 255), n: String(i + 1) },
    })),
    metadata: {
      evento: ev.slug, tipo: q.tier, idioma: lang, comprador: nome.slice(0, 255), email, telefone,
      ...(q.cupom ? { cupom: q.cupom.codigo } : {}),
      ...(b.utm && b.utm.utm_source ? { utm: limpa([b.utm.utm_source, b.utm.utm_medium, b.utm.utm_campaign].filter(Boolean).join("/"), 250) } : {}),
    },
  };
  if (q.desconto > 0) {
    order.discounts = [{ uid: "cupom", name: `Cupom ${q.cupom.codigo}`, type: "FIXED_AMOUNT", amount_money: { amount: q.desconto, currency: "USD" }, scope: "ORDER" }];
  }
  const o = await square("/v2/orders", { method: "POST", body: { idempotency_key: `o-${chave}`, order } });
  if (!o.ok) { console.error("orders", JSON.stringify(o.data)); return json(res, 502, { erro: "pedido_falhou" }); }
  const ord = o.data.order;
  if (ord.total_money.amount !== q.total) return json(res, 409, { erro: "preco_mudou", total: ord.total_money.amount });

  // 2) pagamento (pula quando um cupom zera o valor)
  let pagamento = null;
  if (q.total > 0) {
    if (!b.sourceId) return json(res, 400, { erro: "cartao" });
    const p = await square("/v2/payments", {
      method: "POST",
      body: {
        idempotency_key: `p-${chave}`,
        source_id: limpa(b.sourceId, 500),
        ...(b.verificationToken ? { verification_token: limpa(b.verificationToken, 1000) } : {}),
        amount_money: { amount: q.total, currency: "USD" },
        order_id: ord.id,
        location_id: cfg.locationId,
        buyer_email_address: email,
        reference_id: ord.id.slice(0, 40),
        note: `Método REI ${ev.cidade} · ${t.nome} × ${q.qty}`.slice(0, 500),
        autocomplete: true,
      },
    });
    if (!p.ok || !p.data.payment || !["COMPLETED", "APPROVED"].includes(p.data.payment.status)) {
      const code = p.data && p.data.errors && p.data.errors[0] && p.data.errors[0].code;
      console.error("payments", code, p.status);
      // pedido fica aberto e sem pagamento; a Square descarta sozinha
      return json(res, 402, { erro: "pagamento", motivo: ERROS_CARTAO[code] || "recusado" });
    }
    pagamento = p.data.payment;
  }

  // 3) ingressos e link de confirmação
  const k = chavePedido(ord.id);
  const pre = lang === "pt" ? "" : `/${lang}`;
  const site = (process.env.SITE_URL || "https://www.metodorei.com").replace(/\/$/, "");
  const link = `${site}${pre}/pedido?o=${encodeURIComponent(ord.id)}&k=${k}`;
  const ingressos = titulares.map((p, i) => ({
    n: i + 1, codigo: codigoIngresso(ord.id, i + 1), titular: p.nome, email: p.email, convidado: Boolean(p.convidado),
    qr: `MREI:${ord.id}:${i + 1}:${assinaturaIngresso(ord.id, i + 1)}`,
  }));

  // 4) webhooks do evento (liberação de e-books, campanhas etc.), por tipo de ingresso
  await dispararWebhooks(ev, q, t, ord.id, nome, email, telefone, ingressos);

  // 5) Salee.ai / GHL geral (não bloqueia a confirmação se falhar)
  if (process.env.GHL_WEBHOOK_URL) {
    const payload = {
      tipo: "metodo_rei.pedido_pago",
      pedido_id: ord.id,
      pagamento_id: pagamento ? pagamento.id : null,
      recibo_url: pagamento ? pagamento.receipt_url || null : null,
      ambiente: cfg.env,
      idioma: lang,
      link_confirmacao: link,
      evento: { slug: ev.slug, cidade: ev.cidade, uf: ev.uf, data: ev.datas_texto, inicio: ev.inicio, fim: ev.fim, local: ev.local },
      ingresso: { tipo: q.tier, nome: t.nome, quantidade: q.qty, valor_unitario: q.unit / 100, subtotal: q.subtotal / 100, desconto: q.desconto / 100, total: q.total / 100, moeda: "USD", cupom: q.cupom ? q.cupom.codigo : null },
      comprador: { nome, email, telefone },
      convidados: ingressos.filter((x) => x.n > 1 && x.convidado).map((x) => ({ nome: x.titular, email: x.email, codigo: x.codigo })),
      ingressos: ingressos.map(({ n, codigo, titular, email }) => ({ n, codigo, titular, email })),
      utm: b.utm || {},
      tags: ["Método REI - Comprou", `Método REI - ${ev.cidade} ${ev.ano}`, `Ingresso ${t.nome}`, `Idioma: ${lang.toUpperCase()}`],
    };
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(process.env.GHL_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctl.signal });
      clearTimeout(tm);
      if (!r.ok) console.error("ghl", r.status);
    } catch (e) { console.error("ghl", e.message); }
  }

  json(res, 200, { ok: true, pedido: ord.id, k, link, recibo: pagamento ? pagamento.receipt_url || null : null });
}

function preencher(v, d) {
  if (typeof v === "string") return v.replace(/\{(\w+)\}/g, (m, k) => (k in d ? d[k] : m));
  if (Array.isArray(v)) return v.map((x) => preencher(x, d));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, preencher(x, d)]));
  return v;
}
async function dispararWebhooks(ev, q, t, orderId, nome, email, telefone, ingressos) {
  const hooks = (ev.webhooks || []).filter((h) => !h.tiers || h.tiers.includes(q.tier));
  if (!hooks.length) return;
  // No modo de teste nunca chama os endpoints reais (liberariam e-books para compras de teste):
  // manda para WEBHOOK_TESTE, se existir, ou não manda.
  const teste = config().env !== "production";
  if (teste && !process.env.WEBHOOK_TESTE) return;
  // uma pessoa por e-mail: o comprador e cada convidado que recebeu e-mail próprio
  const pessoas = [{ nome, email, telefone, codigo: ingressos[0].codigo }];
  for (const i of ingressos.slice(1)) if (i.convidado && i.email && !pessoas.some((p) => p.email === i.email)) pessoas.push({ nome: i.titular, email: i.email, telefone: "", codigo: i.codigo });
  const envios = [];
  for (const h of hooks) for (const p of h.para === "comprador" ? pessoas.slice(0, 1) : pessoas) {
    const partes = p.nome.trim().split(/\s+/);
    const dados = { id: `${orderId}-${p.codigo.slice(-2)}`, nome: p.nome, primeiro_nome: partes[0], sobrenome: partes.slice(1).join(" "), email: p.email, telefone: p.telefone,
      cidade: ev.cidade, tipo: q.tier, tipo_nome: t.nome, pedido: orderId, codigo: p.codigo };
    envios.push((async () => {
      try {
        const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 5000);
        const destino = teste ? process.env.WEBHOOK_TESTE : h.url;
        const r = await fetch(destino, { method: "POST", headers: { "Content-Type": "application/json", ...(teste ? { "X-Webhook-Original": h.nome } : {}) }, body: JSON.stringify(preencher(h.corpo, dados)), signal: ctl.signal });
        clearTimeout(tm);
        if (!r.ok) console.error("webhook", h.nome, r.status);
      } catch (e) { console.error("webhook", h.nome, e.message); }
    })());
  }
  await Promise.all(envios);
}
