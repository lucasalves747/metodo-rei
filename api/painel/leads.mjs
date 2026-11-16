// Leads do formulário da comunidade, lidos do Salee.ai (GHL).
import { json } from "../_lib/square.mjs";
import { sessaoValida, ghlAtivo, leads, TAG_LEAD } from "../_lib/painel.mjs";
let cache = { chave: "", ate: 0, dados: null };
export default async function handler(req, res) {
  if (!sessaoValida(req)) return json(res, 401, { erro: "nao_autorizado" });
  if (!ghlAtivo()) return json(res, 200, { indisponivel: true, linhas: [] });
  const u = new URL(req.url, "http://x");
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get("desde") || "") ? `${u.searchParams.get("desde")}T00:00:00Z` : "2026-01-01T00:00:00Z";
  if (cache.chave === desde && cache.ate > Date.now() && !u.searchParams.get("novo")) return json(res, 200, cache.dados);
  try {
    const dados = { tag: TAG_LEAD, linhas: await leads(desde), gerado: new Date().toISOString() };
    cache = { chave: desde, ate: Date.now() + 60000, dados };
    json(res, 200, dados);
  } catch (e) {
    console.error("painel leads", e.message);
    json(res, 502, { erro: "ghl", detalhe: e.message });
  }
}
