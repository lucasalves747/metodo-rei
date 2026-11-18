// Formulário "Comunidade REI" da home → webhook de entrada do Salee.ai (GHL).
// O endereço do webhook fica só no servidor (variável LEAD_WEBHOOK_URL).
import { corpo, json, limpa, emailOk } from "./_lib/square.mjs";
import { storeAtivo, novoCaminho, gravar } from "./_lib/leads-store.mjs";

const refCampos = (r) => (typeof r === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(r) ? { referral_code: r } : {});
const CAMPOS_UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"];

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { erro: "metodo" });
  const url = process.env.LEAD_WEBHOOK_URL;
  let b;
  try { b = await corpo(req); } catch { return json(res, 400, { erro: "pedido" }); }
  if (b.website) return json(res, 200, { ok: true }); // armadilha anti-robô
  if (b.origem === "checkout") return checkout(b, res);
  if (!url && !storeAtivo()) return json(res, 503, { erro: "indisponivel" });

  const nome = limpa(b.nome, 80), email = limpa(b.email, 120).toLowerCase();
  const ddi = limpa(b.ddi, 6), tel = limpa(b.telefone, 30);
  const cidade = limpa(b.cidade, 80), estado = limpa(b.estado, 80);
  if (nome.length < 2 || !emailOk(email) || tel.replace(/\D/g, "").length < 6 || !cidade || !estado) return json(res, 400, { erro: "dados" });
  const partes = nome.split(/\s+/);
  const edicao = limpa(b.edicao_interesse, 60);
  const idioma = ["pt", "en", "es"].includes(b.idioma) ? b.idioma : "pt";
  const utm = b.utm && typeof b.utm === "object" ? b.utm : {};

  const payload = {
    tipo_evento: "metodo_rei.lead_comunidade",
    origem: "site_home",
    idioma,
    nome, primeiro_nome: partes[0], sobrenome: partes.slice(1).join(" "),
    email,
    telefone: `${ddi}${tel.replace(/[^\d]/g, "")}`.replace(/^\+?/, "+"),
    telefone_ddi: ddi,
    cidade,
    estado,
    profissao: limpa(b.profissao, 80),
    edicao_interesse: edicao,
    tags: ["Método REI - Lista Geral", "site", `Idioma: ${idioma.toUpperCase()}`, ...(edicao ? [`Interesse: ${edicao}`] : [])],
    pagina_url: limpa(b.pagina_url, 500),
    referrer: limpa(b.referrer, 300),
    data_envio: new Date().toISOString(),
    ...Object.fromEntries(CAMPOS_UTM.map((k) => [k, limpa(utm[k], 150)])),
    ...refCampos(b.ref),
  };
  if (payload.referral_code) payload.tags.push(`ref-${payload.referral_code}`);

  // 1) cópia no site (antes do Salee.ai, para não perder o lead se o envio falhar)
  const caminho = novoCaminho();
  let guardado = false;
  if (storeAtivo()) {
    try { await gravar(caminho, { ...payload, salee: "enviando" }); guardado = true; }
    catch (e) { console.error("lead store", e.message); }
  }

  // 2) Salee.ai
  let erro = url ? null : "sem_url";
  for (const espera of url ? [0, 700] : []) {
    if (espera) await new Promise((r) => setTimeout(r, espera));
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctl.signal });
      clearTimeout(tm);
      erro = r.ok ? null : `HTTP ${r.status}`;
    } catch (e) { erro = e.message; }
    if (!erro) break;
  }
  if (erro) console.error("lead", erro);
  if (guardado) {
    try { await gravar(caminho, { ...payload, salee: erro ? `erro: ${erro}` : "ok" }); } catch (e) { console.error("lead store", e.message); }
  }
  if (erro && !guardado) return json(res, 502, { erro: "envio" });
  json(res, 200, { ok: true });
}

// Interessado que preencheu nome/e-mail no checkout do site e ainda não pagou (o navegador também avisa o app de contatos).
async function checkout(b, res) {
  if (!storeAtivo()) return json(res, 200, { ok: true });
  const nome = limpa(b.nome, 80), email = limpa(b.email, 120).toLowerCase();
  if (nome.length < 2 || !emailOk(email)) return json(res, 400, { erro: "dados" });
  const partes = nome.split(/\s+/);
  const utm = b.utm && typeof b.utm === "object" ? b.utm : {};
  const lead = {
    tipo_evento: "metodo_rei.lead_checkout", origem: "checkout_site",
    idioma: ["pt", "en", "es"].includes(b.idioma) ? b.idioma : "pt",
    nome, primeiro_nome: partes[0], sobrenome: partes.slice(1).join(" "), email,
    telefone: limpa(b.telefone, 30), evento_slug: limpa(b.evento, 40), edicao_interesse: limpa(b.edicao, 60),
    ingresso_tipo: limpa(b.tier, 20), pagina_url: limpa(b.pagina_url, 500), referrer: limpa(b.referrer, 300),
    data_envio: new Date().toISOString(),
    ...Object.fromEntries(CAMPOS_UTM.map((k) => [k, limpa(utm[k], 150)])),
    ...refCampos(b.ref),
  };
  try { await gravar(novoCaminho(), lead); } catch (e) { console.error("lead store", e.message); return json(res, 502, { erro: "envio" }); }
  json(res, 200, { ok: true });
}
