/* Método REI — rastreamento de afiliados (?ref=CODIGO).
   Guarda o código por 30 dias (cookie em .metodorei.com + localStorage) e o repassa
   para links internos, checkouts em pag.metodorei.com, WhatsApp, formulários e redirecionamentos.
   Em pag.metodorei.com (GHL) também preenche campos "referral"/"ref" do checkout.
   API: window.REI_REF.get() e window.REI_REF.decorate(url). */
(function () {
  "use strict";
  if (window.REI_REF) return;

  var KEY = "rei_ref", PARAM = "ref", DAYS = 30, MAX_AGE = DAYS * 864e5;
  var VALID = /^[A-Za-z0-9_-]{1,64}$/;
  var ROOT_DOMAIN = "metodorei.com";
  var WA_HOSTS = /^(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|(www\.)?whatsapp\.com)$/i;
  var host = location.hostname;
  var onRoot = host === ROOT_DOMAIN || host.slice(-ROOT_DOMAIN.length - 1) === "." + ROOT_DOMAIN;

  function valid(v) { return typeof v === "string" && VALID.test(v); }

  function readCookie() {
    var m = document.cookie.match(/(?:^|;\s*)rei_ref=([^;]*)/);
    if (!m) return null;
    try { var v = decodeURIComponent(m[1]); return valid(v) ? v : null; } catch (e) { return null; }
  }
  function readStorage() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || "null");
      if (o && valid(o.code) && o.exp > Date.now()) return o.code;
      if (o) localStorage.removeItem(KEY);
    } catch (e) {}
    return null;
  }
  function save(code) {
    var c = KEY + "=" + encodeURIComponent(code) + "; Max-Age=" + DAYS * 86400 + "; Path=/; SameSite=Lax";
    if (onRoot) c += "; Domain=." + ROOT_DOMAIN;
    if (location.protocol === "https:") c += "; Secure";
    try { document.cookie = c; } catch (e) {}
    try { localStorage.setItem(KEY, JSON.stringify({ code: code, exp: Date.now() + MAX_AGE })); } catch (e) {}
  }

  // O ?ref= mais recente sempre substitui o anterior.
  var fromUrl = null;
  try { fromUrl = new URLSearchParams(location.search).get(PARAM); } catch (e) {}
  if (valid(fromUrl)) save(fromUrl); else fromUrl = null;

  function get() { return fromUrl || readCookie() || readStorage(); }

  function isInternal(u) {
    var h = u.hostname;
    return h === host || h === ROOT_DOMAIN || h.slice(-ROOT_DOMAIN.length - 1) === "." + ROOT_DOMAIN;
  }

  function decorate(url) {
    var code = get();
    if (!code || url == null) return url;
    var raw = String(url).trim();
    if (!raw || raw.charAt(0) === "#" || /^(mailto|tel|sms|javascript|data|blob):/i.test(raw)) return url;
    var u;
    try { u = new URL(raw, location.href); } catch (e) { return url; }
    var absolute = /^[a-z][a-z0-9+.-]*:|^\/\//i.test(raw);

    if (/^https?:$/.test(u.protocol) && WA_HOSTS.test(u.hostname)) {
      var tag = "[ref: " + code + "]";
      var text = (u.searchParams.get("text") || "").replace(/\s*\[ref: [A-Za-z0-9_-]{1,64}\]\s*$/, "");
      u.searchParams.set("text", text ? text + " " + tag : tag);
      u.search = u.search.replace(/\+/g, "%20"); // literal "+" is already %2B; wa.me expects %20 for spaces
      return u.toString();
    }
    if (!/^https?:$/.test(u.protocol) || !isInternal(u)) return url;
    if (u.searchParams.get(PARAM) === code) return url;
    u.searchParams.set(PARAM, code);
    if (!absolute && u.origin === location.origin) return u.pathname + u.search + u.hash;
    return u.toString();
  }

  function decorateLink(a) {
    var href = a.getAttribute("href");
    if (href == null) return;
    var next = decorate(href);
    if (next !== href) a.setAttribute("href", next);
  }
  function decorateForm(f) {
    var code = get();
    if (!code) return;
    var input = f.querySelector("input[name='" + PARAM + "']");
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden"; input.name = PARAM;
      f.appendChild(input);
    }
    if (input.value !== code) input.value = code;
  }
  // Checkout (GHL em pag.metodorei.com): preenche campos cujo name/placeholder tenha "referral" ou "ref".
  var REF_FIELD = /referral|(^|[^a-z])ref([^a-z]|$)/i;
  var valueSetter = (Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value") || {}).set;
  function fillInput(el) {
    var code = get();
    if (!code || el.tagName !== "INPUT" || /^(checkbox|radio|submit|button|file|password)$/i.test(el.type)) return;
    if (!REF_FIELD.test(el.name || "") && !REF_FIELD.test(el.getAttribute("placeholder") || "")) return;
    if (el.value === code) return;
    if (valueSetter) valueSetter.call(el, code); else el.value = code;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches("a[href],area[href]")) decorateLink(root);
    if (root.tagName === "FORM") decorateForm(root);
    if (root.tagName === "INPUT") fillInput(root);
    var inputs = root.querySelectorAll("input");
    for (var n = 0; n < inputs.length; n++) fillInput(inputs[n]);
    var links = root.querySelectorAll("a[href],area[href]");
    for (var i = 0; i < links.length; i++) decorateLink(links[i]);
    var forms = root.querySelectorAll("form");
    for (var j = 0; j < forms.length; j++) decorateForm(forms[j]);
  }

  function start() {
    if (!get()) return;
    scan(document);
    if ("MutationObserver" in window) {
      new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          var m = list[i];
          if (m.type === "attributes") { if (m.attributeName === "href") decorateLink(m.target); else fillInput(m.target); continue; }
          for (var k = 0; k < m.addedNodes.length; k++) {
            var n = m.addedNodes[k];
            if (n.nodeType === 1) { scan(n); if (n.closest) { var f = n.closest("form"); if (f) decorateForm(f); } }
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "name", "placeholder"] });
    }
  }

  // Rede de segurança: confere o link no momento do clique e no envio do formulário.
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest("a[href],area[href]");
    if (a) decorateLink(a);
  }, true);
  document.addEventListener("submit", function (e) { if (e.target && e.target.tagName === "FORM") decorateForm(e.target); }, true);

  // Redirecionamentos por JavaScript via window.open
  var nativeOpen = window.open;
  if (typeof nativeOpen === "function") {
    window.open = function (url) {
      var args = Array.prototype.slice.call(arguments);
      if (typeof url === "string" || url instanceof URL) args[0] = decorate(String(url));
      return nativeOpen.apply(window, args);
    };
  }

  window.REI_REF = { get: get, decorate: decorate };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
