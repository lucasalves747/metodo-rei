# Referral tracking (?ref=CODE) — GoHighLevel setup

The site (metodorei.com) loads `/assets/rei-ref.js` on every page. It saves `?ref=CODE` for 30 days in a cookie on `.metodorei.com` and in localStorage, then adds the code to internal links, checkout links, WhatsApp messages and forms.

The checkout pages live in GHL at **pag.metodorei.com**. Three pieces carry the code into the CRM there:

1. The tracking script (below) in the funnel footer. It reads the cookie and fills the referral field.
2. A **Referral Code** contact custom field, added as a hidden field on each order form.
3. A workflow that tags the buyer `ref-{{contact.referral_code}}`.

Codes may contain only letters, numbers, `_` and `-`, up to 64 characters. Anything else is ignored. The newest `?ref=` replaces an older one.

---

## 1. Tracking code (Funnel Settings → Tracking Code → Footer)

For each funnel that serves pag.metodorei.com (cart-orlando, cart-vip-orlando, cart-orlando-rei, cart-boston, cart-vip-boston, cart-boston-rei, cart-miami, and any new carts):

1. **Sites → Funnels →** open the funnel → **Settings**.
2. Paste the whole block below into **Tracking Code → Footer Code**.
3. **Save.** If a funnel has per-step tracking code, leave the step-level code empty so this one applies.

On the checkout page, the script fills any input whose `name` or `placeholder` contains "referral" or the word "ref" (for example `referral_code`, `ref`, "Ref code"). It skips look-alikes such as `preferred_name` and `reference`. It fires `input`/`change` events so GHL's form sees the value. It also watches for fields GHL renders later, such as multi-step order forms.

This is the same code as `assets/rei-ref.js`. If you change that file, paste it here again.

```html
<script>
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
</script>
```

---

## 2. "Referral Code" custom field (hidden on each order form)

### Create the field (once)

1. **Settings → Custom Fields → + Add Field**.
2. Type **Single Line**. Name **Referral Code**. Object **Contact**, in any folder, for example "Tracking".
3. Save. Check that the unique key is **`contact.referral_code`**. If GHL generated a different key, note it and use it in the workflow below.

### Add it to every order form

For each checkout step (each cart funnel):

1. Open the step in the **funnel builder** → select the **Order Form** element.
2. In the form fields / **Add Field**, add the **Referral Code** custom field.
3. In that field's settings:
   - **Hidden**: on.
   - **Query key** (Field query key / "Populate from URL parameter"): **`ref`**.
   - Default value: empty.
4. **Save** and publish the step.

The query key fills the field from `?ref=` on the checkout URL, which the site always adds. The footer script fills it again from the cookie, so the field is still filled if the URL parameter is lost.

### Test

Open `https://www.metodorei.com/orlando?ref=TESTE` → click a ticket → **Continuar**. The checkout URL should contain `ref=TESTE`. Submit a test order. The contact's **Referral Code** should show `TESTE`.

---

## 3. Workflow: tag the buyer with the referral code

1. **Automation → Workflows → + Create Workflow → Start from scratch**. Name it "Referral — tag buyer".
2. **Trigger**: **Order Submitted**. Add a filter for the cart funnels if you want only these; no filter covers all of them.
3. **Action → If/Else**: condition **Contact → Referral Code → is not empty**.
4. On the **Yes** branch → **Action → Add Contact Tag** → tag: `ref-{{contact.referral_code}}`
   (type the custom value; GHL creates the tag `ref-TESTE`, `ref-joao`, and so on, when the action runs).
5. **Save → Publish.**

Notes:
- Run this workflow after the order form has written the field. Order Submitted runs after the form submit, so the value is already on the contact.
- The site's own checkout at metodorei.com (Square) also sends `referral_code` and a `ref-CODE` tag in its "pedido pago" webhook to Salee.ai, so buyers there are attributed too. Map `referral_code` → **Referral Code** in that inbound webhook workflow.
- Other lead captures carry the code too: the home community form sends `referral_code` and a `ref-CODE` tag to Salee.ai, and the city-page "Garanta seu ingresso" modal sends `ref` to the contacts endpoint.

---

## Reference

- Cookie / localStorage key: `rei_ref` (localStorage holds `{"code","exp"}`)
- JS API: `window.REI_REF.get()` → current code or `null`; `window.REI_REF.decorate(url)` → URL with `ref` added (or the WhatsApp text tagged with ` [ref: CODE]`)
- Links left unchanged: `#anchors`, `mailto:`, `tel:`, external sites
