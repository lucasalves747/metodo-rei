// Confirmação de uma reserva Zelle: cria o pedido na Square (pago por fora, via Zelle), gera os ingressos,
// avisa o Salee.ai como numa compra normal e manda os ingressos por e-mail ao comprador.
import { config, square, evento, chavePedido, codigoIngresso } from "./square.mjs";
import { enviarSalee } from "./salee.mjs";
import { ghl, ghlAtivo } from "./painel.mjs";

const SITE = () => (process.env.SITE_URL || "https://www.metodorei.com").replace(/\/$/, "");
const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const usd = (c) => `US$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

async function criarPedido(z) {
  const cfg = config(), ev = evento(z.evento);
  if (!ev) throw new Error("evento desconhecido");
  const t = ev.tiers[z.tipo];
  const titulares = [{ nome: z.comprador, email: z.email }];
  for (let i = 1; i < z.qtd; i++) {
    const g = (z.convidados || [])[i - 1] || {};
    titulares.push({ nome: g.nome || z.comprador, email: g.email || "", convidado: Boolean(g.nome || g.email) });
  }
  const order = {
    location_id: cfg.locationId,
    reference_id: `zelle-${z.id}`,
    source: { name: "metodorei.com" },
    line_items: titulares.map((p, i) => ({
      uid: `ing-${i + 1}`,
      name: `${ev.marca || "Método REI"} ${ev.cidade} — ${t.nome}`,
      variation_name: `Ingresso ${i + 1}`,
      quantity: "1",
      base_price_money: { amount: z.unit, currency: "USD" },
      note: p.nome.slice(0, 500),
      metadata: { titular: p.nome.slice(0, 255), email: p.email.slice(0, 255), n: String(i + 1), ...(p.convidado ? { convidado: "1" } : {}) },
    })),
    metadata: {
      evento: ev.slug, tipo: z.tipo, idioma: z.idioma || "pt", comprador: z.comprador.slice(0, 255), email: z.email, telefone: z.telefone, zelle: z.id,
      ...(z.cupom ? { cupom: z.cupom } : {}),
      ...(z.ref && /^[A-Za-z0-9_-]{1,64}$/.test(z.ref) ? { ref: z.ref } : {}),
      ...(z.utm && z.utm.utm_source ? { utm: [z.utm.utm_source, z.utm.utm_medium, z.utm.utm_campaign].filter(Boolean).join("/").slice(0, 250) } : {}),
    },
  };
  if (z.desconto > 0) order.discounts = [{ uid: "cupom", name: `Cupom ${z.cupom}`, type: "FIXED_AMOUNT", amount_money: { amount: z.desconto, currency: "USD" }, scope: "ORDER" }];
  const o = await square("/v2/orders", { method: "POST", body: { idempotency_key: `zo-${z.id}`, order } });
  if (!o.ok) throw new Error("square pedido " + JSON.stringify((o.data && o.data.errors) || o.status).slice(0, 200));
  const ord = o.data.order;
  if (ord.total_money.amount > 0) {
    const p = await square("/v2/payments", {
      method: "POST",
      body: {
        idempotency_key: `zp-${z.id}`,
        source_id: "EXTERNAL",
        external_details: { type: "BANK_TRANSFER", source: "Zelle", source_id: z.id },
        amount_money: { amount: ord.total_money.amount, currency: "USD" },
        order_id: ord.id, location_id: cfg.locationId, buyer_email_address: z.email, reference_id: z.id,
        note: `Zelle ${z.id} · ${ev.marca || "Método REI"} ${ev.cidade} · ${t.nome} × ${z.qtd}`.slice(0, 500),
        autocomplete: true,
      },
    });
    if (!p.ok) throw new Error("square pagamento " + JSON.stringify((p.data && p.data.errors) || p.status).slice(0, 200));
  }
  const pre = !z.idioma || z.idioma === "pt" ? "" : `/${z.idioma}`;
  return { ev, t, pedido: ord.id, link: `${SITE()}${pre}/pedido?o=${encodeURIComponent(ord.id)}&k=${chavePedido(ord.id)}`, titulares };
}

const TXT = {
  pt: { assunto: (n) => `Seus ingressos · ${n}`, ola: (n) => `Olá, ${n}!`, ok: "Recebemos o seu Zelle e a sua vaga está confirmada.", ver: "Ver meus ingressos (QR code)", qr: "Apresente o QR code na entrada (no celular ou impresso).", quando: "Quando", onde: "Onde", ingresso: "Ingresso", codigo: "Código", duvidas: "Dúvidas? Responda este e-mail ou fale com a gente no WhatsApp +1 305-370-5595." },
  en: { assunto: (n) => `Your tickets · ${n}`, ola: (n) => `Hi ${n}!`, ok: "We received your Zelle payment and your spot is confirmed.", ver: "View my tickets (QR code)", qr: "Show the QR code at the entrance (on your phone or printed).", quando: "When", onde: "Where", ingresso: "Ticket", codigo: "Code", duvidas: "Questions? Reply to this email or reach us on WhatsApp +1 305-370-5595." },
  es: { assunto: (n) => `Tus entradas · ${n}`, ola: (n) => `¡Hola, ${n}!`, ok: "Recibimos tu Zelle y tu lugar está confirmado.", ver: "Ver mis entradas (código QR)", qr: "Muestra el código QR en la entrada (en el celular o impreso).", quando: "Cuándo", onde: "Dónde", ingresso: "Entrada", codigo: "Código", duvidas: "¿Dudas? Responde este correo o escríbenos por WhatsApp +1 305-370-5595." },
};

function emailHtml(z, r) {
  const T = TXT[z.idioma] || TXT.pt, ev = r.ev;
  const nome = `${ev.marca || "Método REI"} ${ev.cidade}`;
  const l = ev.local || {};
  const onde = [l.nome, l.endereco].filter(Boolean).join(" · ") || `${ev.cidade}, ${ev.uf}`;
  const quando = `${ev.datas_texto} · ${(ev.horarios || []).join(" · ")}`;
  const ingressos = r.titulares.map((p, i) => `<tr><td style="padding:6px 0;color:#555">${T.ingresso} ${i + 1}</td><td style="padding:6px 0"><b>${esc(p.nome)}</b></td><td style="padding:6px 0;font-family:monospace">${codigoIngresso(r.pedido, i + 1)}</td></tr>`).join("");
  return {
    assunto: T.assunto(nome),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;font-size:15px;line-height:1.55">
<p style="font-size:12px;letter-spacing:.2em;color:#9a7a34;text-transform:uppercase;margin:0 0 6px">Método REI</p>
<h1 style="font-size:24px;margin:0 0 16px">${esc(nome)} · ${esc(r.t.nome)}</h1>
<p>${esc(T.ola(z.comprador.split(/\s+/)[0]))}</p>
<p>${esc(T.ok)}</p>
<p><b>${T.quando}:</b> ${esc(quando)}<br><b>${T.onde}:</b> ${esc(onde)}</p>
<table style="width:100%;border-collapse:collapse;margin:10px 0 18px">${ingressos}</table>
<p style="text-align:center;margin:24px 0"><a href="${esc(r.link)}" style="display:inline-block;background:#C9A866;color:#111;text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:6px">${esc(T.ver)}</a></p>
<p style="color:#555">${esc(T.qr)}</p>
<p style="color:#555">${esc(T.duvidas)}</p>
</div>`,
  };
}

async function enviarEmail(z, r) {
  if (!ghlAtivo()) throw new Error("sem chave do Salee.ai");
  const loc = process.env.GHL_LOCATION_ID;
  const partes = z.comprador.trim().split(/\s+/);
  const c = await ghl("/contacts/upsert", { method: "POST", body: { locationId: loc, email: z.email, phone: z.telefone, firstName: partes[0], lastName: partes.slice(1).join(" "), tags: ["Zelle - confirmado"] } });
  const contactId = (c.contact && c.contact.id) || c.id;
  if (!contactId) throw new Error("contato não criado");
  const { assunto, html } = emailHtml(z, r);
  await ghl("/conversations/messages", { method: "POST", body: { type: "Email", contactId, subject: assunto, html } });
}

// Confirma (idempotente): devolve a reserva atualizada com pedido, link e status do e-mail.
export async function confirmarZelle(z) {
  const r = await criarPedido(z);
  z.pedido = r.pedido;
  z.link = r.link;
  try { await enviarSalee(r.pedido, { origem: "compra" }); } catch (e) { console.error("zelle salee", e.message); }
  if (z.email_status !== "enviado") {
    try { await enviarEmail(z, r); z.email_status = "enviado"; z.email_erro = ""; }
    catch (e) { z.email_status = "erro"; z.email_erro = e.message.slice(0, 200); console.error("zelle email", e.message); }
  }
  return z;
}
