// Varredura diária (Vercel Cron): reenvia ao Salee.ai os pedidos que ficaram pendentes.
import { config, json, confere } from "../_lib/square.mjs";
import { pendentes, enviarSalee } from "../_lib/salee.mjs";
export default async function handler(req, res) {
  const auth = req.headers.authorization || "";
  const ok = (process.env.CRON_SECRET && confere(auth, `Bearer ${process.env.CRON_SECRET}`));
  if (!ok) return json(res, 401, { erro: "nao_autorizado" });
  if (!config().enabled) return json(res, 200, { ok: true, desligado: true });
  const lista = await pendentes(14);
  const resultados = [];
  for (const p of lista.slice(0, 40)) resultados.push({ pedido: p.pedido, ...(await enviarSalee(p.pedido, { origem: "varredura" })) });
  json(res, 200, { ok: true, pendentes: lista.length, reenviados: resultados });
}
