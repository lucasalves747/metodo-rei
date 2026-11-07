// Dados da página de confirmação. Só responde com o link assinado (?o=&k=).
import { config, square, json, chavePedido, confere, codigoIngresso, assinaturaIngresso, evento } from "./_lib/square.mjs";
import { CATALOGO } from "./_lib/catalogo.mjs";
import { enviarSalee } from "./_lib/salee.mjs";

export default async function handler(req, res) {
  const cfg = config();
  if (!cfg.enabled) return json(res, 503, { erro: "indisponivel" });
  const u = new URL(req.url, "http://x");
  const id = u.searchParams.get("o") || "", k = u.searchParams.get("k") || "";
  if (!/^[A-Za-z0-9]{10,64}$/.test(id) || !confere(k, chavePedido(id))) return json(res, 404, { erro: "nao_encontrado" });
  const o = await square(`/v2/orders/${id}`);
  if (!o.ok || !o.data.order) return json(res, 404, { erro: "nao_encontrado" });
  const ord = o.data.order, md = ord.metadata || {};
  const ev = evento(md.evento);
  const pago = ord.state === "COMPLETED" || (ord.tenders && ord.tenders.length > 0) || (ord.total_money && ord.total_money.amount === 0);
  if (!pago) return json(res, 402, { erro: "nao_pago" });
  // se o aviso ao Salee.ai ficou pendente, aproveita a visita para reenviar
  try { await enviarSalee(id, { origem: "pagina_confirmacao" }); } catch (e) { console.error("salee", e.message); }
  const tier = md.tipo;
  const itens = (ord.line_items || []).slice().sort((a, b) => Number((a.metadata || {}).n) - Number((b.metadata || {}).n));
  const reembolsado = (ord.refunds || []).length > 0 && ord.net_amounts && ord.net_amounts.total_money && ord.net_amounts.total_money.amount <= 0;
  json(res, 200, {
    pedido: id,
    criado: ord.created_at,
    reembolsado,
    comprador: { nome: md.comprador, email: md.email },
    evento: ev ? { slug: ev.slug, cidade: ev.cidade, uf: ev.uf, inicio: ev.inicio, fim: ev.fim, horarios: ev.horarios, local: ev.local, tz: ev.tz } : { slug: md.evento },
    tipo: tier,
    tipoNome: ev && ev.tiers[tier] ? ev.tiers[tier].nome : tier,
    quantidade: itens.length,
    total: ord.total_money ? ord.total_money.amount : 0,
    desconto: ord.total_discount_money ? ord.total_discount_money.amount : 0,
    cupom: md.cupom || null,
    ingressos: itens.map((li, i) => {
      const n = Number((li.metadata || {}).n) || i + 1;
      return { n, codigo: codigoIngresso(id, n), titular: (li.metadata || {}).titular || li.note || md.comprador, qr: `MREI:${id}:${n}:${assinaturaIngresso(id, n)}` };
    }),
    entregas: (CATALOGO.entregas && CATALOGO.entregas[tier]) || [],
  });
}
