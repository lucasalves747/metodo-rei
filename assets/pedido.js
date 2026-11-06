/* Método REI — página de confirmação do pedido (ingressos, impressão, agenda, materiais). */
(function () {
  "use strict";
  var P = window.MREI_PD, T = P.t, app = document.getElementById("app");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(c) { var v = c / 100; return "US$" + v.toLocaleString(P.locale, { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 }); }
  function fmt(s, o) { return s.replace(/\{(\w)\}/g, function (_, k) { return o[k] != null ? o[k] : ""; }); }
  var ICON = {
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  };

  var u = new URLSearchParams(location.search), o = u.get("o"), k = u.get("k");
  if (!o || !k) return falha();
  fetch("/api/pedido?o=" + encodeURIComponent(o) + "&k=" + encodeURIComponent(k))
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(render).catch(falha);

  function falha() {
    app.innerHTML = '<div class="state" role="alert">' + esc(T.pdErro) + '<br><br><a class="btn btn-line" href="' + esc(P.whatsapp) + '">WhatsApp</a></div>';
  }

  function datas(ev) {
    var a = new Date(ev.inicio + "T12:00:00Z"), b = new Date(ev.fim + "T12:00:00Z");
    var f = { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" };
    var t1 = a.toLocaleDateString(P.locale, f);
    if (ev.inicio === ev.fim) return cap(t1);
    return cap(a.toLocaleDateString(P.locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })) + " – " + b.toLocaleDateString(P.locale, f);
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function horas(ev) { return (ev.horarios || []).join(" · "); }
  function endereco(ev) { var l = ev.local || {}; return l.endereco_exibicao || l.endereco || [l.nome, ev.cidade + ", " + ev.uf].filter(Boolean).join(" · "); }
  function mapa(ev) { var l = ev.local || {}; return "https://www.google.com/maps/search/?api=1&query=" + (l.maps_query || encodeURIComponent(endereco(ev))); }

  function qrSvg(txt) {
    var q = qrcode(0, "M"); q.addData(txt); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }

  function render(d) {
    var ev = d.evento, n = (d.comprador.nome || "").split(" ")[0];
    var tickets = d.ingressos.map(function (t) {
      return '<article class="tk" data-n="' + t.n + '">' +
        '<div class="tk__main">' +
          '<div class="tk__head"><img src="/assets/logo-h-96.webp" alt="Método REI"><span class="badge">' + esc(d.tipoNome) + '</span></div>' +
          '<div class="tk__city serif">' + esc(ev.cidade) + '</div>' +
          '<div class="tk__when">' + esc(datas(ev)) + '<br>' + esc(horas(ev)) + '<br>' + esc(endereco(ev)) + '</div>' +
          '<div class="tk__grid">' +
            '<div><span>' + esc(T.pdTitular) + '</span><b>' + esc(t.titular) + '</b></div>' +
            '<div><span>' + esc(T.pdCodigo) + '</span><b>' + esc(t.codigo) + '</b></div>' +
            '<div><span>' + esc(T.pdPedido) + '</span><b>' + esc(d.pedido.slice(-8).toUpperCase()) + '</b></div>' +
            '<div><span>' + esc(T.ingresso || "") + '</span><b>' + esc(fmt(T.pdIngressoDe, { n: t.n, t: d.quantidade })) + '</b></div>' +
          '</div>' +
          (d.quantidade > 1 ? '<button type="button" class="btn btn-line tk__print no-print" data-print="' + t.n + '">' + ICON.print + esc(T.pdImprimir) + '</button>' : "") +
        '</div>' +
        '<div class="tk__qr"><div class="qr" role="img" aria-label="QR code ' + esc(t.codigo) + '">' + qrSvg(t.qr) + '</div><code>' + esc(t.codigo) + '</code><small>' + esc(T.pdApresente) + '</small></div>' +
      '</article>';
    }).join("");

    var ent = (d.entregas || []).length
      ? '<ul class="deliv">' + d.entregas.map(function (x) {
          var titulo = (x.titulo && (x.titulo[P.lang] || x.titulo.pt)) || x.titulo || "";
          var desc = x.descricao ? (x.descricao[P.lang] || x.descricao.pt || x.descricao) : "";
          return '<li><div><b>' + esc(titulo) + '</b>' + (desc ? '<p>' + esc(desc) + '</p>' : "") + '</div>' +
            (x.url ? '<a class="btn btn-line" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.tipo === "acesso" ? T.pdAcessar : T.pdBaixar) + '</a>' : "") + '</li>';
        }).join("") + '</ul>'
      : '<p class="muted">' + esc(T.pdSemEntregas) + '</p>';

    app.innerHTML =
      '<section class="hero">' +
        '<div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
        '<div class="kick">' + esc(T.pdTitulo) + '</div>' +
        '<h1 class="serif">' + esc(fmt(T.pdOla, { n: n })) + '</h1>' +
        '<p class="sub">' + esc(fmt(T.pdSub, { c: ev.cidade, e: d.comprador.email })) + '</p>' +
        '<div class="meta"><span>' + esc(T.pdPedido) + ' <b>' + esc(d.pedido.slice(-8).toUpperCase()) + '</b></span><span>' + esc(d.tipoNome) + ' × <b>' + d.quantidade + '</b></span><span>' + esc(T.pdTotal) + ' <b>' + money(d.total) + '</b></span></div>' +
        (d.reembolsado ? '<p class="warn">' + esc(T.pdReembolsado) + '</p>' : "") +
        '<div class="actions">' +
          '<button type="button" class="btn btn-gold" data-print="all">' + ICON.print + esc(T.pdImprimirTodos) + '</button>' +
          '<button type="button" class="btn btn-line" id="pdCal">' + ICON.cal + esc(T.pdCalendario) + '</button>' +
          '<a class="btn btn-line" href="' + esc(mapa(ev)) + '" target="_blank" rel="noopener">' + ICON.map + esc(T.pdMapa) + '</a>' +
        '</div>' +
      '</section>' +
      '<h2 class="serif no-print">' + esc(T.pdIngressos) + '</h2>' +
      '<div class="tickets">' + tickets + '</div>' +
      '<h2 class="serif no-print">' + esc(T.pdEntregas) + '</h2><div class="box">' + ent + '</div>' +
      '<p class="foot"><a href="' + esc(P.whatsapp) + '">' + esc(T.pdDuvidas) + '</a></p>';

    app.querySelectorAll("[data-print]").forEach(function (b) {
      b.addEventListener("click", function () {
        var which = b.getAttribute("data-print");
        document.body.classList.toggle("print-one", which !== "all");
        app.querySelectorAll(".tk").forEach(function (t) { t.classList.toggle("print-me", t.getAttribute("data-n") === which); });
        window.print();
      });
    });
    document.getElementById("pdCal").addEventListener("click", function () { ics(ev, d); });
    document.title = T.pdTitulo + " · Método REI " + ev.cidade;
  }

  // .ics com o horário local do evento
  function ics(ev, d) {
    function hm(s, fim) {
      var m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi, all = [], x;
      while ((x = m.exec(s))) all.push(x);
      var y = fim ? all[all.length - 1] : all[0];
      if (!y) return fim ? "1800" : "0900";
      var h = +y[1] % 12 + (/pm/i.test(y[3]) ? 12 : 0);
      return String(h).padStart(2, "0") + (y[2] || "00");
    }
    var h = ev.horarios || [], ini = ev.inicio.replace(/-/g, ""), fim = ev.fim.replace(/-/g, "");
    var tz = ev.tz || "America/New_York";
    var dt = function (day, t) { return day + "T" + t + "00"; };
    var linhas = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Metodo REI//PT", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
      "UID:" + d.pedido + "@metodorei.com",
      "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
      "DTSTART;TZID=" + tz + ":" + dt(ini, hm(h[0] || "", false)),
      "DTEND;TZID=" + tz + ":" + dt(fim, hm(h[h.length - 1] || "", true)),
      "SUMMARY:Método REI " + ev.cidade + " · " + d.tipoNome,
      "LOCATION:" + endereco(ev).replace(/,/g, "\\,"),
      "DESCRIPTION:" + (T.pdPedido + " " + d.pedido.slice(-8).toUpperCase() + " · " + location.href).replace(/,/g, "\\,"),
      "URL:" + location.href,
      "END:VEVENT", "END:VCALENDAR",
    ];
    var blob = new Blob([linhas.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "metodo-rei-" + ev.slug + ".ics";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
})();
