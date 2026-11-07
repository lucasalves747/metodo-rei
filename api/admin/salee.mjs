// Painel simples: lista pedidos não entregues ao Salee.ai e permite reenviar.
//   GET  /api/admin/salee?token=…                → lista pendentes
//   POST /api/admin/salee?token=…&pedido=ID       → reenvia um pedido (mesmo se já entregue)
//   POST /api/admin/salee?token=…&todos=1         → reenvia todos os pendentes
import { config, json, confere } from "../_lib/square.mjs";
import { pendentes, enviarSalee, lerStatus } from "../_lib/salee.mjs";
export default async function handler(req, res) {
  const u = new URL(req.url, "http://x");
  const token = u.searchParams.get("token") || (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!process.env.ADMIN_TOKEN || !confere(token, process.env.ADMIN_TOKEN)) return json(res, 401, { erro: "nao_autorizado" });
  if (!config().enabled) return json(res, 503, { erro: "indisponivel" });
  const pedido = u.searchParams.get("pedido");
  if (req.method === "GET") {
    if (pedido) return json(res, 200, { pedido, ...(await lerStatus(pedido)) });
    return json(res, 200, { pendentes: await pendentes(30) });
  }
  if (req.method !== "POST") return json(res, 405, { erro: "metodo" });
  if (pedido) return json(res, 200, { pedido, ...(await enviarSalee(pedido, { origem: "manual", forcar: true })) });
  if (u.searchParams.get("todos")) {
    const lista = await pendentes(30), r = [];
    for (const p of lista.slice(0, 40)) r.push({ pedido: p.pedido, ...(await enviarSalee(p.pedido, { origem: "manual" })) });
    return json(res, 200, { reenviados: r });
  }
  json(res, 400, { erro: "informe pedido ou todos=1" });
}
