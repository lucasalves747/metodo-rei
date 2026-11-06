# Método REI — metodorei.com

- **Domains**: metodorei.com, www.metodorei.com, evento.metodorei.com (all serve the same site)
- **Vercel project**: `metodo-rei` (account lucasalves747s-projects) · metodo-rei.vercel.app
- **Stack**: static HTML, no build step. Inline CSS per page, local fonts (Outfit, Playfair) in `assets/fonts/`.
- **Pages**: `/` (index.html), `/miami`, `/dallas`, `/orlando`, `/boston`
- **Clean URLs**: production serves `/miami` from `miami.html`, so the host needs clean URLs on (`vercel.json` → `"cleanUrls": true`).
- **WhatsApp CTA**: wa.me/13053705595

## Source

- **GitHub**: lucasalves747/metodo-rei (public) — git remote `lucas`. Vercel auto-deploys `main`.
- Production on 2026-11-06 = commit `ba0f705` (2026-10-14). Verified identical to the live site.
- Design/brand rules: `PRODUCT.md`, `DESIGN.md`. Checkout links redirect to pag.metodorei.com via `vercel.json`.

## Change log

- 2026-11-06 — cloned real source; added SITE.md
