// Vendas: Square (site, funis e outras) + carrinhos do Salee.ai em pag.metodorei.com (evento, tipo e ingressos gratuitos).
import { config, json } from "../_lib/square.mjs";
import { sessaoValida, vendas, ghlAtivo, pedidosGhl, juntar, listaEventos } from "../_lib/painel.mjs";
let cache = { chave: "", ate: 0, dados: null };
export default async function handler(req, res) {
  if (!sessaoValida(req)) return json(res, 401, { erro: "nao_autorizado" });
  if (!config().enabled) return json(res, 503, { erro: "square_desligada" });
  const u = new URL(req.url, "http://x");
  const d = u.searchParams.get("desde") || "";
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00Z` : "2026-01-01T00:00:00Z";
  if (cache.chave === desde && cache.ate > Date.now() && !u.searchParams.get("novo")) return json(res, 200, cache.dados);
  try {
    const [sq, gh] = await Promise.all([
      vendas(desde),
      ghlAtivo() ? pedidosGhl().then((r) => ({ ok: true, vendas: r.vendas.filter((v) => v.data >= desde) }), (e) => ({ erro: e.message })) : Promise.resolve({ semToken: true }),
    ]);
    if (gh.erro) console.error("painel ghl", gh.erro);
    const linhas = gh.ok ? juntar(sq.linhas, gh.vendas) : sq.linhas;
    linhas.sort((a, b) => String(b.data).localeCompare(String(a.data)));
    const dados = { ambiente: sq.ambiente, ghl: gh.ok ? "ok" : gh.semToken ? "sem_token" : `erro: ${gh.erro}`, eventos: listaEventos(), linhas, gerado: new Date().toISOString() };
    cache = { chave: desde, ate: Date.now() + 60000, dados };
    json(res, 200, dados);
  } catch (e) {
    console.error("painel vendas", e.message);
    json(res, 502, { erro: "square", detalhe: e.message });
  }
}
