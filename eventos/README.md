# Eventos do Método REI

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
