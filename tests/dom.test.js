// Headless DOM test for shop-template interaction logic.
// Run: node tests/dom.test.js  (requires jsdom in /root/lint-tools)
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("/root/lint-tools/node_modules/jsdom");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const i18nJs = fs.readFileSync(path.join(ROOT, "js/i18n.js"), "utf8");
const menuJs = fs.readFileSync(path.join(ROOT, "js/menu.js"), "utf8");
const items = JSON.parse(fs.readFileSync(path.join(ROOT, "data/items.json"), "utf8"));
const shop = JSON.parse(fs.readFileSync(path.join(ROOT, "data/shop.json"), "utf8"));

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

function makeWindow(htmlStr, itemData, shopData) {
  const dom = new JSDOM(htmlStr, { runScripts: "outside-only", url: "http://127.0.0.1:8899/" });
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
  w.eval(i18nJs);
  w.eval(menuJs);
  return w;
}

const tick = () => new Promise((r) => setTimeout(r, 50));

(async () => {
  const window = makeWindow(html, items, shop);
  await tick();
  await tick();

  const doc = window.document;
  const cards = doc.querySelectorAll(".item-card");

  console.log("\n=== RENDER ===");
  ok("renders 6 cards", cards.length === 6, "got " + cards.length);

  const prices = Array.from(doc.querySelectorAll(".item-price")).map((e) => e.textContent);
  ok(
    "prices include unit",
    prices.every((p) => p.includes("/")),
    prices.join(" | ")
  );
  ok("rasgulla price = ₹20/pc", prices[0] === "₹20/pc", prices[0]);
  ok("litti price = ₹40/plate", prices[3] === "₹40/plate", prices[3]);

  console.log("\n=== OUT OF STOCK ===");
  const oosCards = doc.querySelectorAll(".item-card.oos");
  ok("1 OOS card exists", oosCards.length === 1, "got " + oosCards.length);
  ok("OOS label present", !!doc.querySelector(".oos-label"));
  ok("OOS item is still visible (not hidden)", oosCards[0].style.display !== "none");

  console.log("\n=== SKELETON CLEARED ===");
  ok("no skeleton cards left", doc.querySelectorAll(".skeleton-card").length === 0);
  ok("aria-busy removed", !doc.getElementById("menuGrid").hasAttribute("aria-busy"));

  console.log("\n=== SPECIAL BANNER ===");
  const banner = doc.getElementById("specialBanner");
  ok("special banner visible", !banner.hidden);
  ok(
    "special shows jalebi",
    doc.getElementById("specialName").textContent.includes("Jalebi"),
    doc.getElementById("specialName").textContent
  );

  console.log("\n=== SHOP INFO ===");
  ok(
    "hours rendered",
    doc.getElementById("shopHours").textContent.includes("09:00"),
    doc.getElementById("shopHours").textContent
  );
  ok(
    "address rendered",
    doc.getElementById("shopAddress").textContent.includes("Market Road"),
    doc.getElementById("shopAddress").textContent
  );
  ok(
    "whatsapp link built",
    doc.getElementById("whatsappFab").href.includes("wa.me/"),
    doc.getElementById("whatsappFab").href
  );
  ok(
    "directions link built",
    doc.getElementById("directionsLink").href.includes("maps.google"),
    doc.getElementById("directionsLink").href
  );
  ok("3 testimonials rendered", doc.querySelectorAll(".testimonial").length === 3);
  ok(
    "last updated rendered",
    doc.getElementById("lastUpdated").textContent.length > 0,
    doc.getElementById("lastUpdated").textContent
  );

  console.log("\n=== LANGUAGE TOGGLE ===");
  const langBtn = doc.getElementById("langToggle");
  langBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();

  const namesHi = Array.from(doc.querySelectorAll(".item-name")).map((e) => e.textContent);
  ok("names switched to Hindi", namesHi[0] === "रसगुल्ला", namesHi[0]);
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

  langBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("toggled back to English", doc.querySelectorAll(".item-name")[0].textContent === "Rasgulla");

  console.log("\n=== CATEGORY FILTER ===");
  const sweetBtn = doc.querySelector('[data-filter="sweet"]');
  sweetBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
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

  const snackBtn = doc.querySelector('[data-filter="snack"]');
  snackBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();
  shown = doc.querySelectorAll(".item-card");
  ok("snacks filter -> 3 cards", shown.length === 3, "got " + shown.length);

  const allBtn = doc.querySelector('[data-filter="all"]');
  allBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("all filter -> 6 cards", doc.querySelectorAll(".item-card").length === 6);

  console.log("\n=== ACCESSIBILITY ===");
  ok(
    "cards are NOT focusable (browse-only, non-interactive)",
    !doc.querySelector(".item-card").hasAttribute("tabindex")
  );
  ok(
    "images have width/height",
    Array.from(doc.querySelectorAll(".item-card img")).every(
      (i) => i.width === 640 && i.height === 480
    )
  );
  ok(
    "first image has fetchpriority high",
    doc.querySelector(".item-card img").fetchPriority === "high"
  );

  console.log("\n=== DATA VALIDATION ===");
  const badItems = items.concat([{ id: 5, name: "Broken", price: "free" }]);
  const w2 = makeWindow(html, badItems, shop);
  await tick();
  await tick();
  ok("malformed item skipped", w2.document.querySelectorAll(".item-card").length === 6);

  console.log("\n══════════════════════════════════════");
  console.log("  RESULTS: " + pass + " passed, " + fail + " failed");
  console.log("══════════════════════════════════════");
  process.exit(fail > 0 ? 1 : 0);
})();
