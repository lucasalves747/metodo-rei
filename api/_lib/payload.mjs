// Aviso de compra enviado ao Salee.ai (GHL). Campos "planos" no topo (fáceis de mapear no GHL)
// + listas de ingressos/convidados.
export function montarPayload({ cfg, ev, q, t, ord, pagamento, nome, email, telefone, lang, link, ingressos, utm }) {
  const partes = nome.trim().split(/\s+/);
  const card = (pagamento && pagamento.card_details && pagamento.card_details.card) || {};
  const din = (c) => Math.round(c) / 100;
  const convidados = ingressos.filter((x) => x.n > 1 && x.convidado);
  return {
    tipo_evento: "metodo_rei.pedido_pago",
    ambiente: cfg.env, // "sandbox" = compra de teste
    idioma: lang,
    // comprador
    nome, primeiro_nome: partes[0], sobrenome: partes.slice(1).join(" "), email, telefone,
    // evento
    evento_slug: ev.slug, evento_nome: `Método REI ${ev.cidade}`, evento_cidade: ev.cidade, evento_estado: ev.uf,
    evento_data: ev.datas_texto, evento_inicio: ev.inicio, evento_fim: ev.fim, evento_horarios: (ev.horarios || []).join(" · "),
    evento_local: [ev.local.nome, ev.local.endereco].filter(Boolean).join(" · "),
    // ingresso
    ingresso_tipo: t.nome, ingresso_tipo_id: q.tier, quantidade: q.qty,
    valor_unitario: din(q.unit), subtotal: din(q.subtotal), desconto: din(q.desconto), total: din(q.total), moeda: "USD",
    cupom: q.cupom ? q.cupom.codigo : "",
    // pedido e pagamento
    pedido_id: ord.id, pedido_numero: ord.id.slice(-8).toUpperCase(), pedido_data: ord.created_at,
    pagamento_id: pagamento ? pagamento.id : "", pagamento_status: pagamento ? pagamento.status : "SEM_COBRANCA",
    pagamento_metodo: pagamento ? (pagamento.wallet_details ? (pagamento.wallet_details.brand || "WALLET") : pagamento.source_type || "CARD") : "CUPOM_100",
    cartao_bandeira: card.card_brand || "", cartao_final: card.last_4 || "",
    recibo_url: pagamento ? pagamento.receipt_url || "" : "",
    link_confirmacao: link,
    // ingressos (todos no nome do comprador; convidados com e-mail recebem o próprio)
    ingressos: ingressos.map(({ n, codigo, titular, email }) => ({ n, codigo, titular, email: email || "" })),
    convidados: convidados.map((x) => ({ nome: x.titular, email: x.email, codigo: x.codigo })),
    convidados_nomes: convidados.map((x) => x.titular).join(", "),
    convidados_emails: convidados.map((x) => x.email).join(", "),
    // origem
    utm_source: utm.utm_source || "", utm_medium: utm.utm_medium || "", utm_campaign: utm.utm_campaign || "", utm_content: utm.utm_content || "", utm_term: utm.utm_term || "",
    tags: ["Método REI - Comprou", `Método REI - ${ev.cidade} ${ev.ano}`, `Método REI ${ev.cidade} - ${t.nome}`, `Idioma: ${lang.toUpperCase()}`],
  };
}
