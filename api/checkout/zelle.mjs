// Reserva com pagamento por Zelle: grava os dados do comprador e o pedido fica "pendente" no painel até a equipe confirmar o Zelle.
import crypto from "node:crypto";
import { cotar, corpo, json, limpa, emailOk } from "../_lib/square.mjs";
import { storeAtivo, gravar, caminhoZelle } from "../_lib/leads-store.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { erro: "metodo" });
  if (!storeAtivo()) return json(res, 503, { erro: "indisponivel" });
  let b;
  try { b = await corpo(req); } catch { return json(res, 400, { erro: "pedido" }); }
  const q = cotar(b);
  if (q.erro) return json(res, 400, { erro: q.erro });
  if (!q.ev.zelle) return json(res, 400, { erro: "zelle" });
  if (b.cupom && q.cupomErro) return json(res, 400, { erro: "cupom", cupomErro: q.cupomErro });
  const nome = limpa(b.comprador && b.comprador.nome, 80);
  const email = limpa(b.comprador && b.comprador.email, 120).toLowerCase();
  const telefone = limpa(b.comprador && b.comprador.telefone, 30);
  if (!nome || !emailOk(email) || telefone.replace(/\D/g, "").length < 7) return json(res, 400, { erro: "dados" });
  const lang = ["pt", "en", "es"].includes(b.lang) ? b.lang : "pt";
  const convidados = (Array.isArray(b.convidados) ? b.convidados.slice(0, q.qty - 1) : [])
    .map((g) => ({ nome: limpa(g && g.nome, 80), email: limpa(g && g.email, 120).toLowerCase() })).filter((g) => g.nome || g.email);
  const id = "Z" + crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
  const utm = b.utm && typeof b.utm === "object" ? Object.fromEntries(Object.entries(b.utm).slice(0, 8).map(([k, v]) => [limpa(k, 30), limpa(v, 120)])) : {};
  const reserva = {
    id, data: new Date().toISOString(), status: "pendente",
    evento: q.ev.slug, marca: q.ev.marca || "Método REI", cidade: q.ev.cidade, tipo: q.tier, tipo_nome: q.t.nome, qtd: q.qty,
    unit: q.unit, subtotal: q.subtotal, desconto: q.desconto, total: q.total, cupom: q.cupom ? q.cupom.codigo : "",
    comprador: nome, email, telefone, idioma: lang, convidados, utm, ref: limpa(b.ref, 60),
  };
  try { await gravar(caminhoZelle(id), reserva); }
  catch (e) { console.error("zelle gravar", e.message); return json(res, 502, { erro: "geral" }); }
  json(res, 200, { ok: true, id, total: q.total, zelle: q.ev.zelle });
}
