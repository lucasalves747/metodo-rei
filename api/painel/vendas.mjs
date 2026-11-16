// Vendas da conta Square (site + pag.metodorei.com + outras), com produto do GHL quando disponível.
import { config, json } from "../_lib/square.mjs";
import { sessaoValida, vendas, ghlAtivo, transacoesGhl, enriquecer, listaEventos } from "../_lib/painel.mjs";
let cache = { chave: "", ate: 0, dados: null };
export default async function handler(req, res) {
  if (!sessaoValida(req)) return json(res, 401, { erro: "nao_autorizado" });
  if (!config().enabled) return json(res, 503, { erro: "square_desligada" });
  const u = new URL(req.url, "http://x");
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get("desde") || "") ? `${u.searchParams.get("desde")}T00:00:00Z` : "2026-01-01T00:00:00Z";
  if (cache.chave === desde && cache.ate > Date.now() && !u.searchParams.get("novo")) return json(res, 200, cache.dados);
  try {
    const { ambiente, linhas } = await vendas(desde);
    let ghl = ghlAtivo() ? "ok" : "sem_token";
    if (ghlAtivo()) {
      try { enriquecer(linhas, await transacoesGhl(desde)); }
      catch (e) { console.error("painel ghl", e.message); ghl = `erro: ${e.message}`; }
    }
    const dados = { ambiente, ghl, eventos: listaEventos(), linhas, gerado: new Date().toISOString() };
    cache = { chave: desde, ate: Date.now() + 60000, dados };
    json(res, 200, dados);
  } catch (e) {
    console.error("painel vendas", e.message);
    json(res, 502, { erro: "square", detalhe: e.message });
  }
}
