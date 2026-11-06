#!/usr/bin/env python3
"""Gera as imagens de compartilhamento (1200x630) em assets/og/ a partir de eventos/og-data.json.
Rode depois de `node eventos/build.mjs`. Precisa de: pip install playwright + Google Chrome (ou `playwright install chromium`).
Uso: python3 eventos/og.py [slug ...]   (sem argumentos gera todas + home, em PT, EN e ES)
Saída: assets/og/<slug>.jpg (PT), assets/og/en/<slug>.jpg, assets/og/es/<slug>.jpg"""
import json, sys, pathlib, asyncio, shutil
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "eventos/og-data.json").read_text())
TXT = {
  "pt": {"imersao": "Imersão presencial", "apartir": "Ingressos a partir de US$", "tour": "IMERSÃO PRESENCIAL · TOUR EUA", "tag": 'Todo Rei é rico. <em>Mas nem todo rico é Rei.</em>', "breve": "Novas datas em breve"},
  "en": {"imersao": "In-person immersion", "apartir": "Tickets from US$", "tour": "IN-PERSON IMMERSION · US TOUR", "tag": 'Every King is rich. <em>But not every rich man is a King.</em>', "breve": "New dates coming soon"},
  "es": {"imersao": "Inmersión presencial", "apartir": "Entradas desde US$", "tour": "INMERSIÓN PRESENCIAL · GIRA EE. UU.", "tag": 'Todo Rey es rico. <em>Pero no todo rico es Rey.</em>', "breve": "Nuevas fechas muy pronto"},
}
CROWN = '<svg viewBox="0 0 24 20" fill="currentColor"><path d="M1.5 15.5 L3.8 5.5 L8.4 10.8 L12 2.5 L15.6 10.8 L20.2 5.5 L22.5 15.5 Z"/><rect x="1.8" y="16" width="20.4" height="3" rx="1"/></svg>'

CSS = """
@font-face{font-family:'Outfit';src:url('assets/fonts/outfit.woff2') format('woff2');font-weight:100 900}
@font-face{font-family:'Playfair';src:url('assets/fonts/playfair.woff2') format('woff2');font-weight:400 900}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;background:#0B0B0C;font-family:'Outfit',sans-serif;color:#fff}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:70% 25%}
.ov{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.95) 0%,rgba(0,0,0,.82) 42%,rgba(0,0,0,.25) 75%,rgba(0,0,0,.45) 100%),linear-gradient(0deg,rgba(0,0,0,.8),transparent 55%)}
.in{position:absolute;left:72px;top:64px;right:72px;bottom:60px;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:12px;color:#E9CC7E;font-weight:800;letter-spacing:.3em;font-size:22px}
.brand svg{width:34px;height:28px}
.city{margin-top:auto;font-weight:900;text-transform:uppercase;font-size:118px;line-height:.9;letter-spacing:-.01em}
.date{margin-top:18px;font-weight:700;font-size:34px;text-transform:uppercase;color:#E9CC7E}
.where{margin-top:8px;font-size:26px;color:rgba(255,255,255,.85)}
.row{margin-top:30px;display:flex;align-items:center;justify-content:space-between}
.pill{background:linear-gradient(180deg,#F2D27A,#D3A12C);color:#1a1204;font-weight:800;font-size:24px;padding:14px 28px;border-radius:999px;text-transform:uppercase;letter-spacing:.03em}
.faces{display:flex}
.faces img{width:74px;height:74px;border-radius:50%;object-fit:cover;object-position:center 15%;border:3px solid #0B0B0C;margin-left:-16px;box-shadow:0 0 0 2px rgba(217,180,90,.7)}
.home h1{margin-top:auto;font-family:'Playfair',serif;font-weight:700;font-size:128px;line-height:.95;background:linear-gradient(180deg,#FFF1C9,#E2BE68 50%,#A97F27);-webkit-background-clip:text;color:transparent}
.home .tag{margin-top:14px;font-size:40px;font-weight:300}
.home .tag em{font-family:'Playfair',serif;font-style:italic;color:#E9CC7E}
.home .cities{margin-top:26px;font-weight:700;font-size:26px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.9)}
"""

def page_evento(e, t):
    faces = "".join(f'<img src="{f}">' for f in e["fotos"][:7])
    return f"""<html><head><style>{CSS}</style></head><body>
<img class="bg" src="assets/hero2.jpg"><div class="ov"></div>
<div class="in"><div class="brand"><img src="assets/logo-metodo-rei.png" style="height:54px"></div>
<div class="city">{e['cidade']}</div>
<div class="date">{e['dias']} · {e['data']}</div>
<div class="where">{t['imersao']} · {e['onde']}</div>
<div class="row"><div class="pill">{t['apartir']}{e['min']}</div><div class="faces">{faces}</div></div></div></body></html>"""

def page_home(h, t):
    cid = " · ".join(h["cidades"]) or t["breve"]
    anos = "–".join(str(a) for a in h["anos"])
    return f"""<html><head><style>{CSS}</style></head><body class="home">
<img class="bg" src="assets/evento-1.jpg" style="object-position:60% 30%"><div class="ov"></div>
<div class="in"><img src="assets/logo-metodo-rei.png" style="height:120px;align-self:flex-start;margin-top:auto"><div class="cities" style="margin-top:22px;color:#E9CC7E">{t['tour']} {anos}</div><div class="tag">{t['tag']}</div>
<div class="cities">{cid}</div></div></body></html>"""

async def main():
    want = set(sys.argv[1:])
    chrome = shutil.which("google-chrome") or shutil.which("chromium")
    async with async_playwright() as p:
        b = await p.chromium.launch(**({"executable_path": chrome} if chrome else {}))
        pg = await b.new_page(viewport={"width": 1200, "height": 630})
        for lang, dados in DATA.items():
            t = TXT[lang]
            out = ROOT / "assets/og" / ("" if lang == "pt" else lang); out.mkdir(parents=True, exist_ok=True)
            jobs = [(e["slug"], page_evento(e, t)) for e in dados["eventos"] if not want or e["slug"] in want]
            if not want or "home" in want: jobs.append(("home", page_home(dados["home"], t)))
            for slug, html in jobs:
                tmp = ROOT / f"_og_{slug}.html"; tmp.write_text(html)
                await pg.goto(tmp.as_uri()); await pg.wait_for_timeout(700)
                dest = out / f"{slug}.jpg"
                await pg.screenshot(path=str(dest), type="jpeg", quality=86)
                tmp.unlink(); print("  ✓", dest.relative_to(ROOT))
        await b.close()

asyncio.run(main())
