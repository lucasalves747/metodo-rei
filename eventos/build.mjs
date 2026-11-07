#!/usr/bin/env node
// Gera as páginas de evento e a lista "Próximos eventos" da home a partir de eventos/eventos.json.
// Uso:  node eventos/build.mjs          (gera tudo)
//       node eventos/build.mjs --check  (só valida o JSON)
// Sem dependências. As páginas geradas são HTML estático normal (a Vercel não precisa de build).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eventoSchema, homeHead, sitemap, robots, llms, FUSOS } from "./seo.mjs";
import { CO, POLITICA } from "./textos-checkout.mjs";
import { HTML_LANG } from "./i18n.mjs";
import { IDIOMAS, dicionarios, traduzirModelo, localizarPagina, seletor, prefixo } from "./i18n.mjs";
import { L } from "./textos.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, "..");
const data = JSON.parse(readFileSync(join(DIR, "eventos.json"), "utf8"));
const PARTES = Object.fromEntries(["pilares", "wall", "experiencia"].map((k) => [k, readFileSync(join(DIR, "partes", `${k}.html`), "utf8").trimEnd()]));
const incluir = (t) => t.replace(/\{\{(pilares|wall|experiencia)\}\}/g, (m, k) => PARTES[k]);
const template = incluir(readFileSync(join(DIR, "template.html"), "utf8"));
const pedidoTemplate = readFileSync(join(DIR, "pedido-template.html"), "utf8");
const paginaTemplate = readFileSync(join(DIR, "pagina-template.html"), "utf8");
const homeTemplate = incluir(readFileSync(join(DIR, "home-template.html"), "utf8"));
const CHECK_ONLY = process.argv.includes("--check");

// Modelos em cada idioma. Texto sem tradução em eventos/i18n/<lang>.json para o build.
const DIC = dicionarios(DIR);
const MODELOS = { pt: { evento: template, home: homeTemplate } };
const semTraducao = [];
for (const lang of IDIOMAS.filter((l) => l !== "pt")) {
  const falta = new Set();
  MODELOS[lang] = { evento: traduzirModelo(template, DIC[lang], falta), home: traduzirModelo(homeTemplate, DIC[lang], falta) };
  for (const t of falta) semTraducao.push(`  [${lang}] ${JSON.stringify(t)}`);
}
if (semTraducao.length) {
  console.error(`\n✗ Texto sem tradução (adicione em eventos/i18n/<lang>.json):\n${semTraducao.join("\n")}\n`);
  process.exit(1);
}
data.site = { url: "https://www.metodorei.com", nome: "Método REI", ...(data.site || {}) };

const pad = (n) => String(n).padStart(2, "0");
function parseDate(iso, slug, field) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) throw new Error(`[${slug}] "${field}" precisa ser AAAA-MM-DD (recebi: ${iso})`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

// Monta todos os formatos de data a partir de inicio/fim, no idioma pedido.
function datas(ev, lang) {
  const T = L[lang];
  const a = parseDate(ev.inicio, ev.slug, "inicio");
  const b = parseDate(ev.fim, ev.slug, "fim");
  if (b < a) throw new Error(`[${ev.slug}] "fim" é antes de "inicio"`);
  const d1 = a.getUTCDate(), d2 = b.getUTCDate();
  const m1 = a.getUTCMonth(), m2 = b.getUTCMonth();
  const y = b.getUTCFullYear();
  const mesmoMes = m1 === m2 && a.getUTCFullYear() === y;
  const umDia = +a === +b;
  const wa = a.getUTCDay(), wb = b.getUTCDay();
  const dias = umDia ? T.dias[wa] : `${T.dias[wa]} ${T.e} ${T.dias[wb]}`;
  const { texto, hero, card, curta } = T.datas(d1, d2, m1, m2, y, umDia, mesmoMes);
  const codigo = `MREI${pad(d1)}${pad(m1 + 1)}${String(a.getUTCFullYear()).slice(2)}`;
  const diasCard = umDia ? T.dias[wa] : `${T.dias[wa]} · ${T.dias[wb]}`;
  const h = ev.horarios || [];
  const horario = umDia
    ? `${T.diasCurto[wa]} ${h[0] || ""}`
    : `${T.diasCurto[wa]} ${h[0] || ""} · ${T.diasCurto[wb]} ${h[1] || ""}`;
  const nDias = Math.round((b - a) / 86400000) + 1;
  return { texto, hero, card, curta, codigo, dias, diasCard, horario, horarioCard: h.join(" · ").toUpperCase(), ano: y, fimDate: b, nDias };
}

// Campos que precisam existir em todos os idiomas (se existirem em PT).
const CAMPOS_PRELETOR = ["funcao", "bio", "bio_completa", "destaque"];
const CAMPOS_EVENTO = ["selo", "destaque", "estado", "seo_descricao"];
const faltaIdioma = [];
function loc(obj, lang, campos, quem) {
  if (lang === "pt") return obj;
  const t = obj[lang] || {};
  for (const c of campos) {
    if (obj[c] === undefined) continue;
    const v = t[c];
    const ok = v !== undefined && v !== "" &&
      (!Array.isArray(obj[c]) || (Array.isArray(v) && v.length === obj[c].length && v.every(Boolean))) &&
      (typeof obj[c] !== "object" || Array.isArray(obj[c]) || Object.keys(obj[c]).every((k) => v && v[k]));
    if (!ok) faltaIdioma.push(`${quem} → "${lang}.${c}"`);
  }
  return { ...obj, ...t };
}
const pv = (id, lang) => loc(data.preletores[id], lang, CAMPOS_PRELETOR, `preletor ${id}`);

// "No palco" da página do evento.
// 4+ mentores → C (holofote: um em destaque + fileira de fotos clicáveis); até 3 → B (elenco em lista).
const PALCO_MIN_HOLOFOTE = 4;
function palcoHtml(ev, ids, lang) {
  const T = L[lang];
  const fixos = data.preletores_fixos || [];
  const ps = ids.map((id) => {
    if (!data.preletores[id]) throw new Error(`[${ev.slug}] preletor "${id}" não existe em "preletores"`);
    const p = pv(id, lang);
    if (p.foto && !existsSync(join(ROOT, p.foto))) console.warn(`  ! foto não encontrada: ${p.foto} (${id})`);
    return { id, ...p, lead: fixos.includes(id), titulo: p.titulo_html || p.nome };
  });
  const mais = (p) => p.bio_completa && p.bio_completa.length
    ? `\n          <details class="mentor__more"><summary>${T.lerBio}</summary>\n${p.bio_completa.map((x) => `            <p>${x}</p>`).join("\n")}\n          </details>`
    : "";
  const n = ps.length, nn = (i) => String(i + 1).padStart(2, "0");
  if (n < PALCO_MIN_HOLOFOTE) {
    return `    <div class="palco elenco">
${ps.map((p, i) => `      <article class="row${p.lead ? " lead" : ""}">
        <div class="num">${nn(i)}</div>
        <img src="${p.foto}" alt="${p.nome}" loading="lazy" decoding="async">
        <div>${p.lead && p.destaque ? `<div class="kick" style="margin-bottom: 10px">${p.destaque}</div>` : ""}
          <h3>${p.titulo}</h3>
          <div class="role">${p.funcao}</div>
        </div>
        <div>
          <p>${p.bio}</p>${mais(p)}
        </div>
      </article>`).join("\n")}
    </div>`;
  }
  const base = `pv-${ev.slug}`;
  const cols = n <= 8 ? n : Math.ceil(n / 2);
  return `    <div class="palco" data-palco>
${ps.map((p, i) => `      <article class="spot" id="${base}-${p.id}" role="tabpanel" aria-labelledby="${base}-tab-${p.id}"${i ? " hidden" : ""}>
        <div class="spot__ph"><img src="${p.foto}" alt="${p.nome}" loading="${i ? "lazy" : "eager"}" decoding="async"></div>
        <div class="spot__b">
          <div class="kick">${p.lead && p.destaque ? p.destaque : T.convidado}</div>
          <h3>${p.titulo}</h3>
          <div class="role">${p.funcao}</div>
          <p>${p.bio}</p>${mais(p)}
          <div class="spot__nav"><button type="button" data-step="-1" aria-label="${T.anteriorAria}">← ${T.anterior}</button><span class="spot__pos">${nn(i)} / ${String(n).padStart(2, "0")}</span><button type="button" data-step="1" aria-label="${T.proximoAria}">${T.proximo} →</button></div>
        </div>
      </article>`).join("\n")}
      <div class="thumbs" role="tablist" aria-label="${T.mentoresAria}" style="--cols: ${cols}">
${ps.map((p, i) => `        <button type="button" class="thumb${i ? "" : " on"}" role="tab" id="${base}-tab-${p.id}" aria-controls="${base}-${p.id}" aria-selected="${i ? "false" : "true"}" tabindex="${i ? -1 : 0}"><img src="${p.foto}" alt="" decoding="async"><span>${p.nome_curto || p.nome}</span></button>`).join("\n")}
      </div>
    </div>`;
}

const localDefinir = (l, lang) => !l.nome || /a definir/i.test(l.nome);
function heroLocal(ev, lang) {
  const l = ev.local || {};
  if (l.endereco) {
    const q = l.maps_query || encodeURIComponent([l.nome, l.endereco].filter(Boolean).join(" ")).replace(/%20/g, "+");
    return `<a href="https://www.google.com/maps/search/?api=1&amp;query=${q}" target="_blank" rel="noopener">${l.endereco_exibicao || l.endereco}</a>`;
  }
  return `${ev.cidade}, ${ev.uf} · ${localDefinir(l) ? L[lang].localDefinir : l.nome}`;
}

function checkout(ev, tipo) {
  const c = ev.checkout || {};
  if (c[tipo]) return c[tipo];
  const base = "https://pag.metodorei.com/";
  return { standard: `${base}cart-${ev.slug}`, vip: `${base}cart-vip-${ev.slug}`, rei: `${base}cart-${ev.slug}-rei` }[tipo];
}

// Textos que dependem de duração (1 dia × 2+ dias), pré-venda e preços.
function vendaVars(ev, d, lang) {
  const T = L[lang];
  const prevenda = ev.prevenda !== undefined ? ev.prevenda : true;
  const precos = { ...data.precos_padrao, ...(ev.precos || {}) };
  const destaque = ev.destaque || null; // { curto: "...", nota_ingresso: "..." }
  const pct = (p) => (p.de && p.de > p.por ? Math.round((1 - p.por / p.de) * 100) : 0);
  const maxPct = Math.max(...["standard", "vip", "rei"].map((k) => pct(precos[k])));
  const ticket = (k) => {
    const p = precos[k];
    if (prevenda && p.de) {
      return `          <div class="ticket__pre">${T.prevendaPreco}</div>
          <div class="ticket__price"><span class="ticket__old">US$${p.de}</span><span class="ticket__now">${T.agoraSo}</span><span class="ticket__amt">US$${p.por}</span></div>
          <div class="ticket__note">${T.offTempo(pct(p))}</div>`;
    }
    const nota = destaque && destaque.nota_ingresso ? `\n          <div class="ticket__note">${destaque.nota_ingresso}</div>` : "";
    return `          <div class="ticket__price"><span class="ticket__amt">US$${p.por}</span></div>${nota}`;
  };
  let heroSave = "";
  if (destaque && destaque.curto) heroSave = `<div class="hero__save hero__save--destaque reveal" data-d="3">${destaque.curto}</div>`;
  else if (prevenda && maxPct) heroSave = `<div class="hero__save reveal" data-d="3">${T.economize(maxPct)}</div>`;
  return {
    titulo_sufixo: T.tituloSufixo(prevenda),
    preco_min: Math.min(...["standard", "vip", "rei"].map((k) => precos[k].por)),
    promo_bar: prevenda ? T.promo : "",
    hero_offer: T.aPartir(Math.min(...["standard", "vip", "rei"].map((k) => precos[k].por))),
    cta_topo: T.ctaTopo(Math.min(...["standard", "vip", "rei"].map((k) => precos[k].por))),
    cta_ver: T.verIngressos,
    cta_standard: T.comprar("Standard"),
    cta_vip: T.comprar("VIP"),
    cta_rei: T.comprar("REI"),
    lead_standard: `Standard · US$${precos.standard.por} · ${ev.cidade}, ${d.curta}`,
    lead_vip: `VIP · US$${precos.vip.por} · ${ev.cidade}, ${d.curta}`,
    lead_rei: `REI · US$${precos.rei.por} · ${ev.cidade}, ${d.curta}`,
    buybar: `<div class="buybar"><div><b>${ev.cidade} · ${d.curta}</b><span>${T.aPartir(Math.min(...["standard", "vip", "rei"].map((k) => precos[k].por)))}</span></div><a class="btn btn-gold" href="#ingressos">${T.comprarCurto}</a></div>`,
    hero_save: heroSave,
    dur_facts: T.durFacts(d.nDias),
    dur_about: T.durAbout(d.nDias),
    acesso: T.acesso(d.nDias),
    preco_standard: ticket("standard"),
    preco_vip: ticket("vip"),
    preco_rei: ticket("rei"),
    lead_titulo: T.leadTitulo(prevenda),
  };
}

const NOTA_IDIOMA = { pt: "", en: "Presented in Portuguese", es: "En portugués" };
const extrasIdioma = (lang) => ({
  tag_idioma: lang === "pt" ? "" : `,"Idioma: ${lang.toUpperCase()}"`,
  nota_idioma_txt: NOTA_IDIOMA[lang],
});

function preencher(modelo, vars, nome) {
  return modelo.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in vars)) throw new Error(`${nome} usa {{${k}}} mas não há valor`);
    return String(vars[k]);
  });
}

function render(ev0, lang) {
  const ev = loc(ev0, lang, CAMPOS_EVENTO, `evento ${ev0.slug}`);
  const d = datas(ev, lang);
  const ids = ev.preletores && ev.preletores.length ? ev.preletores : data.preletores_padrao;
  const x = extrasIdioma(lang);
  const vars = {
    slug: ev.slug,
    cidade: ev.cidade,
    uf: ev.uf,
    estado: ev.estado,
    ano: d.ano,
    dias: d.dias,
    datas_hero: d.hero,
    datas_texto: d.texto,
    horario: d.horario,
    hero_local: heroLocal(ev, lang),
    imagem: ev.imagem_hero || ev.imagem || `assets/home/city-${ev.slug}.jpg`,
    checkout_standard: checkout(ev, "standard"),
    checkout_vip: checkout(ev, "vip"),
    checkout_rei: checkout(ev, "rei"),
    lead_tag: ev.lead_tag || `Método REI - ${ev.cidade} ${d.ano}`,
    lead_codigo: ev.lead_codigo || datas(ev, "pt").codigo,
    palco: palcoHtml(ev, ids, lang),
    idiomas: seletor(lang, `/${ev.slug}`),
    tag_idioma: x.tag_idioma,
    nota_idioma: x.nota_idioma_txt ? `<span>${x.nota_idioma_txt}</span>` : "",
    ...vendaVars(ev, d, lang),
  };
  vars.checkout = checkoutHtml(ev, d, lang);
  const seo = eventoSchema(data, ev, d, ids, lang, (id) => pv(id, lang));
  vars.seo_head = seo.head;
  return { html: aplicarIngressos(preencher(MODELOS[lang].evento, vars, "template"), ev0, lang), d, seo, ids, ev };
}

const tamCidade = (c) => (c.length <= 9 ? 72 : c.length <= 12 ? 58 : 46);
function cardEmBreve(ev, d, lang) {
  const T = L[lang];
  const img = ev.imagem_card || ev.imagem || "assets/pv/evento-1.jpg";
  const quando = d.nDias === 1 ? `${d.dias}, ${d.texto}` : d.texto;
  return `      <article class="card card--breve" data-end="${ev.fim}"><img src="${img}" alt="${T.skyline(ev.cidade)}" loading="lazy"><div class="card-shade"></div>
        <div style="position: relative"><span class="badge badge-line">${T.emBreve}</span><div class="serif" style="font-size: ${tamCidade(ev.cidade)}px; line-height: .95; margin-top: 16px">${ev.cidade}</div><div style="font-size: 14px; color: #9A948A; margin-top: 6px; letter-spacing: .04em">${ev.estado}</div><div style="font-size: 17px; font-weight: 600; margin-top: 10px">${quando}</div><a class="btn btn-line" href="#comunidade" data-avisar="${ev.cidade}" style="margin-top: 24px; width: 100%">${T.queroAvisado}</a></div></article>`;
}
function card(ev, d, lang) {
  const T = L[lang];
  const pr = { ...data.precos_padrao, ...(ev.precos || {}) };
  const min = Math.min(pr.standard.por, pr.vip.por, pr.rei.por);
  const img = ev.imagem_card || ev.imagem || `assets/home/city-${ev.slug}.jpg`;
  const selo = ev.selo || d.diasCard.replace(" · ", " + ");
  const cls = ev.selo ? (/pr[ée]-?vent|pre-?sale/i.test(ev.selo) ? "badge-red" : "badge-gold") : "badge-line";
  const quando = d.nDias === 1 ? `${d.dias}, ${d.card}` : d.card;
  const horas = d.horario.replace(/(am|pm)/gi, (m) => m.toUpperCase());
  const local = ev.local && !localDefinir(ev.local) ? ` · ${ev.local.nome}` : "";
  return `      <article class="card" data-end="${ev.fim}"><img src="${img}" alt="${T.skyline(ev.cidade)}" loading="lazy"><div class="card-shade"></div>
        <div style="position: relative"><span class="badge ${cls}">${selo}</span><div class="serif" style="font-size: ${tamCidade(ev.cidade)}px; line-height: .95; margin-top: 16px">${ev.cidade}</div><div style="font-size: 17px; font-weight: 600; margin-top: 10px">${quando}</div><div style="font-size: 14px; color: #9A948A; margin-top: 4px">${horas}${local}</div><div style="font-size: 15px; font-weight: 700; color: #E3C78A; margin-top: 14px">${T.aPartir(min)}</div><a class="btn btn-gold" href="/${ev.slug}" data-event="${ev.cidade}" style="margin-top: 18px; width: 100%">${T.verEvento}</a></div></article>`;
}

// "No palco" da home: fixos (sempre, em cor) + quem está em algum evento futuro (P&B), sem repetir.
function lineup(upcoming, lang) {
  const fixos = data.preletores_fixos || [];
  const ids = [...fixos];
  for (const r of upcoming) for (const id of r.ids) if (!ids.includes(id)) ids.push(id);
  const faces = ids.map((id) => {
    if (!data.preletores[id]) throw new Error(`preletor "${id}" não existe`);
    const p = pv(id, lang);
    const lead = fixos.includes(id);
    const nome = p.nome_curto || p.nome_palco || p.nome;
    return lead
      ? `      <div class="face face-lead"><img src="${p.foto}" alt="${p.nome}" loading="lazy"><div class="face-name"><div class="kick" style="font-size: 10px">${p.destaque || ""}</div><div class="serif" style="font-size: 24px; line-height: 1.05; margin-top: 4px">${nome}</div></div></div>`
      : `      <div class="face"><img src="${p.foto}" alt="${p.nome}" loading="lazy"><div class="face-name"><div class="serif" style="font-size: 22px; line-height: 1.05">${nome}</div></div></div>`;
  });
  const n = ids.length;
  const cols = n <= 5 ? n : Math.ceil(n / Math.ceil(n / 5));
  return { html: faces.join("\n"), cols: Math.max(cols, 2) };
}


// ---------- itens dos cards de ingresso (por evento) ----------
// eventos.json → "ingressos": { "todos"|"standard"|"vip"|"rei": { remover: [chave], adicionar: [{pt,en,es}], adicionar_bonus: [{pt,en,es}] } }
const TIPOS_INGRESSO = ["standard", "vip", "rei"];
const CHECK_LI = (template.match(/<li data-item="[^"]+">(<svg[\s\S]*?<\/svg>)/) || [])[1] || "";
const BONUS_TXT = { pt: "Bônus", en: "Bonus", es: "Bonos" };
function fimElemento(html, ini, tag) {
  const re = new RegExp(`<${tag}\\b|</${tag}>`, "g"); re.lastIndex = ini; let depth = 0, m;
  while ((m = re.exec(html))) { if (m[0][1] === "/") { if (--depth === 0) return re.lastIndex; } else depth++; }
  throw new Error(`HTML sem </${tag}>`);
}
function validarIngressos(ev) {
  const cfg = ev.ingressos;
  if (!cfg) return;
  const chaves = {};
  for (const t of TIPOS_INGRESSO) {
    const i = template.indexOf(`data-card="${t}"`), f = fimElemento(template, template.lastIndexOf("<article", i), "article");
    chaves[t] = new Set([...template.slice(i, f).matchAll(/data-item="([^"]+)"/g)].map((m) => m[1]));
  }
  for (const [tipo, c] of Object.entries(cfg)) {
    if (tipo.startsWith("_")) continue;
    if (tipo !== "todos" && !TIPOS_INGRESSO.includes(tipo)) throw new Error(`[${ev.slug}] ingressos: tipo desconhecido "${tipo}" (use todos, standard, vip ou rei)`);
    for (const k of Object.keys(c)) if (!["remover", "adicionar", "adicionar_bonus"].includes(k)) throw new Error(`[${ev.slug}] ingressos.${tipo}: campo desconhecido "${k}"`);
    for (const chave of c.remover || []) for (const t of tipo === "todos" ? TIPOS_INGRESSO : [tipo])
      if (!chaves[t].has(chave)) throw new Error(`[${ev.slug}] ingressos.${tipo}.remover: chave "${chave}" não existe no ingresso ${t} (chaves: ${[...chaves[t]].join(", ")})`);
    for (const campo of ["adicionar", "adicionar_bonus"]) for (const it of c[campo] || [])
      for (const l of IDIOMAS) if (!it || typeof it[l] !== "string" || !it[l].trim()) throw new Error(`[${ev.slug}] ingressos.${tipo}.${campo}: item sem texto em "${l}"`);
  }
}
function aplicarIngressos(html, ev, lang) {
  const cfg = ev.ingressos || {};
  for (const t of TIPOS_INGRESSO) {
    const passos = [cfg.todos, cfg[t]].filter(Boolean);
    const ia = html.indexOf(`data-card="${t}"`);
    if (ia < 0) continue;
    const ini = html.lastIndexOf("<article", ia), fim = fimElemento(html, ini, "article");
    let card = html.slice(ini, fim);
    for (const p of passos) {
      for (const chave of p.remover || []) {
        const i = card.indexOf(`<li data-item="${chave}"`);
        card = card.slice(0, i) + card.slice(fimElemento(card, i, "li")).replace(/^\s*\n/, "\n");
      }
      const ul = card.indexOf("<ul>"), fu = fimElemento(card, ul, "ul") - "</ul>".length;
      const li = (txt) => `            <li>${CHECK_LI}${txt}</li>\n`;
      if ((p.adicionar || []).length) {
        const bh = card.indexOf('class="bh"');
        const at = bh > 0 && bh < fu ? card.lastIndexOf("<li", bh) : fu;
        const before = card.slice(0, at).replace(/[ \t]*$/, "");
        card = before + (before.endsWith("\n") ? "" : "\n") + p.adicionar.map((it) => li(it[lang])).join("") + "          " + card.slice(at).replace(/^\s*/, "");
      }
      if ((p.adicionar_bonus || []).length) {
        const ul2 = card.indexOf("<ul>"), fu2 = fimElemento(card, ul2, "ul") - "</ul>".length;
        const tem = card.slice(ul2, fu2).includes('class="bh"');
        const add = (tem ? "" : `            <li class="bh">${BONUS_TXT[lang]}</li>\n`) + p.adicionar_bonus.map((it) => li(it[lang])).join("");
        const before = card.slice(0, fu2).replace(/\s*$/, "");
        card = before + "\n" + add + "          " + card.slice(fu2);
      }
    }
    html = html.slice(0, ini) + card + html.slice(fim);
  }
  return html.replace(/ data-item="[^"]*"/g, "").replace(/ data-card="[^"]*"/g, "");
}

// ---------- checkout (Square) ----------
const LEAD_EVENTO = "https://contact-blossom-39.lovable.app/api/public/contatos/ck_479abcc9_479abcc9a2f98313db0a19480754dbf7abe9b3cc27b6cd889cd5d06a3d43deef";
const TIERS = { standard: "Standard", vip: "VIP", rei: "REI" };
const precosEv = (ev) => ({ ...data.precos_padrao, ...(ev.precos || {}) });
function checkoutHtml(ev, d, lang) {
  const pr = precosEv(ev);
  const cfg = {
    lang, locale: CO[lang].locale, slug: ev.slug, cidade: ev.cidade,
    eventoLinha: `Método REI ${ev.cidade} · ${d.curta}${d.ano ? " " + d.ano : ""}`,
    tiers: Object.fromEntries(Object.entries(TIERS).map(([k, nome]) => [k, { nome, preco: pr[k].por }])),
    politica: `${prefixo(lang)}/politica`,
    lead: { endpoint: LEAD_EVENTO, tags: [ev.lead_tag || `Método REI - ${ev.cidade} ${d.ano}`, ev.lead_codigo || datas(ev, "pt").codigo, "Checkout"] },
    t: CO[lang],
  };
  return `<link rel="stylesheet" href="/assets/checkout.css">
<script>window.MREI_CO=${JSON.stringify(cfg).replace(/</g, "\\u003c")};</script>
<script src="/assets/checkout.js" defer></script>`;
}
function catalogo() {
  const eventos = {};
  for (const ev of PAGINAS) {
    const d = datas(ev, "pt"), pr = precosEv(ev);
    eventos[ev.slug] = {
      slug: ev.slug, cidade: ev.cidade, uf: ev.uf, inicio: ev.inicio, fim: ev.fim, ano: d.ano, horarios: ev.horarios || [],
      datas_texto: d.texto, tz: ev.fuso || FUSOS[ev.uf] || "America/New_York",
      local: { nome: /a definir/i.test((ev.local || {}).nome || "") ? "" : (ev.local || {}).nome || "", endereco: (ev.local || {}).endereco || "", endereco_exibicao: (ev.local || {}).endereco_exibicao || "", maps_query: (ev.local || {}).maps_query || "" },
      tiers: Object.fromEntries(Object.entries(TIERS).map(([k, nome]) => [k, { nome, preco: pr[k].por }])),
      webhooks: (ev.webhooks || []).map(({ nome, url, tiers, para, corpo }) => ({ nome, url, tiers: tiers || null, para: para || "todos", corpo })),
    };
  }
  const cupons = (data.cupons || []).map(({ _nota, ...c }) => c);
  const entregas = Object.fromEntries(Object.entries(data.entregas || {}).filter(([k]) => !k.startsWith("_")));
  return `// GERADO por eventos/build.mjs a partir de eventos/eventos.json — não edite à mão.\nexport const CATALOGO = ${JSON.stringify({ eventos, cupons, entregas }, null, 2)};\n`;
}
function paginasCheckout(lang) {
  const T = CO[lang], pre = prefixo(lang), home = pre || "/";
  const wa = `https://wa.me/${(data.site.whatsapp || "").replace(/\D/g, "")}`;
  const pedido = preencher(pedidoTemplate, {
    html_lang: HTML_LANG[lang], titulo: T.pdTitulo, home, voltar: T.pdVoltar, carregando: T.pdCarregando,
    dados: JSON.stringify({ lang, locale: T.locale, whatsapp: wa, t: { ...T, ingresso: T.ingresso } }).replace(/</g, "\\u003c"),
  }, "pedido-template");
  const politica = preencher(paginaTemplate, {
    html_lang: HTML_LANG[lang], titulo: T.politicaTitulo, home, voltar: T.pdVoltar, canonical: `${data.site.url}${pre}/politica`,
    conteudo: POLITICA[lang].map((p) => `<p>${p}</p>`).join("\n"), whatsapp: wa, duvidas: T.pdDuvidas,
  }, "pagina-template");
  return { pedido, politica };
}

// ---------- main ----------
const slugs = new Set(), todosSlugs = new Set();
const PAGINAS = data.eventos.filter((ev) => !ev.em_breve);
const EM_BREVE = data.eventos.filter((ev) => ev.em_breve);
for (const ev of data.eventos) {
  for (const k of ["slug", "cidade", "uf", "estado", "inicio", "fim"]) if (!ev[k]) throw new Error(`evento sem "${k}": ${JSON.stringify(ev).slice(0, 80)}`);
  if (!/^[a-z0-9-]+$/.test(ev.slug)) throw new Error(`[${ev.slug}] slug só pode ter letras minúsculas, números e hífen`);
  if (IDIOMAS.includes(ev.slug)) throw new Error(`[${ev.slug}] slug não pode ser um código de idioma`);
  if (todosSlugs.has(ev.slug)) throw new Error(`slug repetido: ${ev.slug}`);
  todosSlugs.add(ev.slug);
  if (!ev.em_breve) slugs.add(ev.slug);
  validarIngressos(ev);
}
const today = new Date(); today.setUTCHours(0, 0, 0, 0);

const porIdioma = {};
for (const lang of IDIOMAS) {
  const rendered = PAGINAS.map((ev) => render(ev, lang));
  const upcoming = rendered.filter((r) => r.d.fimDate >= today && !r.ev.oculto).sort((a, b) => a.ev.inicio.localeCompare(b.ev.inicio));
  // "em breve": só cidade e data na home, sem página nem ingressos
  const breve = EM_BREVE.map((ev0) => { const ev = loc(ev0, lang, CAMPOS_EVENTO, `evento ${ev0.slug}`); return { ev, d: datas(ev, lang), breve: true }; })
    .filter((r) => r.d.fimDate >= today && !r.ev.oculto);
  const agenda = [...upcoming, ...breve].sort((a, b) => a.ev.inicio.localeCompare(b.ev.inicio));
  const anos = [...new Set(agenda.map((r) => r.d.ano))].join("/");
  const lu = lineup(upcoming, lang);
  const x = extrasIdioma(lang);
  const homeVars = {
    seo_head: homeHead(data, upcoming, lang, agenda),
    ano: upcoming.length ? upcoming[0].d.ano : new Date().getFullYear(),
    anos: anos || new Date().getFullYear(),
    cards: agenda.map((r) => (r.breve ? cardEmBreve(r.ev, r.d, lang) : card(r.ev, r.d, lang))).join("\n"),
    cards_cols: Math.min(Math.max(agenda.length, 1), 3),
    lineup: lu.html,
    lineup_cols: lu.cols,
    edicoes: agenda.map((r) => `            <option value="${r.ev.cidade}">${r.ev.cidade} · ${r.d.curta}</option>`).join("\n"),
    rodape: upcoming.map((r) => `<a href="/${r.ev.slug}" style="color: #9A948A; text-decoration: none; font-size: 12px; font-weight: 700; letter-spacing: .14em">${r.ev.cidade.toUpperCase()}</a>`).join(""),
    idiomas: seletor(lang, ""),
    tag_idioma: x.tag_idioma,
    nota_idioma: x.nota_idioma_txt ? `<p style="margin: 10px 0 0; font-size: 13px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #E3C78A">${x.nota_idioma_txt}</p>` : "",
  };
  porIdioma[lang] = { rendered, upcoming, agenda, anos, home: preencher(MODELOS[lang].home, homeVars, "home-template") };
}

if (faltaIdioma.length) {
  console.error(`\n✗ Falta tradução em eventos/eventos.json:\n${[...new Set(faltaIdioma)].map((x) => "  " + x).join("\n")}\n`);
  process.exit(1);
}

const pt = porIdioma.pt;
if (CHECK_ONLY) {
  console.log(`OK — ${pt.rendered.length} eventos, ${pt.upcoming.length} futuros: ${pt.upcoming.map((r) => r.ev.slug).join(", ")} · idiomas: ${IDIOMAS.join(", ")}`);
  process.exit(0);
}

for (const lang of IDIOMAS) {
  const dir = lang === "pt" ? ROOT : join(ROOT, lang);
  mkdirSync(dir, { recursive: true });
  const { rendered, home, upcoming } = porIdioma[lang];
  for (const r of rendered) writeFileSync(join(dir, `${r.ev.slug}.html`), localizarPagina(r.html, lang, slugs));
  writeFileSync(join(dir, "index.html"), localizarPagina(home, lang, slugs));
  const pc = paginasCheckout(lang);
  writeFileSync(join(dir, "pedido.html"), pc.pedido);
  writeFileSync(join(dir, "politica.html"), pc.politica);
  console.log(`  ✓ ${prefixo(lang) || "/"}  + ${rendered.map((r) => `${prefixo(lang)}/${r.ev.slug}`).join(", ")}  (${upcoming.length} próximos)`);
}

const visiveis = pt.rendered.filter((r) => !r.ev.oculto).map((r) => r.ev.slug);
writeFileSync(join(ROOT, "sitemap.xml"), sitemap(data, visiveis));
writeFileSync(join(ROOT, "robots.txt"), robots(data));
writeFileSync(join(ROOT, "llms.txt"), llms(data, pt.upcoming, pt.rendered.filter((r) => r.d.fimDate < today && !r.ev.oculto)));
console.log("  ✓ sitemap.xml, robots.txt, llms.txt");
mkdirSync(join(ROOT, "api/_lib"), { recursive: true });
writeFileSync(join(ROOT, "api/_lib/catalogo.mjs"), catalogo());
console.log("  ✓ api/_lib/catalogo.mjs (preços e cupons do checkout)");

for (const lang of IDIOMAS) for (const s of ["home", ...slugs]) {
  const f = join(ROOT, "assets/og", lang === "pt" ? "" : lang, `${s}.jpg`);
  if (!existsSync(f)) console.warn(`  ! falta a imagem de compartilhamento ${f.slice(ROOT.length + 1)} (rode: python3 eventos/og.py)`);
}
writeFileSync(join(DIR, "og-data.json"), JSON.stringify(Object.fromEntries(IDIOMAS.map((lang) => {
  const { rendered, agenda } = porIdioma[lang];
  return [lang, {
    home: { cidades: [...new Set(agenda.map((r) => r.ev.cidade))], anos: [...new Set(agenda.map((r) => r.d.ano))] },
    eventos: rendered.map((r) => ({ slug: r.ev.slug, cidade: r.ev.cidade, uf: r.ev.uf, dias: r.d.dias, data: r.d.hero, onde: r.seo.onde, min: r.seo.min,
      fotos: r.ids.map((id) => data.preletores[id].foto).filter(Boolean) })),
  }];
})), null, 2));
