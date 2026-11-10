// Formulário "Comunidade REI" da home → webhook de entrada do Salee.ai (GHL).
// O endereço do webhook fica só no servidor (variável LEAD_WEBHOOK_URL).
import { corpo, json, limpa, emailOk } from "./_lib/square.mjs";

const CAMPOS_UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"];

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { erro: "metodo" });
  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) return json(res, 503, { erro: "indisponivel" });
  let b;
  try { b = await corpo(req); } catch { return json(res, 400, { erro: "pedido" }); }
  if (b.website) return json(res, 200, { ok: true }); // armadilha anti-robô

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
  };

  let erro = null;
  for (const espera of [0, 700]) {
    if (espera) await new Promise((r) => setTimeout(r, espera));
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctl.signal });
      clearTimeout(tm);
      erro = r.ok ? null : `HTTP ${r.status}`;
    } catch (e) { erro = e.message; }
    if (!erro) break;
  }
  if (erro) { console.error("lead", erro); return json(res, 502, { erro: "envio" }); }
  json(res, 200, { ok: true });
}
