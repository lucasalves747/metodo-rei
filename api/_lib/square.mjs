// Funções do servidor (Vercel) para o checkout Square do Método REI.
// Preços e cupons vêm de api/_lib/catalogo.mjs (gerado por eventos/build.mjs a partir de eventos.json) —
// nunca do navegador.
import crypto from "node:crypto";
import { CATALOGO } from "./catalogo.mjs";

const ENV = (process.env.SQUARE_ENV || "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
const BASE = ENV === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
const SQUARE_VERSION = "2025-10-16";

export const config = () => ({
  enabled: Boolean(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_APP_ID && process.env.SQUARE_LOCATION_ID && process.env.TICKET_SECRET),
  env: ENV,
  appId: process.env.SQUARE_APP_ID || "",
  locationId: process.env.SQUARE_LOCATION_ID || "",
});

export async function square(path, { method = "GET", body } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`, "Square-Version": SQUARE_VERSION, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

// ---------- assinatura dos links e ingressos ----------
const hmac = (s) => crypto.createHmac("sha256", process.env.TICKET_SECRET || "").update(s).digest("base64url");
export const chavePedido = (orderId) => hmac(`pedido:${orderId}`).slice(0, 22);
export const assinaturaIngresso = (orderId, n) => hmac(`ingresso:${orderId}:${n}`).slice(0, 12);
export const codigoIngresso = (orderId, n) => `MR-${orderId.slice(-6).toUpperCase()}-${String(n).padStart(2, "0")}`;
export function confere(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---------- preços e cupons ----------
export function evento(slug) {
  const ev = CATALOGO.eventos[slug];
  if (!ev) return null;
  return ev;
}

export function cotar({ slug, tier, qty, cupom }) {
  const ev = evento(slug);
  if (!ev) return { erro: "evento" };
  if (new Date(ev.fim + "T23:59:59-05:00") < new Date()) return { erro: "encerrado" };
  const t = ev.tiers[tier];
  if (!t) return { erro: "tier" };
  const q = Math.max(1, Math.min(10, parseInt(qty, 10) || 1));
  const unit = Math.round(t.preco * 100);
  const subtotal = unit * q;
  let desconto = 0, cupomOk = null, cupomErro = null;
  const code = String(cupom || "").trim().toUpperCase();
  if (code) {
    const c = CATALOGO.cupons.find((x) => x.codigo.toUpperCase() === code);
    const hoje = new Date();
    if (!c || (c.somente_teste && ENV === "production")) cupomErro = "invalido";
    else if (c.valido_ate && new Date(c.valido_ate + "T23:59:59-05:00") < hoje) cupomErro = "expirado";
    else if (c.eventos && c.eventos.length && !c.eventos.includes(slug)) cupomErro = "nao_aplica";
    else if (c.tiers && c.tiers.length && !c.tiers.includes(tier)) cupomErro = "nao_aplica";
    else {
      desconto = c.tipo === "percentual" ? Math.round(subtotal * c.valor / 100) : Math.round(c.valor * 100 * (c.por_ingresso ? q : 1));
      desconto = Math.min(desconto, subtotal);
      cupomOk = { codigo: c.codigo, tipo: c.tipo, valor: c.valor, por_ingresso: !!c.por_ingresso };
    }
  }
  return { ev, t, tier, qty: q, unit, subtotal, desconto, total: subtotal - desconto, cupom: cupomOk, cupomErro };
}

// ---------- utilidades HTTP ----------
export async function corpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}
export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}
export const limpa = (s, max = 120) => String(s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
export const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
