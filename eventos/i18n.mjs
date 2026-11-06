// Tradução dos modelos HTML (PT → EN/ES) e localização das páginas geradas.
// Cada texto visível, atributo (alt, aria-label, placeholder, title, content) e texto de script
// do modelo precisa ter tradução em eventos/i18n/<lang>.json — senão o build para com erro.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const IDIOMAS = ["pt", "en", "es"];
export const HTML_LANG = { pt: "pt-BR", en: "en", es: "es" };
export const OG_LOCALE = { pt: "pt_BR", en: "en_US", es: "es_ES" };
export const prefixo = (lang) => (lang === "pt" ? "" : `/${lang}`);

export function dicionarios(dir) {
  const out = {};
  for (const l of IDIOMAS) if (l !== "pt") out[l] = JSON.parse(readFileSync(join(dir, "i18n", `${l}.json`), "utf8"));
  return out;
}

const temLetra = (s) => /[A-Za-zÀ-ú]/.test(s);
const jsTraduzivel = (s) => /[À-úçãõ]/.test(s) || /\b(Enviando|Continuar|Quero|Eu estou|Por favor|Não|Fechar)\b/.test(s);

// Traduz um modelo inteiro. `faltando` acumula o que não tem tradução.
export function traduzirModelo(html, dic, faltando) {
  const t = (s) => {
    if (Object.prototype.hasOwnProperty.call(dic, s)) return dic[s];
    faltando.add(s);
    return s;
  };
  const partes = html.split(/(<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>)/);
  return partes.map((p) => {
    if (!p) return p;
    if (p.startsWith("<style")) return p;
    if (p.startsWith("<script")) {
      if (p.includes("application/ld+json")) return p;
      // percorre comentários e strings em ordem, para não confundir o fim de uma string com o começo de outra
      return p.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"((?:[^"\\\n]|\\.)*)"/g, (m, s) =>
        s !== undefined && /[A-Za-zÀ-ú]/.test(s) && jsTraduzivel(s) ? `"${t(s)}"` : m);
    }
    if (p.startsWith("<")) {
      return p.replace(/\b(alt|aria-label|placeholder|title|content)="([^"]*)"/g, (m, a, v) => {
        if (/[A-Za-zÀ-ú]{2}/.test(v) && !v.startsWith("{{") && !/^(width=|IE=|text\/)/.test(v)) return `${a}="${t(v)}"`;
        return m;
      });
    }
    const norm = p.replace(/\s+/g, " ").trim();
    if (!temLetra(norm.replace(/\{\{\w+\}\}/g, ""))) return p;
    const ini = p.match(/^\s*/)[0], fim = p.match(/\s*$/)[0];
    return ini + t(norm) + fim;
  }).join("");
}

// Ajustes finais em cada página gerada: idioma do <html>, caminhos absolutos e links internos no idioma certo.
export function localizarPagina(html, lang, slugs) {
  let out = html.replace(/<html lang="[^"]*">/, `<html lang="${HTML_LANG[lang]}">`);
  out = out
    .replace(/\b(src|href|poster|content)="assets\//g, '$1="/assets/')
    .replace(/url\((['"]?)assets\//g, "url($1/assets/");
  if (lang !== "pt") {
    const pre = prefixo(lang);
    out = out.replace(/<a\b[^>]*>/g, (tag) => {
      if (tag.includes("hreflang=")) return tag; // links do seletor de idioma ficam como estão
      return tag.replace(/href="\/([a-z0-9-]*)(#[^"]*)?"/, (m, s, hash) => {
        if (s === "") return `href="${pre}${hash || ""}"`;
        if (slugs.has(s)) return `href="${pre}/${s}${hash || ""}"`;
        return m;
      });
    });
  }
  return out;
}

// Seletor PT · EN · ES. `caminho` é o caminho da página sem prefixo de idioma ("" para a home, "/orlando"...).
export function seletor(lang, caminho) {
  const rot = { pt: "PT", en: "EN", es: "ES" };
  const nome = { pt: "Português", en: "English", es: "Español" };
  return `<nav class="lang" aria-label="Idioma / Language">${IDIOMAS.map((l) => {
    const href = (prefixo(l) + caminho) || "/";
    return `<a href="${href}" hreflang="${HTML_LANG[l]}" lang="${HTML_LANG[l]}" title="${nome[l]}"${l === lang ? ' aria-current="page"' : ""}>${rot[l]}</a>`;
  }).join("")}</nav>`;
}
