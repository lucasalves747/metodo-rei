/* Método REI — checkout no próprio site (Square Web Payments SDK).
   Lê window.MREI_CO (injetado pelo build em cada página de evento, no idioma da página).
   Se /api/checkout/config disser que o checkout não está ativo, nada muda: os botões seguem para o link antigo. */
(function () {
  "use strict";
  var C = window.MREI_CO;
  if (!C) return;
  var T = C.t;
  var cfg = null, payments = null, card = null, cardReady = null, walletReq = null, wallets = {};
  var st = { tier: null, qty: 1, cupom: "", quote: null, busy: false, guests: false };
  var root = null, $ = function (s) { return root.querySelector(s); };

  // ---------- util ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(cents) {
    var v = cents / 100, inteiro = cents % 100 === 0;
    var n = v.toLocaleString(C.locale, { minimumFractionDigits: inteiro ? 0 : 2, maximumFractionDigits: 2 });
    return "US$" + n;
  }
  function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); }
  function q(name) { try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; } }
  function utm() {
    var o = {};
    try { new URLSearchParams(location.search).forEach(function (v, k) { if (/^utm_/.test(k)) o[k] = v.slice(0, 80); }); } catch (e) {}
    return o;
  }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function post(url, body) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { d._status = r.status; return d; }); });
  }

  st.cupom = (q("cupom") || q("code") || q("coupon") || "").trim().toUpperCase();

  // ---------- ativa só se o servidor estiver configurado ----------
  fetch("/api/checkout/config").then(function (r) { return r.json(); }).then(function (c) {
    if (!c || !c.enabled) return;
    cfg = c;
    document.documentElement.classList.add("co-on");
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[data-tier]");
      if (!a) return;
      e.preventDefault(); e.stopImmediatePropagation();
      abrir(a.getAttribute("data-tier"));
    }, true);
    if (st.cupom) aviso(T.cupomLink.replace("{c}", st.cupom));
  }).catch(function () {});

  function aviso(txt) {
    var b = document.createElement("div");
    b.className = "co-toast"; b.setAttribute("role", "status"); b.textContent = txt;
    document.body.appendChild(b);
    setTimeout(function () { b.classList.add("in"); }, 30);
    setTimeout(function () { b.classList.remove("in"); setTimeout(function () { b.remove(); }, 400); }, 5200);
  }

  // ---------- SDK ----------
  var sdkPromise = null;
  function sdk() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (ok, fail) {
      if (window.Square) return ok(window.Square);
      var s = document.createElement("script");
      s.src = cfg.env === "production" ? "https://web.squarecdn.com/v1/square.js" : "https://sandbox.web.squarecdn.com/v1/square.js";
      s.onload = function () { ok(window.Square); };
      s.onerror = fail;
      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  // ---------- preço ----------
  function local() {
    var t = C.tiers[st.tier], unit = Math.round(t.preco * 100), sub = unit * st.qty;
    return { unit: unit, subtotal: sub, desconto: 0, total: sub, cupom: null };
  }
  var quoteSeq = 0;
  function cotar() {
    st.quote = local();
    render();
    if (!st.cupom) return Promise.resolve();
    var my = ++quoteSeq;
    setCupomMsg(T.cupomChecando, "");
    return post("/api/checkout/quote", { slug: C.slug, tier: st.tier, qty: st.qty, cupom: st.cupom }).then(function (d) {
      if (my !== quoteSeq) return;
      if (d._status !== 200) { setCupomMsg(T.erroGeral, "err"); return; }
      st.quote = d;
      if (d.cupomErro) { setCupomMsg(T.cupomErros[d.cupomErro] || T.cupomErros.invalido, "err"); }
      else if (d.cupom) { setCupomMsg(T.cupomOk.replace("{c}", d.cupom.codigo), "ok"); }
      render();
    }).catch(function () { if (my === quoteSeq) setCupomMsg(T.erroGeral, "err"); });
  }
  function setCupomMsg(t, cls) { var m = $(".co-cupom__msg"); if (!m) return; m.textContent = t; m.className = "co-cupom__msg " + (cls || ""); }

  // ---------- montar o painel ----------
  function abrir(tier) {
    if (!C.tiers[tier]) return;
    st.tier = tier; st.qty = 1; st.busy = false;
    if (!root) montar();
    root.hidden = false;
    document.documentElement.classList.add("co-lock");
    requestAnimationFrame(function () { root.classList.add("in"); });
    var lead = store("mrei_lead") || {};
    if (lead.nome && !$("#coNome").value) $("#coNome").value = lead.nome;
    if (lead.email && !$("#coEmail").value) $("#coEmail").value = lead.email;
    if (lead.telefone && !$("#coTel").value) $("#coTel").value = lead.telefone;
    if (st.cupom) { $("#coCupom").value = st.cupom; $(".co-cupom__box").hidden = false; $(".co-cupom__open").hidden = true; }
    erro("");
    cotar();
    iniciarPagamento();
    setTimeout(function () { var f = $("#coNome").value ? $(".co-qty__btn[data-d='1']") : $("#coNome"); f && f.focus({ preventScroll: true }); }, 320);
    if (window.fbq) try { fbq("track", "InitiateCheckout", { value: C.tiers[tier].preco, currency: "USD", content_name: "Método REI " + C.cidade + " " + C.tiers[tier].nome }); } catch (e) {}
  }
  function fechar() {
    if (!root || st.busy) return;
    root.classList.remove("in");
    document.documentElement.classList.remove("co-lock");
    setTimeout(function () { root.hidden = true; }, 280);
  }

  function montar() {
    root = document.createElement("div");
    root.className = "co"; root.hidden = true;
    root.innerHTML =
      '<div class="co__scrim" data-close></div>' +
      '<div class="co__sheet" role="dialog" aria-modal="true" aria-labelledby="coTitulo">' +
        '<header class="co__head">' +
          '<div><div class="co__kick">' + esc(C.eventoLinha) + '</div><h2 id="coTitulo" class="co__title"></h2></div>' +
          '<button type="button" class="co__x" data-close aria-label="' + esc(T.fechar) + '">&times;</button>' +
        '</header>' +
        '<form class="co__body" novalidate>' +
          '<div class="co-tiers" role="radiogroup" aria-label="' + esc(T.tipo) + '"></div>' +
          '<div class="co-row co-qty"><span id="coQtyL">' + esc(T.quantidade) + '</span>' +
            '<div class="co-qty__ctl" role="group" aria-labelledby="coQtyL">' +
              '<button type="button" class="co-qty__btn" data-d="-1" aria-label="' + esc(T.menos) + '">&minus;</button>' +
              '<output id="coQty" aria-live="polite">1</output>' +
              '<button type="button" class="co-qty__btn" data-d="1" aria-label="' + esc(T.mais) + '">+</button>' +
            '</div></div>' +
          '<div class="co-cupom">' +
            '<button type="button" class="co-link co-cupom__open">' + esc(T.temCupom) + '</button>' +
            '<div class="co-cupom__box" hidden><label class="co-sr" for="coCupom">' + esc(T.cupom) + '</label>' +
              '<input id="coCupom" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="' + esc(T.cupom) + '">' +
              '<button type="button" class="co-cupom__apply">' + esc(T.aplicar) + '</button></div>' +
            '<p class="co-cupom__msg" aria-live="polite"></p>' +
          '</div>' +
          '<dl class="co-tot"></dl>' +
          '<fieldset class="co-fs"><legend>' + esc(T.seusDados) + '</legend>' +
            campo("coNome", T.nome, "text", "name") +
            campo("coEmail", T.email, "email", "email") +
            campo("coTel", T.telefone, "tel", "tel", T.telefoneDica) +
          '</fieldset>' +
          '<div class="co-guests" hidden>' +
            '<label class="co-check"><input type="checkbox" id="coGuestsOn"> <span>' + esc(T.enviarOutros) + '</span></label>' +
            '<p class="co-hint">' + esc(T.outrosDica) + '</p>' +
            '<div class="co-guests__list" hidden></div>' +
          '</div>' +
          '<fieldset class="co-fs"><legend>' + esc(T.pagamento) + '</legend>' +
            '<div class="co-wallets"><div id="coApple" class="co-apple" hidden role="button" tabindex="0" aria-label="Apple Pay"></div><div id="coGoogle" hidden></div></div>' +
            '<div class="co-or" hidden><span>' + esc(T.ouCartao) + '</span></div>' +
            '<div id="coCard" class="co-card"><div class="co-card__load">' + esc(T.carregando) + '</div></div>' +
          '</fieldset>' +
          '<p class="co-err" role="alert"></p>' +
          '<button type="submit" class="co-pay"><span class="co-pay__txt"></span><span class="co-spin" aria-hidden="true"></span></button>' +
          '<p class="co-fine"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0110 0v3M5 10h14v11H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' +
            esc(T.seguro) + ' · <a href="' + esc(C.politica) + '" target="_blank" rel="noopener">' + esc(T.politica) + '</a></p>' +
          (cfg.env !== "production" ? '<p class="co-test">' + esc(T.modoTeste) + '</p>' : "") +
        '</form>' +
      '</div>';
    document.body.appendChild(root);

    root.addEventListener("click", function (e) { if (e.target.hasAttribute("data-close")) fechar(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !root.hidden) fechar(); });
    root.querySelectorAll(".co-qty__btn").forEach(function (b) {
      b.addEventListener("click", function () {
        var n = Math.max(1, Math.min(10, st.qty + Number(b.getAttribute("data-d"))));
        if (n === st.qty) return;
        st.qty = n; cotar(); guestsRender();
      });
    });
    $(".co-cupom__open").addEventListener("click", function () { $(".co-cupom__box").hidden = false; this.hidden = true; $("#coCupom").focus(); });
    function aplicar() { st.cupom = $("#coCupom").value.trim().toUpperCase(); if (!st.cupom) { setCupomMsg("", ""); } cotar(); }
    $(".co-cupom__apply").addEventListener("click", aplicar);
    $("#coCupom").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); aplicar(); } });
    $("#coGuestsOn").addEventListener("change", function () { st.guests = this.checked; guestsRender(); });
    $(".co__body").addEventListener("submit", function (e) { e.preventDefault(); pagar("card"); });
    ["coNome", "coEmail", "coTel"].forEach(function (id) {
      $("#" + id).addEventListener("input", function () { this.classList.remove("bad"); });
      $("#" + id).addEventListener("blur", salvarLead);
    });
  }

  function campo(id, label, type, ac, hint) {
    return '<div class="co-f"><label for="' + id + '">' + esc(label) + '</label>' +
      '<input id="' + id + '" type="' + type + '" autocomplete="' + ac + '"' + (type === "tel" ? ' inputmode="tel"' : "") + (hint ? ' placeholder="' + esc(hint) + '"' : "") + ' required></div>';
  }

  function render() {
    var t = C.tiers[st.tier], qd = st.quote || local();
    $(".co__title").textContent = t.nome + " · " + money(Math.round(t.preco * 100));
    $("#coQty").textContent = st.qty;
    root.querySelector(".co-qty__btn[data-d='-1']").disabled = st.qty <= 1;
    root.querySelector(".co-qty__btn[data-d='1']").disabled = st.qty >= 10;
    $(".co-tiers").innerHTML = Object.keys(C.tiers).map(function (k) {
      var x = C.tiers[k], on = k === st.tier;
      return '<button type="button" role="radio" aria-checked="' + on + '" class="co-tier' + (on ? " on" : "") + '" data-k="' + k + '"><b>' + esc(x.nome) + '</b><span>' + money(Math.round(x.preco * 100)) + '</span></button>';
    }).join("");
    root.querySelectorAll(".co-tier").forEach(function (b) {
      b.addEventListener("click", function () { if (st.tier !== b.getAttribute("data-k")) { st.tier = b.getAttribute("data-k"); cotar(); } });
    });
    var linhas = '<div><dt>' + esc(t.nome) + ' × ' + st.qty + '</dt><dd>' + money(qd.subtotal) + '</dd></div>';
    if (qd.desconto > 0) linhas += '<div class="co-tot__d"><dt>' + esc(T.desconto) + (qd.cupom ? " (" + esc(qd.cupom.codigo) + ")" : "") + '</dt><dd>−' + money(qd.desconto) + '</dd></div>';
    linhas += '<div class="co-tot__t"><dt>' + esc(T.total) + '</dt><dd>' + money(qd.total) + '</dd></div>';
    $(".co-tot").innerHTML = linhas;
    $(".co-pay__txt").textContent = qd.total > 0 ? T.pagar.replace("{v}", money(qd.total)) : T.confirmar;
    $(".co-guests").hidden = st.qty < 2;
    var semPagamento = qd.total === 0;
    root.querySelectorAll(".co-fs")[1].hidden = semPagamento;
    if (walletReq && qd.total > 0) {
      try { walletReq.update({ total: { amount: (qd.total / 100).toFixed(2), label: "Método REI" } }); } catch (e) {}
    }
  }

  function guestsRender() {
    var box = $(".co-guests__list");
    if (!st.guests || st.qty < 2) { box.hidden = true; return; }
    box.hidden = false;
    var old = {};
    box.querySelectorAll("input").forEach(function (i) { old[i.id] = i.value; });
    var h = "";
    for (var i = 2; i <= st.qty; i++) {
      h += '<div class="co-guest"><div class="co-guest__n">' + esc(T.ingresso) + ' ' + i + '</div>' +
        '<div class="co-guest__f"><label class="co-sr" for="coGN' + i + '">' + esc(T.nome) + '</label><input id="coGN' + i + '" placeholder="' + esc(T.nome) + '" autocomplete="off" value="' + esc(old["coGN" + i] || "") + '">' +
        '<label class="co-sr" for="coGE' + i + '">' + esc(T.email) + '</label><input id="coGE' + i + '" type="email" placeholder="' + esc(T.email) + '" autocomplete="off" value="' + esc(old["coGE" + i] || "") + '"></div></div>';
    }
    box.innerHTML = h;
  }

  // ---------- Square ----------
  function iniciarPagamento() {
    if (cardReady) return cardReady;
    cardReady = sdk().then(function (Square) {
      payments = Square.payments(cfg.appId, cfg.locationId);
      return payments.card({
        style: {
          ".input-container": { borderColor: "rgba(238,233,224,.22)", borderRadius: "6px" },
          ".input-container.is-focus": { borderColor: "#E3C78A" },
          ".input-container.is-error": { borderColor: "#E0796B" },
          input: { backgroundColor: "#121110", color: "#F2EEE6", fontSize: "16px" },
          "input::placeholder": { color: "#8F8A80" },
          ".message-text": { color: "#B9B2A5" }, ".message-icon": { color: "#B9B2A5" },
          ".message-text.is-error": { color: "#E0796B" }, ".message-icon.is-error": { color: "#E0796B" },
        },
      });
    }).then(function (c) {
      card = c;
      $("#coCard").innerHTML = "";
      return card.attach("#coCard");
    }).then(function () { carteiras(); }).catch(function (e) {
      console.error(e);
      $("#coCard").innerHTML = '<div class="co-card__load">' + esc(T.erroCarregar) + "</div>";
      cardReady = null;
    });
    return cardReady;
  }

  function carteiras() {
    var qd = st.quote || local();
    try {
      walletReq = payments.paymentRequest({ countryCode: "US", currencyCode: "USD", total: { amount: (Math.max(qd.total, 100) / 100).toFixed(2), label: "Método REI" } });
    } catch (e) { return; }
    payments.applePay(walletReq).then(function (ap) {
      wallets.apple = ap;
      var el = $("#coApple"); el.hidden = false; $(".co-or").hidden = false;
      el.addEventListener("click", function () { pagar("apple"); });
      el.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pagar("apple"); } });
    }).catch(function () {});
    payments.googlePay(walletReq).then(function (gp) {
      wallets.google = gp;
      return gp.attach("#coGoogle", { buttonColor: "white", buttonSizeMode: "fill", buttonType: "long" }).then(function () {
        $("#coGoogle").hidden = false; $(".co-or").hidden = false;
        $("#coGoogle").addEventListener("click", function () { pagar("google"); });
      });
    }).catch(function () {});
  }

  // ---------- pagar ----------
  function erro(t) { var e = $(".co-err"); if (e) { e.textContent = t; e.hidden = !t; } }
  function dados() {
    var ok = true, nome = $("#coNome").value.trim(), email = $("#coEmail").value.trim(), tel = $("#coTel").value.trim();
    if (nome.length < 2) { $("#coNome").classList.add("bad"); ok = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { $("#coEmail").classList.add("bad"); ok = false; }
    if (tel.replace(/\D/g, "").length < 7) { $("#coTel").classList.add("bad"); ok = false; }
    if (!ok) { erro(T.erroDados); var b = root.querySelector(".bad"); b && b.focus(); return null; }
    var convidados = [];
    if (st.guests) for (var i = 2; i <= st.qty; i++) {
      var gn = root.querySelector("#coGN" + i), ge = root.querySelector("#coGE" + i);
      convidados.push({ nome: gn ? gn.value.trim() : "", email: ge ? ge.value.trim() : "" });
    }
    return { nome: nome, email: email, telefone: tel, convidados: convidados };
  }
  function salvarLead() {
    var nome = $("#coNome").value.trim(), email = $("#coEmail").value.trim(), tel = $("#coTel").value.trim();
    if (!nome || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return;
    var prev = store("mrei_lead") || {};
    store("mrei_lead", { nome: nome, email: email, telefone: tel });
    if (prev.email === email || !C.lead) return;
    // registra o interessado (carrinho abandonado) uma vez por e-mail
    try {
      fetch(C.lead.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ nome: nome, email: email, telefone: tel, tags: C.lead.tags, origem: "checkout", notas: "Abriu o checkout: " + C.tiers[st.tier].nome }) });
    } catch (e) {}
  }
  function ocupado(on) {
    st.busy = on;
    root.classList.toggle("busy", on);
    $(".co-pay").disabled = on;
    root.querySelectorAll("input,button").forEach(function (b) { if (!b.classList.contains("co-pay")) b.disabled = on; });
    if (!on) render();
  }

  function pagar(metodo) {
    if (st.busy) return;
    erro("");
    var d = dados();
    if (!d) return;
    var qd = st.quote || local();
    if (st.cupom && (!qd.cupom || qd.cupom.codigo !== st.cupom)) { erro(T.cupomErros.invalido); return; }
    salvarLead();
    ocupado(true);
    var partes = d.nome.split(/\s+/);
    var verif = { amount: (qd.total / 100).toFixed(2), currencyCode: "USD", intent: "CHARGE", customerInitiated: true, sellerKeyedIn: false,
      billingContact: { givenName: partes[0], familyName: partes.slice(1).join(" ") || partes[0], email: d.email, phone: d.telefone } };
    var tokenP;
    if (qd.total === 0) tokenP = Promise.resolve(null);
    else if (metodo === "apple" && wallets.apple) tokenP = wallets.apple.tokenize();
    else if (metodo === "google" && wallets.google) tokenP = wallets.google.tokenize();
    else if (card) tokenP = card.tokenize(verif);
    else tokenP = Promise.reject(new Error("sem cartão"));

    tokenP.then(function (r) {
      if (r && r.status !== "OK") {
        var cancel = r.status === "Cancel" || r.status === "Abort";
        throw { ui: cancel ? "" : T.erroCartao };
      }
      return post("/api/checkout/pay", {
        slug: C.slug, tier: st.tier, qty: st.qty, cupom: st.cupom || "", totalEsperado: qd.total, lang: C.lang,
        sourceId: r ? r.token : null, idempotencia: st.chave || (st.chave = uuid()),
        comprador: { nome: d.nome, email: d.email, telefone: d.telefone }, convidados: d.convidados, utm: utm(),
      });
    }).then(function (res) {
      if (res.ok && res.link) {
        if (window.fbq) try { fbq("track", "Purchase", { value: qd.total / 100, currency: "USD", content_name: "Método REI " + C.cidade + " " + C.tiers[st.tier].nome, num_items: st.qty }); } catch (e) {}
        var u = new URL(res.link);
        location.href = u.pathname + u.search;
        return;
      }
      st.chave = null; // novo pedido na próxima tentativa
      if (res.erro === "preco_mudou") { erro(T.erroPreco); cotar(); }
      else if (res.erro === "pagamento") erro(T.erros[res.motivo] || T.erros.recusado);
      else if (res.erro === "cupom") erro(T.cupomErros[res.cupomErro] || T.cupomErros.invalido);
      else if (res.erro === "dados") erro(T.erroDados);
      else if (res.erro === "encerrado") erro(T.erroEncerrado);
      else erro(T.erroGeral);
      ocupado(false);
    }).catch(function (e) {
      if (e && e.ui !== undefined) erro(e.ui); else erro(T.erroGeral);
      ocupado(false);
    });
  }
})();
