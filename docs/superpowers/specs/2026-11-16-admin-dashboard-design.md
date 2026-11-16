# Painel do time de eventos — design

Date: 2026-11-16 · Status: draft for approval

## Intent

The Método REI event team needs one place to check how each event is selling and how many leads are coming in, without logging into Square or GHL. Today sales live only in Square and leads live only in Salee.ai (GHL); nobody on the team has a single view.

Users: the event team (non-technical), checking between and before events. Not door staff, not customer support.

## Goals

- See sales per event: tickets sold, revenue, by tier (Standard / VIP / REI), coupons used, over time.
- Browse and search orders: buyer, email, phone, event, tier, qty, guests, ticket codes, coupon, total, status, receipt link, confirmation link.
- See leads: count and list, filterable by event of interest, city/state, language, UTM source, date range.
- Export orders and leads to CSV.
- Numbers must match the money (Square is the source of truth for sales).

## Non-goals

- Editing events, prices, coupons (stays in `eventos/eventos.json` + build).
- Door check-in / QR scanning.
- Refunds or order changes (done in Square dashboard).
- Customer support actions (resend confirmation, etc.). The existing `/api/admin/salee` stays as is.
- Per-user accounts / audit trail.

## Anti-goals

- Showing totals that disagree with Square (e.g. counting unpaid OPEN orders, ignoring refunds, mixing sandbox orders into production).
- Exposing buyer/lead personal data to anyone without the password, or to search engines.
- Making the public site slower or adding a build step to it.

## Constraints

- Site is static HTML on Vercel with Node serverless functions in `api/` (ESM `.mjs`, no framework, no npm deps today). Keep that: no bundler, no framework.
- Sales: Square Orders API, already wrapped in `api/_lib/square.mjs`. Site orders are those with `metadata.evento`. Paid = `state COMPLETED` or total 0 (100% coupon). Per-ticket holder/email/n are in `line_items[].metadata`; order metadata has `evento, tipo, idioma, comprador, email, telefone, cupom?, utm?`. Ticket code = `codigoIngresso(orderId, n)`, confirmation link = `/pedido?o=…&k=chavePedido(id)`.
- Refunds: Square sets `refunds` / `return_amounts` on the order; net revenue must subtract them.
- Revenue shown = gross, minus coupons, minus refunds ("líquido"). Square processing fees are NOT subtracted; the UI labels it "antes das taxas da Square" (designer's call — avoids a per-payment fetch on every order).
- Environment: `SQUARE_ENV` decides sandbox vs production; show which one the dashboard is reading.
- Leads: not stored by the site. `api/lead.mjs` posts to `LEAD_WEBHOOK_URL` (GHL inbound webhook). Leads reach GHL as contacts tagged `Método REI - Lista Geral`, `site`, `Idioma: PT|EN|ES`, and `Interesse: <edição>`. How the webhook workflow maps cidade/estado/UTM into GHL contact fields is not known from this repo.
- Buyers also become GHL contacts (tag `Método REI - Comprou`) — leads list must not be confused with buyers; the leads view filters on `Método REI - Lista Geral`.
- Event names/tiers/prices come from `api/_lib/catalogo.mjs` (generated). Dashboard uses it for labels and event list.
- Vercel function max duration is configured per folder in `vercel.json` (`api/admin/*.mjs` = 60s).
- Team UI language: Portuguese (matches the codebase and team).

## Approaches

1. **Live dashboard on the site, reading Square + GHL APIs** — chosen. Always matches Square, includes all historic leads, no new storage. Needs a GHL Private Integration token; leads that never reached GHL aren't visible.
2. Same page, site also stores its own copy of leads (Vercel KV) — independent of GHL, but empty at launch (no historic leads) and adds a second home for leads. Can be added later as a separate change.
3. No code: GHL smart lists / Looker Studio — cheap, but revenue depends on webhook delivery and every team member needs a GHL seat.

The user picked 1.

## Design

### Access

- One shared team password (env `PAINEL_SENHA`). Builder's call vs. per-user logins; per-user was not requested.
- `POST /api/painel/login` checks the password (timing-safe, `confere`), sets an `HttpOnly; Secure; SameSite=Strict` cookie holding an HMAC-signed expiry (signing key: env `PAINEL_SEGREDO`, fallback derived from `TICKET_SECRET`), valid 7 days. `POST /api/painel/logout` clears it.
- Every `/api/painel/*` data endpoint rejects without a valid cookie (401). Simple rate limit on login is a nice-to-have, not required.
- The page `/painel` is static; it shows a login form until `/api/painel/sessao` says the cookie is valid. Page has `noindex`, is excluded from `sitemap.xml` and disallowed in `robots.txt`.

### Data endpoints (Node, `api/painel/*.mjs`)

- `GET /api/painel/pedidos?desde&ate&evento` — searches Square orders for the location (paginate cursor, cap ~2000), keeps site orders (`metadata.evento`), returns normalized rows: id, número (`id.slice(-8)`), data, evento, tipo, qty, unit, subtotal, desconto, total, reembolsado, líquido, cupom, comprador, email, telefone, idioma, utm, estado (pago / aberto-não-pago / reembolsado), ingressos [{n, codigo, titular, email}], recibo_url (from payment, optional — fetching each payment is costly; builder may omit or fetch lazily per order), link_confirmacao. Also returns `ambiente` (sandbox/production).
- `GET /api/painel/resumo?desde&ate` — computed server-side from the same order rows: per event × tier: ingressos, pedidos, bruto, descontos, reembolsos, líquido; cupons usage; daily series of tickets and revenue. (Builder may compute in browser from `pedidos` instead if simpler — same result.)
- `GET /api/painel/leads?desde&ate` — GHL API v2 (`services.leadconnectorhq.com`, env `GHL_API_TOKEN`, `GHL_LOCATION_ID`), contacts search filtered by tag `Método REI - Lista Geral`, paginated. Normalized rows: nome, email, telefone, cidade, estado, idioma (from tag), interesse (from `Interesse:` tag), utm_source/campaign (if present on contact — see open item), data de criação, link to the contact in GHL. If GHL env is missing, endpoint returns `{indisponivel: true}` and the UI shows a clear notice instead of failing.
- Short in-memory cache per function instance (~60s) is fine; no persistent storage.

### Page `/painel` (`painel.html`, vanilla JS, inline CSS following `DESIGN.md` colors/fonts)

```
┌ Método REI · Painel            [Produção]  período: [30 dias ▾]  Sair ┐
│ [Vendas] [Pedidos] [Leads]                                          │
├─────────────────────────────────────────────────────────────────────┤
│ Vendas                                                              │
│  Ingressos 412   Receita líquida $18.240   Pedidos 301   Leads 1.180 │
│  ┌ Orlando · 21 nov ───────┐ ┌ Boston · 5 dez ─────────┐           │
│  │ Standard 120  $7.200    │ │ Standard 40   $560      │  ...       │
│  │ VIP       38  $3.686    │ │ VIP          9   $423   │            │
│  │ REI        6  $1.182    │ │ REI          1   $197   │            │
│  └─────────────────────────┘ └─────────────────────────┘           │
│  Vendas por dia (barras: ingressos)   Cupons usados (tabela)        │
├─────────────────────────────────────────────────────────────────────┤
│ Pedidos: busca [nome/e-mail/código]  evento ▾  tipo ▾  [CSV]        │
│  data | nº | comprador | evento | tipo | qtd | total | estado      │
│  (clique abre detalhe: ingressos, convidados, links)                │
├─────────────────────────────────────────────────────────────────────┤
│ Leads: busca  interesse ▾  estado ▾  idioma ▾  [CSV]                │
│  data | nome | e-mail | telefone | cidade/UF | interesse | origem   │
└─────────────────────────────────────────────────────────────────────┘
```

- Events ordered by date; past events still shown (period filter covers it). Upcoming event first by default.
- Sandbox badge shown prominently when `ambiente = sandbox`.
- Mobile-usable (tables scroll horizontally inside their card).
- CSV export done in the browser from the loaded rows.
- One small chart (daily tickets) — inline SVG, no chart library.

### Config / deploy

- New env vars on Vercel: `PAINEL_SENHA`, `PAINEL_SEGREDO`, `GHL_API_TOKEN`, `GHL_LOCATION_ID`.
- `vercel.json`: add `api/painel/*.mjs` maxDuration 60.
- `.vercelignore`: add `docs/` so this spec isn't published.
- `robots.txt`: `Disallow: /painel`.

## Open item (needs a look at GHL, not a user decision)

- Which GHL contact fields hold cidade, estado and UTM for leads depends on the inbound-webhook workflow mapping in Salee.ai. Builder inspects one real lead contact via the API and maps what exists; missing fields show blank.

## Left to the builder

- Exact Square search filters/pagination, payment lookup strategy for receipt URLs, caching, file split inside `api/painel/`, visual details within `DESIGN.md`.
