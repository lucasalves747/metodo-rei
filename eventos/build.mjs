#!/usr/bin/env node
// Gera as páginas de evento e a lista "Próximos eventos" da home a partir de eventos/eventos.json.
// Uso:  node eventos/build.mjs          (gera tudo)
//       node eventos/build.mjs --check  (só valida o JSON)
// Sem dependências. As páginas geradas são HTML estático normal (a Vercel não precisa de build).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eventoSchema, homeHead, sitemap, robots, llms } from "./seo.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, "..");
const data = JSON.parse(readFileSync(join(DIR, "eventos.json"), "utf8"));
const PARTES = Object.fromEntries(["pilares", "wall", "experiencia"].map((k) => [k, readFileSync(join(DIR, "partes", `${k}.html`), "utf8").trimEnd()]));
const incluir = (t) => t.replace(/\{\{(pilares|wall|experiencia)\}\}/g, (m, k) => PARTES[k]);
const template = incluir(readFileSync(join(DIR, "template.html"), "utf8"));
const homeTemplate = incluir(readFileSync(join(DIR, "home-template.html"), "utf8"));
const CHECK_ONLY = process.argv.includes("--check");
data.site = { url: "https://www.metodorei.com", nome: "Método REI", ...(data.site || {}) };

const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const MESES_CURTO = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const DIAS = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const DIAS_CURTO = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n) => String(n).padStart(2, "0");

function parseDate(iso, slug, field) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) throw new Error(`[${slug}] "${field}" precisa ser AAAA-MM-DD (recebi: ${iso})`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

// Monta todos os formatos de data a partir de inicio/fim.
function datas(ev) {
  const a = parseDate(ev.inicio, ev.slug, "inicio");
  const b = parseDate(ev.fim, ev.slug, "fim");
  if (b < a) throw new Error(`[${ev.slug}] "fim" é antes de "inicio"`);
  const d1 = a.getUTCDate(), d2 = b.getUTCDate();
  const m1 = a.getUTCMonth(), m2 = b.getUTCMonth();
  const y = b.getUTCFullYear();
  const mesmoMes = m1 === m2 && a.getUTCFullYear() === y;
  const umDia = +a === +b;
  const dias = umDia ? DIAS[a.getUTCDay()] : `${DIAS[a.getUTCDay()]} e ${DIAS[b.getUTCDay()]}`;
  let texto, hero, card, curta;
  if (umDia) {
    texto = `${d1} de ${MESES[m1]} de ${y}`;
    hero = `${d1} de ${cap(MESES[m1])}, ${y}`;
    card = `${d1} de ${MESES[m1]}, ${y}`;
    curta = `${d1} ${MESES_CURTO[m1]}`;
  } else if (mesmoMes) {
    texto = `${d1} e ${d2} de ${MESES[m1]} de ${y}`;
    hero = `${d1} e ${d2} de ${cap(MESES[m1])}, ${y}`;
    card = `${d1}–${d2} de ${MESES[m1]}, ${y}`;
    curta = `${d1}–${d2} ${MESES_CURTO[m1]}`;
  } else {
    texto = `${d1} de ${MESES[m1]} e ${d2} de ${MESES[m2]} de ${y}`;
    hero = `${d1} de ${cap(MESES[m1])} e ${d2} de ${cap(MESES[m2])}, ${y}`;
    card = `${d1} ${MESES_CURTO[m1]} – ${d2} ${MESES_CURTO[m2]}, ${y}`;
    curta = `${d1} ${MESES_CURTO[m1]}–${d2} ${MESES_CURTO[m2]}`;
  }
  const codigo = `MREI${pad(d1)}${pad(m1 + 1)}${String(a.getUTCFullYear()).slice(2)}`;
  const diasCard = umDia ? DIAS[a.getUTCDay()] : `${DIAS[a.getUTCDay()]} · ${DIAS[b.getUTCDay()]}`;
  const h = ev.horarios || [];
  const horario = umDia
    ? `${DIAS_CURTO[a.getUTCDay()]} ${h[0] || ""}`
    : `${DIAS_CURTO[a.getUTCDay()]} ${h[0] || ""} · ${DIAS_CURTO[b.getUTCDay()]} ${h[1] || ""}`;
  const nDias = Math.round((b - a) / 86400000) + 1;
  return { texto, hero, card, curta, codigo, dias, diasCard, horario, horarioCard: h.join(" · ").toUpperCase(), ano: y, fimDate: b, nDias };
}

function mentorHtml(id, i, ev) {
  const p = data.preletores[id];
  if (!p) throw new Error(`[${ev.slug}] preletor "${id}" não existe em "preletores"`);
  if (p.foto && !existsSync(join(ROOT, p.foto))) console.warn(`  ! foto não encontrada: ${p.foto} (${id})`);
  const titulo = p.titulo_html || p.nome;
  const foto = p.foto
    ? `<img decoding="async" src="${p.foto}" alt="${p.nome}" loading="lazy" />`
    : `<span class="mentor__initials">${p.nome.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>`;
  return `      <article class="mentor reveal" data-d="${(i % 3) + 1}">
        <div class="mentor__ph">${foto}</div>
        <div class="mentor__b">
          <span class="mentor__role">${p.funcao}</span>
          <h3>${titulo}</h3>
          <p>${p.bio}</p>${
            p.bio_completa && p.bio_completa.length
              ? `\n          <details class="mentor__more"><summary>Ler bio completa</summary>\n${p.bio_completa.map((x) => `            <p>${x}</p>`).join("\n")}\n          </details>`
              : ""
          }
        </div>
      </article>`;
}

function heroLocal(ev) {
  const l = ev.local || {};
  if (l.endereco) {
    const q = l.maps_query || encodeURIComponent([l.nome, l.endereco].filter(Boolean).join(" ")).replace(/%20/g, "+");
    return `<a href="https://www.google.com/maps/search/?api=1&amp;query=${q}" target="_blank" rel="noopener">${l.endereco_exibicao || l.endereco}</a>`;
  }
  return `${ev.cidade}, ${ev.uf} · ${l.nome || "Local a definir"}`;
}

function checkout(ev, tipo) {
  const c = ev.checkout || {};
  if (c[tipo]) return c[tipo];
  const base = "https://pag.metodorei.com/";
  return { standard: `${base}cart-${ev.slug}`, vip: `${base}cart-vip-${ev.slug}`, rei: `${base}cart-${ev.slug}-rei` }[tipo];
}

// Textos que dependem de duração (1 dia × 2+ dias), pré-venda e preços.
function vendaVars(ev, d) {
  const prevenda = ev.prevenda !== undefined ? ev.prevenda : true;
  const precos = { ...data.precos_padrao, ...(ev.precos || {}) };
  const umDia = ev.inicio === ev.fim;
  const destaque = ev.destaque || null; // { curto: "...", nota_ingresso: "..." }
  const pct = (p) => (p.de && p.de > p.por ? Math.round((1 - p.por / p.de) * 100) : 0);
  const maxPct = Math.max(...["standard", "vip", "rei"].map((k) => pct(precos[k])));
  const ticket = (k) => {
    const p = precos[k];
    if (prevenda && p.de) {
      return `          <div class="ticket__pre">Preço de pré-venda!</div>
          <div class="ticket__price"><span class="ticket__old">US$${p.de}</span><span class="ticket__now">Agora<br>só</span><span class="ticket__amt">US$${p.por}</span></div>
          <div class="ticket__note">${pct(p)}% OFF<br>por tempo limitado</div>`;
    }
    const nota = destaque && destaque.nota_ingresso ? `\n          <div class="ticket__note">${destaque.nota_ingresso}</div>` : "";
    return `          <div class="ticket__price"><span class="ticket__amt">US$${p.por}</span></div>${nota}`;
  };
  let heroSave = "";
  if (destaque && destaque.curto) heroSave = `<div class="hero__save hero__save--destaque reveal" data-d="3">${destaque.curto}</div>`;
  else if (prevenda && maxPct) heroSave = `<div class="hero__save reveal" data-d="3">Economize até <b>${maxPct}% OFF!</b></div>`;
  return {
    titulo_sufixo: prevenda ? "Pré-venda" : "Ingressos",
    meta_intro: prevenda ? "Pré-venda especial da imersão presencial" : "Imersão presencial",
    preco_min: Math.min(...["standard", "vip", "rei"].map((k) => precos[k].por)),
    promo_bar: prevenda ? `<div class="promo"><b>Pré-venda especial!</b>Economize em todos os ingressos</div>` : "",
    hero_offer: prevenda ? "Garanta a oferta de pré-venda" : "Garanta seu lugar",
    hero_save: heroSave,
    dur_facts: umDia ? "1 dia presencial" : `${d.nDias} dias presenciais`,
    dur_about: umDia ? "Um dia presencial" : "Dois dias presenciais",
    dur_exp: umDia ? "é um dia" : "são dois dias",
    dur_verbo: umDia ? "muda" : "mudam",
    acesso: umDia ? "Acesso ao dia completo de imersão" : "Acesso aos 2 dias de imersão",
    preco_standard: ticket("standard"),
    preco_vip: ticket("vip"),
    preco_rei: ticket("rei"),
    lead_titulo: prevenda ? "Garanta seu preço de pré-venda" : "Garanta seu ingresso",
  };
}

function render(ev) {
  const d = datas(ev);
  const ids = ev.preletores && ev.preletores.length ? ev.preletores : data.preletores_padrao;
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
    hero_local: heroLocal(ev),
    imagem: ev.imagem_hero || ev.imagem || `assets/home/city-${ev.slug}.jpg`,
    checkout_standard: checkout(ev, "standard"),
    checkout_vip: checkout(ev, "vip"),
    checkout_rei: checkout(ev, "rei"),
    lead_tag: ev.lead_tag || `Método REI - ${ev.cidade} ${d.ano}`,
    lead_codigo: ev.lead_codigo || d.codigo,
    mentors_class: ids.length >= 3 ? "mentors mentors--grid" : "mentors mentors--2",
    mentors: ids.map((id, i) => mentorHtml(id, i, ev)).join("\n"),
    ...vendaVars(ev, d),
  };
  const seo = eventoSchema(data, ev, d, ids);
  vars.seo_head = seo.head;
  const out = template.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in vars)) throw new Error(`template usa {{${k}}} mas não há valor`);
    return String(vars[k]);
  });
  return { html: out, d, seo, ids };
}

function card(ev, i, d) {
  const img = ev.imagem_card || ev.imagem || `assets/home/city-${ev.slug}.jpg`;
  const selo = ev.selo || d.diasCard.replace(" · ", " + ");
  const cls = ev.selo ? (/pr[ée]-?venda/i.test(ev.selo) ? "badge-red" : "badge-gold") : "badge-line";
  const quando = d.nDias === 1 ? `${d.dias}, ${d.card.replace(/, \d{4}$/, "")}` : d.card.replace(/, \d{4}$/, "");
  const horas = d.horario.replace(/(am|pm)/gi, (m) => m.toUpperCase());
  const local = ev.local && ev.local.nome && !/a definir/i.test(ev.local.nome) ? ` · ${ev.local.nome}` : "";
  return `      <article class="card" data-end="${ev.fim}"><img src="${img}" alt="Skyline de ${ev.cidade}" loading="lazy"><div class="card-shade"></div>
        <div style="position: relative"><span class="badge ${cls}">${selo}</span><div class="serif" style="font-size: 72px; line-height: .95; margin-top: 16px">${ev.cidade}</div><div style="font-size: 17px; font-weight: 600; margin-top: 10px">${quando}</div><div style="font-size: 14px; color: #9A948A; margin-top: 4px">${horas}${local}</div><a class="btn btn-gold" href="/${ev.slug}" data-event="${ev.cidade}" style="margin-top: 24px; width: 100%">Garantir minha vaga</a></div></article>`;
}

// "No palco" da home: fixos (sempre, em cor) + quem está em algum evento futuro (P&B), sem repetir.
function lineup(upcoming) {
  const fixos = data.preletores_fixos || [];
  const ids = [...fixos];
  for (const r of upcoming) for (const id of r.ids) if (!ids.includes(id)) ids.push(id);
  const faces = ids.map((id) => {
    const p = data.preletores[id];
    if (!p) throw new Error(`preletor "${id}" não existe`);
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

function between(html, name, content) {
  const re = new RegExp(`(<!-- ${name}:START -->)[\\s\\S]*?(<!-- ${name}:END -->)`);
  if (!re.test(html)) throw new Error(`marcador ${name} não encontrado no index.html`);
  return html.replace(re, `$1\n${content}\n$2`);
}

function listaCidades(nomes) {
  return nomes.length <= 1 ? nomes.join("") : nomes.slice(0, -1).join(", ") + " e " + nomes.at(-1);
}

// ---------- main ----------
const slugs = new Set();
const today = new Date(); today.setUTCHours(0, 0, 0, 0);
const rendered = data.eventos.map((ev) => {
  for (const k of ["slug", "cidade", "uf", "estado", "inicio", "fim"]) if (!ev[k]) throw new Error(`evento sem "${k}": ${JSON.stringify(ev).slice(0, 80)}`);
  if (!/^[a-z0-9-]+$/.test(ev.slug)) throw new Error(`[${ev.slug}] slug só pode ter letras minúsculas, números e hífen`);
  if (slugs.has(ev.slug)) throw new Error(`slug repetido: ${ev.slug}`);
  slugs.add(ev.slug);
  return { ev, ...render(ev) };
});

const upcoming = rendered.filter((r) => r.d.fimDate >= today && !r.ev.oculto).sort((a, b) => a.ev.inicio.localeCompare(b.ev.inicio));

if (CHECK_ONLY) {
  console.log(`OK — ${rendered.length} eventos, ${upcoming.length} futuros: ${upcoming.map((r) => r.ev.slug).join(", ")}`);
  process.exit(0);
}

for (const r of rendered) {
  writeFileSync(join(ROOT, `${r.ev.slug}.html`), r.html);
  console.log(`  ✓ /${r.ev.slug}  (${r.d.texto})`);
}

const lu = lineup(upcoming);
const anoHome = upcoming.length ? upcoming[0].d.ano : new Date().getFullYear();
const homeVars = {
  seo_head: homeHead(data, upcoming),
  ano: anoHome,
  cards: upcoming.map((r, i) => card(r.ev, i, r.d)).join("\n"),
  cards_cols: Math.min(Math.max(upcoming.length, 1), 3),
  lineup: lu.html,
  lineup_cols: lu.cols,
  edicoes: upcoming.map((r) => `            <option value="${r.ev.cidade}">${r.ev.cidade} · ${r.d.curta}</option>`).join("\n"),
  rodape: upcoming.map((r) => `<a href="/${r.ev.slug}" style="color: #9A948A; text-decoration: none; font-size: 12px; font-weight: 700; letter-spacing: .14em">${r.ev.cidade.toUpperCase()}</a>`).join(""),
};
const index = homeTemplate.replace(/\{\{(\w+)\}\}/g, (m, k) => {
  if (!(k in homeVars)) throw new Error(`home-template usa {{${k}}} mas não há valor`);
  return String(homeVars[k]);
});
const nomes = [...new Set(upcoming.map((r) => r.ev.cidade))];
writeFileSync(join(ROOT, "index.html"), index);
writeFileSync(join(ROOT, "sitemap.xml"), sitemap(data, rendered.filter((r) => !r.ev.oculto)));
writeFileSync(join(ROOT, "robots.txt"), robots(data));
writeFileSync(join(ROOT, "llms.txt"), llms(data, upcoming, rendered.filter((r) => r.d.fimDate < today && !r.ev.oculto)));
for (const r of rendered) if (!existsSync(join(ROOT, "assets/og", `${r.ev.slug}.jpg`))) console.warn(`  ! falta a imagem de compartilhamento assets/og/${r.ev.slug}.jpg (rode: python3 eventos/og.py)`);
console.log("  ✓ sitemap.xml, robots.txt, llms.txt");
writeFileSync(join(DIR, "og-data.json"), JSON.stringify({
  home: { cidades: [...new Set(upcoming.map((r) => r.ev.cidade))], anos: [...new Set(upcoming.map((r) => r.d.ano))] },
  eventos: rendered.map((r) => ({ slug: r.ev.slug, cidade: r.ev.cidade, uf: r.ev.uf, dias: r.d.dias, data: r.d.hero, onde: r.seo.onde, min: r.seo.min,
    fotos: r.ids.map((id) => data.preletores[id].foto).filter(Boolean) })),
}, null, 2));

console.log(`  ✓ home: ${upcoming.length} próximos eventos (${nomes.join(", ")})`);
