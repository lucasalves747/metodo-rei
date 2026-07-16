# Design

## Theme
Cerimonial soberano. Base drenchada em navy quase-preto com ouro como acento raro e creme para os momentos de "luz". Art-direction por seção: a narrativa alterna entre escuro (tese, mecanismo, autoridade, fechamento) e claro (a dor, a experiência, a oferta) para dar respiração e ritmo. Nada de brilho — o ouro é fosco/metálico, não neon.

## Color Palette
- `--navy-950` #0B121C — fundo mais profundo (hero, fechamento)
- `--navy-900` #121C2B — navy da marca (fundo escuro padrão)
- `--navy-800` #1A2537 — superfícies elevadas no escuro / texto sobre creme
- `--gold` #B99135 — acento da marca (bordas, filetes, detalhes)
- `--gold-bright` #D9B45A — ouro clareado p/ texto grande sobre escuro (contraste)
- `--gold-soft` #E4C77E — realces/hover
- `--cream` #F4EBD5 — fundo das seções claras
- `--bone` #FAF6EE — off-white p/ cards claros
- `--ink` #16202F — corpo de texto sobre fundos claros
- `--muted-dark` #A9B2C0 — texto secundário sobre navy (≥4.5:1)
- `--muted-light` #5A6474 — texto secundário sobre creme
- `--danger` #9B2C2C / `--danger-bg` #F4E3E1 — coluna "não é para você"
Estratégia: **Drenched (escuro) + Committed** — o navy carrega a marca; ouro nunca ultrapassa ~8% da superfície.

## Typography
- Display/H1–H3: **Bodoni Moda** (Didone de alto contraste) — decreto/masthead soberano. Tracking apertado só até -0.02em; nunca mais.
- Corpo/UI/labels: **Hanken Grotesk** (grotesca limpa, humanista). Pesos 400/500/600/700.
- Eixo de contraste: serifa Didone de alto contraste × grotesca de baixo contraste.
- Escala fluida com clamp(), razão ≥1.25. Teto do H1 ≈ 5.5rem. Line-height +0.06 em texto claro sobre escuro.
- Caixa-alta reservada a labels curtos, kickers pontuais e afirmações-monumento (não em corpo).

## Motion
- Choreografia de load no hero (coroa + linhas + headline em cascata suave, ease-out-expo).
- Reveals on-scroll via IntersectionObserver que apenas *realçam* conteúdo já visível (nunca escondem por padrão).
- Filete/linha dourada que "desenha" (scaleX) em separadores-chave.
- Hover: botões com leve elevação + brilho dourado sutil; links com underline que cresce.
- `prefers-reduced-motion`: tudo vira crossfade/estático.

## Components
- Header sticky (transparente no topo → navy translúcido com blur ao rolar), CTA dourado.
- Botões: primário (ouro sólido, texto navy), secundário/ghost (borda dourada 1px sobre escuro).
- Cards de pilar R.E.I. (letra-monograma grande + título + texto), sem aninhar.
- Cards de mentor com moldura/anel dourado + placeholder de foto (iniciais).
- Cards de ingresso: Standard (sóbrio) × VIP (destaque dourado, selo "Mais escolhido").
- Colunas de filtro: "É para você" (ouro/navy) × "Não é" (vermelho tênue).
- CTA fixo discreto no mobile após a 1ª dobra.

## Layout
- Container máx ~1180px; medida de texto ≤72ch.
- Espaçamento fluido com clamp(); seções respiram (padding vertical generoso).
- Grids responsivos sem breakpoints via auto-fit/minmax onde couber.
- Coroa em SVG inline como marca-d'água sutil e como ícone.

## Placeholders (TROCAR antes de publicar)
- Fotos: hero (ambiente da imersão), 2 mentores (meio corpo), galeria da experiência.
- Dados [VALIDAR]: local do evento ("A definir"), preços ($200 individual / $300 duplo — Standard).
- Links: checkout Standard/VIP, WhatsApp, políticas (privacidade/reembolso/termos).
