// SEO, AIO (dados estruturados + llms.txt), Open Graph/Twitter e favicons.
// Usado por build.mjs — não precisa rodar sozinho.

import { IDIOMAS, HTML_LANG, OG_LOCALE, prefixo } from "./i18n.mjs";
import { L } from "./textos.mjs";

// URL de uma página em cada idioma ("" = home, "/orlando"...)
const urlDe = (site, lang, caminho) => `${site.url}${prefixo(lang) + caminho || "/"}`;
function alternates(site, caminho) {
  return [...IDIOMAS.map((l) => `<link rel="alternate" hreflang="${HTML_LANG[l]}" href="${urlDe(site, l, caminho)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${urlDe(site, "pt", caminho)}" />`].join("\n");
}
const ogImg = (site, lang, nome) => `${site.url}/assets/og/${lang === "pt" ? "" : lang + "/"}${nome}.jpg`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const strip = (s) => String(s).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// UF → fuso IANA (usado para o horário certo no schema do evento)
export const FUSOS = {
  FL: "America/New_York", MA: "America/New_York", NY: "America/New_York", NJ: "America/New_York", GA: "America/New_York",
  NC: "America/New_York", SC: "America/New_York", VA: "America/New_York", PA: "America/New_York", CT: "America/New_York",
  TX: "America/Chicago", IL: "America/Chicago", TN: "America/Chicago", MN: "America/Chicago",
  CO: "America/Denver", UT: "America/Denver", AZ: "America/Phoenix",
  CA: "America/Los_Angeles", WA: "America/Los_Angeles", NV: "America/Los_Angeles", OR: "America/Los_Angeles",
};

function offset(iana, isoDate) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: iana, timeZoneName: "longOffset" });
  const part = f.formatToParts(new Date(`${isoDate}T12:00:00Z`)).find((p) => p.type === "timeZoneName").value;
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(part);
  return m ? `${m[1]}:${m[2] || "00"}` : "-05:00";
}

// "6:30pm" → "18:30"
function hora24(s) {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(s || "");
  if (!m) return null;
  let h = +m[1] % 12;
  if (m[3].toLowerCase() === "pm") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2] || "00"}`;
}

function horarios(ev) {
  const h = ev.horarios || [];
  const primeiro = (h[0] || "").split(/[–-]/);
  const ultimo = (h[h.length - 1] || "").split(/[–-]/);
  return { ini: hora24(primeiro[0]) || "09:00", fim: hora24(ultimo[1]) || "18:00" };
}

export function precosDe(data, ev) {
  return { ...data.precos_padrao, ...(ev.precos || {}) };
}

function favicons() {
  return `<link rel="icon" href="/favicon.ico" sizes="32x32" />
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="#080808" />`;
}

function social({ url, titulo, descricao, imagem, alt, tipo = "website", site, lang, caminho }) {
  return `<link rel="canonical" href="${url}" />
${alternates(site, caminho)}
<meta name="robots" content="index, follow, max-image-preview:large" />
<meta property="og:type" content="${tipo}" />
<meta property="og:site_name" content="${esc(site.nome)}" />
<meta property="og:locale" content="${OG_LOCALE[lang]}" />
${IDIOMAS.filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${OG_LOCALE[l]}" />`).join("\n")}
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(titulo)}" />
<meta property="og:description" content="${esc(descricao)}" />
<meta property="og:image" content="${imagem}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${esc(alt)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(titulo)}" />
<meta name="twitter:description" content="${esc(descricao)}" />
<meta name="twitter:image" content="${imagem}" />`;
}

const jsonld = (obj) => `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/</g, "\\u003c")}\n</script>`;

function organizacao(site, lang = "pt") {
  return {
    "@type": "Organization",
    "@id": `${site.url}/#org`,
    name: site.nome,
    url: `${site.url}/`,
    logo: `${site.url}/assets/logo-metodo-rei.png`,
    description: (site[lang] && site[lang].descricao) || site.descricao,
    ...(site.redes && site.redes.length ? { sameAs: site.redes } : {}),
    ...(site.whatsapp ? { contactPoint: { "@type": "ContactPoint", telephone: site.whatsapp, contactType: "customer service", availableLanguage: ["Portuguese", "English", "Spanish"] } } : {}),
  };
}

// Tudo que uma página de evento precisa no <head>
export function eventoSchema(data, ev, d, ids, lang, pv) {
  const site = data.site;
  const T = L[lang];
  const caminho = `/${ev.slug}`;
  const url = urlDe(site, lang, caminho);
  const fuso = ev.fuso || FUSOS[ev.uf] || "America/New_York";
  const h = horarios(ev);
  const start = `${ev.inicio}T${h.ini}:00${offset(fuso, ev.inicio)}`;
  const end = `${ev.fim}T${h.fim}:00${offset(fuso, ev.fim)}`;
  const precos = precosDe(data, ev);
  const nomes = ids.map((id) => data.preletores[id].nome);
  const l = ev.local || {};
  const nomesTxt = nomes.length > 2 ? T.eMais(nomes.slice(0, 2).join(", "), nomes.length - 2) : T.lista(nomes);
  const prevenda = ev.prevenda !== undefined ? ev.prevenda : true;
  const quando = d.nDias === 1 ? `${d.dias.toLowerCase()}, ${d.texto}` : d.texto;
  const onde = l.endereco ? l.endereco.replace(/\s+\d{5}$/, "") : `${ev.cidade}, ${ev.uf}`;
  const duracao = d.nDias === 1 ? T.umDia : T.nDias(d.nDias);
  const min = Math.min(precos.standard.por, precos.vip.por, precos.rei.por);

  const titulo = `Método REI ${ev.cidade} · ${d.texto}${prevenda ? T.pvSufixo : ""}`;
  const descricao = ev.seo_descricao || T.seoEvento({ duracao, onde, quando, nomes: nomesTxt, min });
  const imagem = ogImg(site, lang, ev.slug);
  const alt = `Método REI ${ev.cidade} — ${d.texto}`;

  const location = {
    "@type": "Place",
    name: l.nome && !/a definir/i.test(l.nome) ? l.nome : `${ev.cidade}, ${ev.uf}`,
    address: l.endereco
      ? { "@type": "PostalAddress", streetAddress: l.endereco.split(",")[0].trim(), addressLocality: (l.endereco.split(",")[1] || ev.cidade).trim(), addressRegion: ev.uf, ...(/\d{5}/.test(l.endereco) ? { postalCode: l.endereco.match(/\d{5}/)[0] } : {}), addressCountry: "US" }
      : { "@type": "PostalAddress", addressLocality: ev.cidade, addressRegion: ev.uf, addressCountry: "US" },
  };
  const offers = [
    ["Standard", "standard"], ["VIP", "vip"], ["REI", "rei"],
  ].map(([nome, k]) => ({
    "@type": "Offer",
    name: T.ingresso(nome),
    price: String(precos[k].por),
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    url: (ev.checkout && ev.checkout[k]) || `https://pag.metodorei.com/${{ standard: `cart-${ev.slug}`, vip: `cart-vip-${ev.slug}`, rei: `cart-${ev.slug}-rei` }[k]}`,
  }));
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      organizacao(site, lang),
      {
        "@type": "Event",
        "@id": `${url}#evento`,
        name: `Método REI ${ev.cidade} ${d.ano}`,
        description: strip(descricao),
        startDate: start,
        endDate: end,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        inLanguage: "pt-BR", // a imersão é apresentada em português
        url,
        image: [imagem],
        location,
        organizer: { "@id": `${site.url}/#org` },
        performer: ids.map((id) => ({ "@type": "Person", name: data.preletores[id].nome, jobTitle: strip(pv(id).funcao) })),
        offers,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Método REI", item: urlDe(site, lang, "") },
          { "@type": "ListItem", position: 2, name: ev.cidade, item: url },
        ],
      },
    ],
  };
  const head = `<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}" />
${social({ url, titulo, descricao, imagem, alt, site, lang, caminho })}
${favicons()}
${jsonld(schema)}`;
  return { head, titulo, descricao, url, start, end, nomes, min, quando, onde };
}

export function homeHead(data, proximos, lang, agenda = proximos) {
  const site = data.site;
  const T = L[lang];
  const home = urlDe(site, lang, "");
  const cidades = [...new Set(agenda.map((r) => r.ev.cidade))];
  const titulo = T.homeTitulo([...new Set(agenda.map((r) => r.d.ano))].join("/"));
  const descricao = T.homeDesc(T.lista(cidades));
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      organizacao(site, lang),
      { "@type": "WebSite", "@id": `${site.url}/#site`, url: `${site.url}/`, name: site.nome, inLanguage: IDIOMAS.map((l) => HTML_LANG[l]), publisher: { "@id": `${site.url}/#org` } },
      {
        "@type": "ItemList",
        name: T.proximas,
        itemListElement: proximos.map((r, i) => ({ "@type": "ListItem", position: i + 1, url: urlDe(site, lang, `/${r.ev.slug}`), name: `Método REI ${r.ev.cidade} — ${r.d.texto}` })),
      },
    ],
  };
  return `<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}" />
${social({ url: home, titulo, descricao, imagem: ogImg(site, lang, "home"), alt: T.homeAlt, site, lang, caminho: "" })}
${favicons()}
${jsonld(schema)}`;
}

export function sitemap(data, slugs) {
  const site = data.site;
  const hoje = new Date().toISOString().slice(0, 10);
  const caminhos = ["", ...slugs.map((s) => `/${s}`)];
  const alt = (c) => IDIOMAS.map((l) => `\n    <xhtml:link rel="alternate" hreflang="${HTML_LANG[l]}" href="${urlDe(site, l, c)}"/>`).join("");
  const urls = caminhos.flatMap((c) => IDIOMAS.map((l) => `  <url><loc>${urlDe(site, l, c)}</loc><lastmod>${hoje}</lastmod>${alt(c)}\n  </url>`));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`;
}

export function robots(data) {
  return `# Método REI — todos os buscadores e assistentes de IA são bem-vindos
User-agent: *
Allow: /

Sitemap: ${data.site.url}/sitemap.xml
`;
}

// llms.txt — resumo em texto para assistentes de IA (ChatGPT, Claude, Perplexity, Gemini…)
export function llms(data, proximos, passados) {
  const site = data.site;
  const linha = (r) => {
    const s = r.seo;
    return `- [Método REI ${r.ev.cidade} — ${r.d.texto}](${s.url}): ${s.quando}, ${s.onde}. Horário: ${r.d.horario}. Mentores: ${s.nomes.join(", ")}. Ingressos a partir de US$${s.min}.`;
  };
  const ids = [...new Set(proximos.flatMap((r) => r.ids))];
  return `# Método REI

> ${site.descricao}

O Método REI é uma imersão presencial em português para empresários e profissionais brasileiros nos Estados Unidos. O nome resume os três pilares: **Reinar** (assumir o governo da própria vida, decisões e resultados), **Enriquecer** (mentalidade de riqueza e prosperidade com inteligência e propósito) e **Identidade** (descobrir quem você é e alinhar a vida ao seu propósito). A tese central: a verdadeira prosperidade é crescer financeiramente sem sacrificar família, saúde e direção.

Criado por Hewerton Scheidegger. Ingressos em três categorias: Standard, VIP e REI.

## Próximas edições

${proximos.map(linha).join("\n") || "- Novas datas em breve."}

## Mentores

${ids.map((id) => `- ${data.preletores[id].nome} — ${strip(data.preletores[id].funcao)}. ${strip(data.preletores[id].bio)}`).join("\n")}

## Links

- [Site oficial (português)](${site.url}/)
- [Official site (English)](${site.url}/en)
- [Sitio oficial (español)](${site.url}/es)
- [Contato pelo WhatsApp](https://wa.me/${(site.whatsapp || "").replace(/\D/g, "")})
${passados.length ? `\n## Edições anteriores\n\n${passados.map((r) => `- [Método REI ${r.ev.cidade} — ${r.d.texto}](${r.seo.url})`).join("\n")}\n` : ""}`;
}
