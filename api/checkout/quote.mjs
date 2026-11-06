import { cotar, corpo, json } from "../_lib/square.mjs";
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { erro: "metodo" });
  try {
    const b = await corpo(req);
    const q = cotar(b);
    if (q.erro) return json(res, 400, { erro: q.erro });
    json(res, 200, { unit: q.unit, qty: q.qty, subtotal: q.subtotal, desconto: q.desconto, total: q.total, cupom: q.cupom, cupomErro: q.cupomErro });
  } catch (e) {
    json(res, 400, { erro: "pedido" });
  }
}
