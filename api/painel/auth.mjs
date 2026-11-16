// POST {senha} → entra · DELETE → sai · GET → sessão ativa?
import { corpo, json } from "../_lib/square.mjs";
import { senhaConfere, abrirSessao, fecharSessao, sessaoValida } from "../_lib/painel.mjs";
export default async function handler(req, res) {
  if (req.method === "GET") return json(res, 200, { ok: sessaoValida(req), configurado: Boolean(process.env.PAINEL_SENHA) });
  if (req.method === "DELETE") { fecharSessao(res); return json(res, 200, { ok: true }); }
  if (req.method !== "POST") return json(res, 405, { erro: "metodo" });
  let b;
  try { b = await corpo(req); } catch { return json(res, 400, { erro: "pedido" }); }
  if (!senhaConfere(String(b.senha || ""))) {
    await new Promise((r) => setTimeout(r, 800));
    return json(res, 401, { erro: "senha" });
  }
  abrirSessao(res);
  json(res, 200, { ok: true });
}
