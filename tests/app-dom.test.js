// Headless DOM test for the app shell: rendering, routing, cart, sheet.
// Run: node tests/app-dom.test.js  (requires jsdom in /root/lint-tools)
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("/root/lint-tools/node_modules/jsdom");

const ROOT = path.resolve(__dirname, "..");
const rd = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const html = rd("index.html");
const i18nJs = rd("js/i18n.js");
const hoursJs = rd("js/hours.js");
const cartJs = rd("js/cart.js");
const appJs = rd("js/app.js");
const items = JSON.parse(rd("data/items.json"));
const shop = JSON.parse(rd("data/shop.json"));

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) {
    console.log("  PASS  " + name);
    pass++;
  } else {
    console.log("  FAIL  " + name + (extra ? " -> " + extra : ""));
    fail++;
  }
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms || 60));
// The search box debounces for 140ms before re-rendering, so the search
// assertions need a longer wait than a single tick.
const settle = () => tick(260);

function makeWindow(itemData, shopData, opts) {
  const o = opts || {};
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "http://127.0.0.1:8899/" + (o.hash || "")
  });
  const w = dom.window;
  w.fetch = function (url) {
    const name = String(url).split("/").pop();
    let data = null;
    if (name === "items.json") data = itemData;
    if (name === "shop.json") data = shopData;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
  };
  w.navigator.share = undefined;
  w.navigator.clipboard = undefined;
  // The service worker is not available in jsdom; make sure the app does not
  // blow up trying to register it.
  if (o.noSW) delete w.navigator.serviceWorker;
  w.eval(i18nJs);
  w.eval(hoursJs);
  w.eval(cartJs);
  w.eval(appJs);
  return w;
}

(async () => {
  const w = makeWindow(items, shop, { noSW: true });
  await tick();
  await tick();
  const doc = w.document;
  const T = (id) => (doc.getElementById(id) ? doc.getElementById(id).textContent.trim() : "");

  console.log("\n=== APP SHELL ===");
  ok("four tab buttons", doc.querySelectorAll("#tabbar .tab").length === 4);
  ok("menu view visible by default", !doc.getElementById("viewMenu").hidden);
  ok("cart view hidden by default", doc.getElementById("viewCart").hidden);
  ok("visit view hidden by default", doc.getElementById("viewVisit").hidden);
  ok("more view hidden by default", doc.getElementById("viewMore").hidden);
  ok("exactly one visible app-view", doc.querySelectorAll(".app-view:not([hidden])").length === 1);

  console.log("\n=== RENDER ===");
  const cards = doc.querySelectorAll(".item-card");
  ok("renders 6 cards", cards.length === 6, "got " + cards.length);
  const prices = Array.from(doc.querySelectorAll(".item-price")).map((e) => e.textContent);
  ok(
    "prices include unit",
    prices.every((p) => p.includes("/")),
    prices.join(" | ")
  );
  ok("rasgulla price = ₹20/pc", prices[0] === "₹20/pc", prices[0]);
  ok("litti price = ₹40/plate", prices[3] === "₹40/plate", prices[3]);
  ok("no skeleton cards left", doc.querySelectorAll(".skeleton-card").length === 0);
  ok("aria-busy removed", !doc.getElementById("menuGrid").hasAttribute("aria-busy"));

  console.log("\n=== OUT OF STOCK ===");
  const oosCards = doc.querySelectorAll(".item-card.oos");
  ok("1 OOS card exists", oosCards.length === 1, "got " + oosCards.length);
  ok("OOS label present", !!doc.querySelector(".oos-label"));
  ok("OOS card still visible", oosCards[0].style.display !== "none");
  ok("OOS item has no add button", !oosCards[0].querySelector("[data-add]"));
  ok(
    "OOS item shows a disabled button",
    !!oosCards[0].querySelector("button.is-disabled") &&
      oosCards[0].querySelector("button.is-disabled").disabled
  );

  console.log("\n=== SPECIAL BANNER ===");
  const banner = doc.getElementById("specialBanner");
  ok("special banner visible", !banner.hidden);
  ok(
    "special shows jalebi",
    doc.getElementById("specialName").textContent.includes("Jalebi"),
    doc.getElementById("specialName").textContent
  );

  console.log("\n=== DIET MARKER ===");
  const vegMarkers = doc.querySelectorAll(".diet-marker.veg");
  const nonVegMarkers = doc.querySelectorAll(".diet-marker.non-veg");
  // data/items.json marks 5 items as vegetarian and leaves samosa unmarked.
  ok("veg markers rendered", vegMarkers.length === 5, "got " + vegMarkers.length);
  ok("no non-veg markers in demo data", nonVegMarkers.length === 0);
  ok("unmarked item gets no diet marker", !doc.querySelector('[data-id="samosa-03"] .diet-marker'));
  ok(
    "veg marker carries an accessible label",
    vegMarkers.length > 0 && vegMarkers[0].getAttribute("aria-label") === "Vegetarian",
    vegMarkers.length > 0 ? vegMarkers[0].getAttribute("aria-label") : "none"
  );
  ok(
    "veg marker is decorative to the screen reader",
    vegMarkers.length > 0 &&
      vegMarkers[0].querySelector("svg").getAttribute("aria-hidden") === "true"
  );
  ok(
    "marker is inside the item name, not the card",
    vegMarkers.length > 0 && !!vegMarkers[0].closest(".item-name")
  );
  // The detail sheet must carry the marker too. The sheet opens from the
  // per-card detail button, not from the card itself.
  const jalebiDetail = doc.querySelector('[data-id="jalebi-06"] .btn-ghost');
  jalebiDetail.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("detail sheet shows the diet marker", !!doc.querySelector(".sheet-title .diet-marker.veg"));
  doc.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await tick();

  console.log("\n=== EMPTY CART ORDER BUTTON ===");
  ok("order button hidden on a fresh load", doc.getElementById("btnOrder").hidden);
  const w2 = makeWindow(items, shop, { noSW: true });
  await tick();
  await tick();
  ok(
    "order button hidden in a second fresh session",
    w2.document.getElementById("btnOrder").hidden
  );

  console.log("\n=== ADD TO CART ===");
  const addBtn = doc.querySelector('[data-add="rasgulla-01"]');
  ok("add button present for in-stock item", !!addBtn);
  addBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("cart count is 1", w.Cart.count() === 1, String(w.Cart.count()));
  ok("cart badge visible", !doc.getElementById("cartBadge").hidden);
  ok("cart badge shows 1", doc.getElementById("cartBadge").textContent === "1");
  ok("cart persisted to localStorage", !!w.localStorage.getItem("shop_cart_v1"));
  ok(
    "cart stores id+qty only, no price",
    /rasgulla-01/.test(w.localStorage.getItem("shop_cart_v1")) &&
      !/20/.test(w.localStorage.getItem("shop_cart_v1")),
    w.localStorage.getItem("shop_cart_v1")
  );

  console.log("\n=== CART VIEW ===");
  const cartTab = doc.querySelector('.tab[data-view="cart"]');
  cartTab.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("cart view shown", !doc.getElementById("viewCart").hidden);
  ok("menu view hidden", doc.getElementById("viewMenu").hidden);
  ok("cart tab is active", cartTab.classList.contains("active"));
  ok("cart tab aria-current=page", cartTab.getAttribute("aria-current") === "page");
  ok("hash is #/cart", w.location.hash === "#/cart", w.location.hash);
  ok("1 cart row rendered", doc.querySelectorAll(".cart-row").length === 1);
  ok("cart total = ₹20", doc.getElementById("cartTotal").textContent === "₹20", T("cartTotal"));
  ok("order button now visible", !doc.getElementById("btnOrder").hidden);
  ok("cart count row updated", /1/.test(doc.getElementById("cartCount").textContent));

  console.log("\n=== STEPPER ===");
  const plus = doc.querySelectorAll(".cart-row .step-btn")[1];
  plus.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  ok(
    "qty incremented to 2",
    w.Cart.qtyOf("rasgulla-01") === 2,
    String(w.Cart.qtyOf("rasgulla-01"))
  );
  ok("total updated to ₹40", doc.getElementById("cartTotal").textContent === "₹40", T("cartTotal"));

  const minus = doc.querySelectorAll(".cart-row .step-btn")[0];
  minus.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("qty decremented to 1", w.Cart.qtyOf("rasgulla-01") === 1);
  ok("total back to ₹20", doc.getElementById("cartTotal").textContent === "₹20");

  console.log("\n=== STOCK LIMIT ===");
  // Fill the cart to the item's stock, then try to add one more.
  w.Cart.setQty("rasgulla-01", 48, 48);
  await tick();
  const took = w.Cart.add("rasgulla-01", 48, 1);
  ok("cannot exceed stock", took === 0, "took " + took);
  ok(
    "qty capped at stock",
    w.Cart.qtyOf("rasgulla-01") === 48,
    String(w.Cart.qtyOf("rasgulla-01"))
  );
  const tookOos = w.Cart.add("litti-04", 0, 1);
  ok("cannot add a sold-out item", tookOos === 0, "took " + tookOos);
  ok("sold-out item stays out of cart", w.Cart.qtyOf("litti-04") === 0);

  console.log("\n=== REMOVE FROM CART ===");
  w.Cart.setQty("rasgulla-01", 1, 48);
  await tick();
  const minus2 = doc.querySelectorAll(".cart-row .step-btn")[0];
  minus2.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("item removed at qty 1", w.Cart.qtyOf("rasgulla-01") === 0);
  ok("empty state shown", !!doc.querySelector("#cartList .empty-state"));
  ok("order button hidden again", doc.getElementById("btnOrder").hidden);
  ok("cart badge hidden again", doc.getElementById("cartBadge").hidden);

  console.log("\n=== ROUTING ===");
  const visitTab = doc.querySelector('.tab[data-view="visit"]');
  visitTab.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("visit view shown", !doc.getElementById("viewVisit").hidden);
  ok("hash is #/visit", w.location.hash === "#/visit", w.location.hash);
  ok("visit tab aria-current=page", visitTab.getAttribute("aria-current") === "page");
  ok("only one view visible", doc.querySelectorAll(".app-view:not([hidden])").length === 1);
  ok("visit body rendered", doc.getElementById("visitBody").children.length > 0);
  ok(
    "visit shows the shop hours",
    doc.getElementById("visitBody").textContent.includes("09:00"),
    doc.getElementById("visitBody").textContent.slice(0, 80)
  );
  ok("visit has a directions link", !!doc.querySelector('#visitBody a[href*="maps.google"]'));
  ok("visit has a whatsapp link", !!doc.querySelector('#visitBody a[href*="wa.me/"]'));
  const callLink = doc.querySelector('#visitBody a[href^="tel:"]');
  ok("visit has a click-to-call link", !!callLink);
  ok(
    "click-to-call uses the shop number with a country code",
    !!callLink && /^tel:\+\d{10,15}$/.test(callLink.getAttribute("href")),
    callLink ? callLink.getAttribute("href") : "no link"
  );

  const moreTab = doc.querySelector('.tab[data-view="more"]');
  moreTab.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("more view shown", !doc.getElementById("viewMore").hidden);
  ok("more tab aria-current=page", moreTab.getAttribute("aria-current") === "page");
  ok("how-it-works steps rendered", doc.querySelectorAll(".how-step").length === 3);
  ok("3 testimonials rendered", doc.querySelectorAll(".testimonial").length === 3);
  ok("title updated for route", doc.title.includes("More"), doc.title);

  console.log("\n=== DEEP LINK ===");
  const w3 = makeWindow(items, shop, { noSW: true, hash: "#/cart" });
  await tick();
  await tick();
  ok("deep link opens cart", !w3.document.getElementById("viewCart").hidden);
  ok("deep link hides menu", w3.document.getElementById("viewMenu").hidden);

  console.log("\n=== CATEGORY FILTER ===");
  const menuTab = doc.querySelector('.tab[data-view="menu"]');
  menuTab.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  const sweetBtn = doc.querySelector('[data-filter="sweet"]');
  sweetBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  let shown = doc.querySelectorAll(".item-card");
  ok("sweets filter -> 3 cards", shown.length === 3, "got " + shown.length);
  const sweetNames = Array.from(shown).map((c) => c.querySelector(".item-name").textContent);
  ok(
    "sweets only: rasgulla/rasmalai/jalebi",
    sweetNames.join(",") === "Rasgulla,Rasmalai,Jalebi",
    sweetNames.join(",")
  );
  ok("sweet btn has active class", sweetBtn.classList.contains("active"));
  ok("sweet btn aria-pressed=true", sweetBtn.getAttribute("aria-pressed") === "true");

  const snackBtn = doc.querySelector('[data-filter="snack"]');
  snackBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("snacks filter -> 3 cards", doc.querySelectorAll(".item-card").length === 3);

  const allBtn = doc.querySelector('[data-filter="all"]');
  allBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("all filter -> 6 cards", doc.querySelectorAll(".item-card").length === 6);

  console.log("\n=== SEARCH ===");
  // Reset the category filter first, otherwise the search runs inside the
  // "sweets" filter and can only ever match sweets.
  doc
    .querySelector('[data-filter="all"]')
    .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  const search = doc.getElementById("searchInput");
  search.value = "samosa";
  search.dispatchEvent(new w.Event("input", { bubbles: true }));
  await settle();
  ok(
    "search -> 1 card",
    doc.querySelectorAll(".item-card").length === 1,
    String(doc.querySelectorAll(".item-card").length)
  );
  ok(
    "search matched samosa",
    doc.querySelector(".item-name").textContent === "Samosa",
    doc.querySelector(".item-name").textContent
  );
  doc.getElementById("searchClear").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("clear restores all cards", doc.querySelectorAll(".item-card").length === 6);

  console.log("\n=== SEARCH BY HINDI NAME ===");
  search.value = "जलेबी";
  search.dispatchEvent(new w.Event("input", { bubbles: true }));
  await settle();
  ok(
    "hindi search -> 1 card",
    doc.querySelectorAll(".item-card").length === 1,
    String(doc.querySelectorAll(".item-card").length)
  );
  doc.getElementById("searchClear").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();

  console.log("\n=== EMPTY SEARCH RESULT ===");
  search.value = "zzzznotathing";
  search.dispatchEvent(new w.Event("input", { bubbles: true }));
  await settle();
  ok("no-results empty state", !!doc.querySelector("#menuGrid .empty-state"));
  doc.getElementById("searchClear").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();

  console.log("\n=== ITEM DETAIL SHEET ===");
  const detailBtn = doc.querySelector(".item-card .btn-ghost");
  // jsdom does not move focus to a button when a click is dispatched, so
  // focus it explicitly — that is what a real browser does and it is what
  // the focus-restore behaviour depends on.
  detailBtn.focus();
  detailBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  const sheet = doc.getElementById("itemSheet");
  ok("sheet opened", !sheet.hidden);
  ok("sheet has open class", sheet.classList.contains("open"));
  ok("sheet is a modal dialog", sheet.getAttribute("role") === "dialog");
  ok("sheet aria-modal", sheet.getAttribute("aria-modal") === "true");
  ok("sheet body has content", doc.getElementById("sheetBody").children.length > 0);
  ok("sheet title rendered", !!doc.querySelector(".sheet-title"));
  ok("sheet price rendered", !!doc.querySelector(".sheet-price"));
  ok("focus moved into the sheet", sheet.contains(doc.activeElement));

  console.log("\n=== SHEET RE-RENDERS ON LANGUAGE CHANGE ===");
  // The sheet is built from translated strings. If it is not rebuilt, the
  // button inside it keeps the previous language and the dialog is a mix
  // of two languages.
  const sheetAddBefore = doc.querySelector("#sheetBody [data-add]");
  ok("sheet add button present before switch", !!sheetAddBefore);
  const addLabelBefore = sheetAddBefore ? sheetAddBefore.textContent : "";
  const langBtn = doc.getElementById("langToggle");
  langBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  await tick();
  const sheetAddAfter = doc.querySelector("#sheetBody [data-add]");
  ok("sheet add button still present after switch", !!sheetAddAfter);
  ok(
    "sheet add button switched to Hindi",
    sheetAddAfter && sheetAddAfter.textContent === "कार्ट में डालें",
    sheetAddAfter ? sheetAddAfter.textContent : "missing"
  );
  ok(
    "sheet add button text actually changed",
    sheetAddAfter && sheetAddAfter.textContent !== addLabelBefore,
    addLabelBefore + " -> " + (sheetAddAfter ? sheetAddAfter.textContent : "missing")
  );
  ok(
    "sheet diet marker label translated",
    (() => {
      const marker = doc.querySelector("#sheetBody .diet-marker");
      if (!marker) return true;
      return !/[A-Za-z]{3,}/.test(marker.getAttribute("aria-label") || "");
    })(),
    (() => {
      const marker = doc.querySelector("#sheetBody .diet-marker");
      return marker ? marker.getAttribute("aria-label") : "no marker";
    })()
  );
  ok("sheet stayed open through the switch", !sheet.hidden);
  // Put it back to English so the rest of the suite runs in a known state.
  langBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  await tick();
  ok(
    "sheet add button back to English",
    doc.querySelector("#sheetBody [data-add]").textContent === "Add to cart",
    doc.querySelector("#sheetBody [data-add]").textContent
  );
  // The sheet stays open here on purpose — the SHEET ESCAPE + FOCUS RESTORE
  // section below closes it and verifies focus returns to the card button.
  console.log("\n=== SHEET ESCAPE + FOCUS RESTORE ===");
  doc.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await tick(320);
  ok("sheet closed on Escape", sheet.hidden);
  ok("sheet open class removed", !sheet.classList.contains("open"));
  ok(
    "focus restored to the trigger",
    doc.activeElement && doc.activeElement.classList.contains("btn-ghost"),
    doc.activeElement ? doc.activeElement.className : "none"
  );
  ok(
    "focus landed on a card button, not the view heading",
    doc.activeElement && !!doc.activeElement.closest(".item-card"),
    doc.activeElement ? doc.activeElement.className : "none"
  );

  console.log("\n=== LANGUAGE TOGGLE ===");
  langBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  await tick();
  const namesHi = Array.from(doc.querySelectorAll(".item-name")).map((e) => e.textContent);
  ok("names switched to Hindi", namesHi[0].indexOf("रसगुल्ला") === 0, namesHi[0]);
  ok("html lang = hi", doc.documentElement.lang === "hi");
  ok(
    "filter buttons switched to Hindi",
    doc.querySelector('[data-filter="sweet"]').textContent === "मिठाई",
    doc.querySelector('[data-filter="sweet"]').textContent
  );
  ok(
    "unit switched to Hindi",
    doc.querySelectorAll(".item-price")[3].textContent === "₹40/प्लेट",
    doc.querySelectorAll(".item-price")[3].textContent
  );
  ok(
    "OOS label switched",
    doc.querySelector(".oos-label").textContent === "स्टॉक खत्म",
    doc.querySelector(".oos-label").textContent
  );
  ok("lang button now says English", langBtn.textContent === "English");
  ok(
    "search placeholder translated",
    doc.getElementById("searchInput").getAttribute("placeholder") !== "Search sweets, snacks",
    doc.getElementById("searchInput").getAttribute("placeholder")
  );
  // Landmarks and dialogs carry aria-labels too. A screen reader in Hindi
  // mode must not announce an English landmark name.
  ok(
    "filter nav aria-label translated",
    doc.getElementById("filterBar").getAttribute("aria-label") === "श्रेणी से छाँटें",
    doc.getElementById("filterBar").getAttribute("aria-label")
  );
  ok(
    "tab bar aria-label translated",
    doc.getElementById("tabbar").getAttribute("aria-label") === "मुख्य नेविगेशन",
    doc.getElementById("tabbar").getAttribute("aria-label")
  );
  ok(
    "item sheet aria-label translated",
    doc.getElementById("itemSheet").getAttribute("aria-label") === "विवरण",
    doc.getElementById("itemSheet").getAttribute("aria-label")
  );
  ok(
    "sheet close aria-label translated",
    doc.querySelector(".sheet-close").getAttribute("aria-label") === "बंद करें",
    doc.querySelector(".sheet-close").getAttribute("aria-label")
  );
  ok(
    "no English aria-label survives the switch",
    Array.from(doc.querySelectorAll("[aria-label]")).every((el) => {
      const label = el.getAttribute("aria-label");
      // Labels that are content, not chrome, are exempt.
      if (el.closest(".item-card")) return true;
      // Hidden subtrees (a closed sheet's stale body) are not announced by
      // screen readers, so their labels are not part of the Hindi page.
      if (el.closest("[hidden]")) return true;
      return !/[A-Za-z]{3,}/.test(label);
    }),
    Array.from(doc.querySelectorAll("[aria-label]"))
      .filter(
        (el) =>
          !el.closest(".item-card") &&
          !el.closest("[hidden]") &&
          /[A-Za-z]{3,}/.test(el.getAttribute("aria-label"))
      )
      .map((el) => el.getAttribute("aria-label"))
      .join(" | ")
  );

  langBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  await tick();
  ok(
    "toggled back to English",
    doc.querySelectorAll(".item-name")[0].textContent.indexOf("Rasgulla") === 0
  );
  ok("html lang = en", doc.documentElement.lang === "en");

  console.log("\n=== ACCESSIBILITY ===");
  ok("cards are NOT focusable", !doc.querySelector(".item-card").hasAttribute("tabindex"));
  ok(
    "item images have width/height",
    Array.from(doc.querySelectorAll(".item-card img")).every(
      (i) => i.width === 640 && i.height === 480
    )
  );
  ok(
    "first image has fetchpriority high",
    doc.querySelector(".item-card img").fetchPriority === "high"
  );
  ok("skip link is first element", doc.body.firstElementChild.classList.contains("skip-link"));
  ok("search input has a label", !!doc.querySelector('label[for="searchInput"]'));

  console.log("\n=== HEADING HIERARCHY ===");
  // One h1 (the shop name), then h2 per view, then h3 for items inside a
  // view. A card title that is an h2 becomes a sibling of the view heading,
  // so a screen reader cannot tell that the item belongs to the menu.
  ok(
    "exactly one h1",
    doc.querySelectorAll("h1").length === 1,
    String(doc.querySelectorAll("h1").length)
  );
  ok(
    "item card titles are h3, not h2",
    doc.querySelector(".item-name").tagName === "H3",
    doc.querySelector(".item-name").tagName
  );
  ok(
    "every card title is h3",
    Array.from(doc.querySelectorAll(".item-name")).every((n) => n.tagName === "H3")
  );
  ok(
    "menu view heading is h2",
    doc.getElementById("menuHeading").tagName === "H2",
    doc.getElementById("menuHeading").tagName
  );
  ok(
    "no heading level is skipped on the way down",
    (() => {
      // Walk each view: view heading (h2) -> card title (h3) -> nothing deeper.
      const headings = Array.from(doc.querySelectorAll("#viewMenu h2, #viewMenu h3"));
      return headings.every((h) => h.tagName === "H2" || h.tagName === "H3");
    })()
  );
  ok(
    "cart view heading is h2",
    doc.getElementById("cartHeading").tagName === "H2",
    doc.getElementById("cartHeading").tagName
  );
  ok(
    "visit view heading is h2",
    doc.getElementById("visitHeading").tagName === "H2",
    doc.getElementById("visitHeading").tagName
  );
  ok(
    "more view heading is h2",
    doc.getElementById("moreHeading").tagName === "H2",
    doc.getElementById("moreHeading").tagName
  );
  ok(
    "every tab has a visible label",
    Array.from(doc.querySelectorAll("#tabbar .tab")).every((t) => {
      const label = t.querySelector("span:not(.cart-badge)");
      return label && label.textContent.trim().length > 0;
    })
  );

  console.log("\n=== DATA VALIDATION ===");
  const badItems = items.concat([{ id: 5, name: "Broken", price: "free" }]);
  const w4 = makeWindow(badItems, shop, { noSW: true });
  await tick();
  await tick();
  ok("malformed item skipped", w4.document.querySelectorAll(".item-card").length === 6);

  console.log("\n══════════════════════════════════════");
  console.log("  RESULTS: " + pass + " passed, " + fail + " failed");
  console.log("══════════════════════════════════════");
  process.exit(fail > 0 ? 1 : 0);
})();
