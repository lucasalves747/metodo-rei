// Vendas: Square (site, funis e outras) + carrinhos do Salee.ai em pag.metodorei.com (evento, tipo e ingressos gratuitos).
import { config, json, corpo, limpa } from "../_lib/square.mjs";
import { storeAtivo, listarZelle, lerZelle, gravar, caminhoZelle } from "../_lib/leads-store.mjs";
import { confirmarZelle } from "../_lib/zelle.mjs";
import { codigoIngresso } from "../_lib/square.mjs";
import { sessaoValida, vendas, ghlAtivo, pedidosGhl, juntar, listaEventos } from "../_lib/painel.mjs";
let cache = { chave: "", ate: 0, dados: null };

// Reservas Zelle viram linhas de pedido: pendente não soma na receita até a equipe confirmar.
function linhaZelle(z) {
  const total = z.total / 100, ok = z.status === "confirmado";
  return {
    id: z.id, numero: z.id, data: z.data, origem: "zelle", zelle_status: z.status, zelle_confirmado_em: z.confirmado_em || "",
    total, desconto: z.desconto / 100, reembolso: 0, taxa: 0, liquido: ok ? total : 0, recibo: "", ref_ghl: "",
    descricao: `${z.marca} ${z.cidade} · ${z.tipo_nome}`, metodo: "Zelle", produto: z.marca, metodo_rei: true,
    evento: z.evento, tipo: z.tipo, tipo_nome: z.tipo_nome, qtd: ok || z.status === "pendente" ? z.qtd : 0, cupom: z.cupom || "",
    utm: Object.entries(z.utm || {}).map(([k, v]) => `${k}=${v}`).join(" "), idioma: z.idioma || "",
    comprador: z.comprador, email: z.email, telefone: z.telefone, link: z.link || "", pedido_square: z.pedido || "",
    email_status: z.email_status || "", email_erro: z.email_erro || "",
    ingressos: [{ nome: z.comprador, email: z.email }, ...(z.convidados || [])].slice(0, z.qtd).map((g, i) => ({ codigo: z.pedido ? codigoIngresso(z.pedido, i + 1) : `${z.id}-${i + 1}`, titular: g.nome || z.comprador, email: g.email || "" })),
  };
}

// POST {id, status: confirmado|cancelado|pendente} → muda o status de uma reserva Zelle
async function mudarZelle(req, res) {
  let b;
  try { b = await corpo(req); } catch { return json(res, 400, { erro: "pedido" }); }
  const id = limpa(b.id, 12), status = String(b.status || "");
  if (!/^Z[0-9A-F]{6}$/.test(id) || !["confirmado", "cancelado", "pendente"].includes(status)) return json(res, 400, { erro: "dados" });
  const z = await lerZelle(id);
  if (!z) return json(res, 404, { erro: "nao_encontrado" });
  if (z.pedido && status !== "confirmado") return json(res, 409, { erro: "Já confirmado: o pedido foi criado na Square. Para desfazer, reembolse/cancele lá." });
  if (status === "confirmado") {
    try { await confirmarZelle(z); }
    catch (e) { console.error("zelle confirmar", e.message); await gravar(caminhoZelle(id), z); return json(res, 502, { erro: "Não foi possível criar o pedido: " + e.message }); }
  }
  z.status = status;
  z.confirmado_em = status === "confirmado" ? new Date().toISOString() : "";
  z.historico = [...(z.historico || []), { status, em: new Date().toISOString() }];
  await gravar(caminhoZelle(id), z);
  cache.ate = 0;
  json(res, 200, { ok: true, status, email: z.email_status || "", email_erro: z.email_erro || "" });
}

export default async function handler(req, res) {
  if (!sessaoValida(req)) return json(res, 401, { erro: "nao_autorizado" });
  if (req.method === "POST") return mudarZelle(req, res).catch((e) => { console.error("zelle status", e.message); json(res, 502, { erro: "geral" }); });
  if (!config().enabled) return json(res, 503, { erro: "square_desligada" });
  const u = new URL(req.url, "http://x");
  const d = u.searchParams.get("desde") || "";
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00Z` : "2026-01-01T00:00:00Z";
  if (cache.chave === desde && cache.ate > Date.now() && !u.searchParams.get("novo")) return json(res, 200, cache.dados);
  try {
    const [sq, gh, zs] = await Promise.all([
      vendas(desde),
      ghlAtivo() ? pedidosGhl().then((r) => ({ ok: true, vendas: r.vendas.filter((v) => v.data >= desde) }), (e) => ({ erro: e.message })) : Promise.resolve({ semToken: true }),
      storeAtivo() ? listarZelle().catch((e) => { console.error("painel zelle", e.message); return []; }) : [],
    ]);
    if (gh.erro) console.error("painel ghl", gh.erro);
    const comPedido = new Set(zs.map((z) => z.pedido).filter(Boolean));
    const linhas = [...(gh.ok ? juntar(sq.linhas, gh.vendas) : sq.linhas).filter((l) => !comPedido.has(l.id)), ...zs.filter((z) => z.data >= desde).map(linhaZelle)];
    linhas.sort((a, b) => String(b.data).localeCompare(String(a.data)));
    const dados = { ambiente: sq.ambiente, ghl: gh.ok ? "ok" : gh.semToken ? "sem_token" : `erro: ${gh.erro}`, eventos: listaEventos(), linhas, gerado: new Date().toISOString() };
    cache = { chave: desde, ate: Date.now() + 60000, dados };
    json(res, 200, dados);
  } catch (e) {
    console.error("painel vendas", e.message);
    json(res, 502, { erro: "square", detalhe: e.message });
  }
}
