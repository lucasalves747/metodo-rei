#!/usr/bin/env node
// Gera as páginas de evento e a lista "Próximos eventos" da home a partir de eventos/eventos.json.
// Uso:  node eventos/build.mjs          (gera tudo)
//       node eventos/build.mjs --check  (só valida o JSON)
// Sem dependências. As páginas geradas são HTML estático normal (a Vercel não precisa de build).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, "..");
const data = JSON.parse(readFileSync(join(DIR, "eventos.json"), "utf8"));
const template = readFileSync(join(DIR, "template.html"), "utf8");
const CHECK_ONLY = process.argv.includes("--check");

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
  return { texto, hero, card, curta, codigo, dias, diasCard, horario, horarioCard: h.join(" · ").toUpperCase(), ano: y, fimDate: b };
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
          <p>${p.bio}</p>
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
  };
  const out = template.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in vars)) throw new Error(`template usa {{${k}}} mas não há valor`);
    return String(vars[k]);
  });
  return { html: out, d };
}

function card(ev, i, d) {
  const img = ev.imagem_card || ev.imagem || `assets/home/city-${ev.slug}.jpg`;
  const badge = ev.selo ? `<span class="event__badge">${ev.selo}</span>` : "";
  return `      <li class="event reveal"${i % 2 ? ' data-d="1"' : ""} data-end="${ev.fim}">
        <div class="event__img">${badge}<img decoding="async" src="${img}" alt="Skyline de ${ev.cidade}" loading="lazy" /></div>
        <div class="event__body">
          <span class="event__date">${d.card}</span>
          <h3 class="event__city">${ev.cidade}</h3>
          <span class="event__venue">${(ev.local && ev.local.nome) || "Local a definir"}</span>
          <span class="event__days">${d.diasCard}</span>
          <span class="event__time">${d.horarioCard}</span>
          <div class="event__cta"><a href="/${ev.slug}" class="btn btn--sm" data-event="${ev.cidade}">Ver evento</a></div>
        </div>
      </li>`;
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

let index = readFileSync(join(ROOT, "index.html"), "utf8");
index = between(index, "EVENTOS", upcoming.map((r, i) => card(r.ev, i, r.d)).join("\n"));
index = between(index, "EDICOES", upcoming.map((r) => `            <option value="${r.ev.cidade}">${r.ev.cidade} · ${r.d.curta}</option>`).join("\n"));
index = between(index, "RODAPE", upcoming.map((r) => `    <a href="/${r.ev.slug}">${r.ev.cidade}</a>`).join("\n"));
const nomes = [...new Set(upcoming.map((r) => r.ev.cidade))];
index = between(index, "CHIP", nomes.join(" <i>·</i> "));
const anos = [...new Set(upcoming.map((r) => r.d.ano))].join(" e ");
index = index.replace(/(<meta name="description" content="[^"]*?)Edições em [^"]*?\."/, `$1Edições em ${listaCidades(nomes)} em ${anos}."`);
writeFileSync(join(ROOT, "index.html"), index);
console.log(`  ✓ home: ${upcoming.length} próximos eventos (${nomes.join(", ")})`);
