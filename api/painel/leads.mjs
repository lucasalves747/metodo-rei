// Leads do Salee.ai: formulário da home, checkout do site sem pagamento e carrinhos não pagos em pag.metodorei.com.
import { json } from "../_lib/square.mjs";
import { sessaoValida, ghlAtivo, leads } from "../_lib/painel.mjs";
let cache = { ate: 0, linhas: null };
export default async function handler(req, res) {
  if (!sessaoValida(req)) return json(res, 401, { erro: "nao_autorizado" });
  if (!ghlAtivo()) return json(res, 200, { indisponivel: true, linhas: [] });
  const u = new URL(req.url, "http://x");
  const d = u.searchParams.get("desde") || "";
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00Z` : "2026-01-01T00:00:00Z";
  try {
    if (!(cache.ate > Date.now()) || u.searchParams.get("novo")) cache = { ate: Date.now() + 60000, linhas: await leads() };
    json(res, 200, { linhas: cache.linhas.filter((l) => String(l.data) >= desde), gerado: new Date().toISOString() });
  } catch (e) {
    console.error("painel leads", e.message);
    json(res, 502, { erro: "ghl", detalhe: e.message });
  }
}
