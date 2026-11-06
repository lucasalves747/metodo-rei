# Eventos do Método REI

A home (`index.html`) e as páginas de cada cidade são GERADAS. Não edite `index.html`, `orlando.html` etc. à mão.

- `eventos.json` — dados (eventos, preletores, preços, site)
- `home-template.html` — modelo da home (visual Turnê Real)
- `template.html` — modelo da página de evento
- `partes/` — blocos usados nos dois (pilares R.E.I., mural de fotos, "Você não vai apenas assistir…")

Todas as datas/locais vivem em `eventos.json`. Nunca edite `miami.html`, `dallas.html` etc. à mão — eles são gerados.

## Adicionar ou mudar um evento
1. Edite `eventos.json` (copie um evento existente e troque os campos).
2. Rode `node eventos/build.mjs`
3. Commit + push → a Vercel publica.

## Campos de um evento
- `slug` — vira a URL (`/dallas`). Cidade repetida: use o ano (`miami-2027`).
- `cidade`, `uf`, `estado` — "Dallas", "TX", "Texas"
- `inicio`, `fim` — AAAA-MM-DD. Todas as datas da página saem daqui. O card some da home no dia seguinte ao `fim`.
- `horarios` — ["6:30pm–11pm", "8:30am–8pm"] (um por dia)
- `local` — `{ "nome": "...", "endereco": "..." }` ou `{ "nome": "Local a definir" }`
- `selo` — opcional: "Pré-venda", "Últimas vagas"
- `checkout` — opcional; padrão: cart-<slug>, cart-vip-<slug>, cart-<slug>-rei em pag.metodorei.com
- `preletores` — lista de ids de `preletores` (padrão: `preletores_padrao`)
- `imagem_hero`, `imagem_card` — opcional; padrão assets/home/city-<slug>.jpg
- `oculto` — true para tirar da home sem apagar a página

## Preletores
Cada um em `preletores`: `nome`, `titulo_html` (sobrenome em dourado com `<span class="g">`), `funcao`, `foto` (caminho em assets/), `bio`.
3+ preletores usam a grade compacta de 3 colunas; 1–2 usam a de 2.

## SEO, redes sociais e IA (gerado automaticamente pelo build)
- Cada página recebe: título, descrição, canonical (www.metodorei.com), Open Graph/Twitter, favicon e dados estruturados (schema.org `Event` com data/hora no fuso certo, local, preços e mentores).
- A home recebe `Organization`, `WebSite` e a lista de próximos eventos.
- O build também gera `sitemap.xml`, `robots.txt` e `llms.txt` (resumo para assistentes de IA).
- Descrição personalizada para um evento: campo `seo_descricao`.
- Dados da marca (URL, descrição, WhatsApp, redes sociais): bloco `site` em `eventos.json`. Preencha `redes` com os links do Instagram/YouTube etc.

## Imagens de compartilhamento (1200×630)
Depois do build: `python3 eventos/og.py` (ou `python3 eventos/og.py orlando home`). Gera `assets/og/<slug>.jpg` e `assets/og/home.jpg`.
Precisa de Playwright + Chrome — o Claude roda isso no ambiente dele.

## "No palco" da home
Montado sozinho a cada build: primeiro os `preletores_fixos` (Hewerton e Santiago — sempre aparecem, em cor), depois todos os preletores dos eventos futuros, em P&B, sem repetir. Quando um evento passa ou é removido, quem só estava nele sai da home; quando um evento novo entra, os preletores dele aparecem.
