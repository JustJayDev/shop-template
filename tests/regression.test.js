// Regression tests for the bugs found in the pre-launch audit.
// Run: node tests/regression.test.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("/root/lint-tools/node_modules/jsdom");

const ROOT = path.resolve(__dirname, "..");
const rd = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const html = rd("index.html");
const i18nJs = rd("js/i18n.js");
const menuJs = rd("js/menu.js");
const swJs = rd("sw.js");
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

const tick = () => new Promise((r) => setTimeout(r, 50));

function makeWindow(itemData, shopData) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://127.0.0.1:8899/" });
  const w = dom.window;
  w.fetch = function (url) {
    const n = String(url).split("/").pop();
    let d = null;
    if (n === "items.json") d = itemData;
    if (n === "shop.json") d = shopData;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(d) });
  };
  w.navigator.share = undefined;
  w.navigator.clipboard = undefined;
  w.eval(i18nJs);
  w.eval(menuJs);
  return w;
}

(async () => {
  const w = makeWindow(items, shop);
  await tick();
  await tick();
  const doc = w.document;
  const T = (id) => (doc.getElementById(id) ? doc.getElementById(id).textContent.trim() : "");

  console.log("\n=== BUG 1: special banner i18n ===");
  const before = T("specialName");
  ok("banner renders in English", /Jalebi/.test(before), before);
  doc.getElementById("langToggle").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  const after = T("specialName");
  ok("banner translated to Hindi", /जलेबी/.test(after), after);
  ok("banner no longer English", !/Jalebi/.test(after), after);

  console.log("\n=== BUG 2: shop hours prefix i18n ===");
  const hoursHi = T("shopHours");
  ok("hours prefix translated", hoursHi.startsWith("खुला:"), hoursHi);

  console.log("\n=== BUG 3: special banner unit i18n ===");
  ok("unit translated to Hindi", /\/पीस/.test(after), after);
  ok("no hardcoded /pc", !/\/pc/.test(after), after);

  // back to English for the rest
  doc.getElementById("langToggle").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();

  console.log("\n=== BUG 8: cards not focusable ===");
  ok("no tabindex on cards", !doc.querySelector(".item-card").hasAttribute("tabindex"));

  console.log("\n=== EMPTY-CONFIG GRACEFUL DEGRADATION ===");
  const emptyShop = {
    name: "X",
    nameHi: "X",
    whatsapp: "",
    address: "",
    mapsUrl: "",
    hours: {},
    testimonials: []
  };
  const w2 = makeWindow(items, emptyShop);
  await tick();
  await tick();
  const d2 = w2.document;
  ok("whatsapp FAB hidden when no number", d2.getElementById("whatsappFab").hidden);
  ok("hours hidden when unconfigured", d2.getElementById("shopHours").hidden);
  ok("address hidden when unconfigured", d2.getElementById("shopAddress").hidden);
  ok("directions hidden when no url", d2.getElementById("directionsLink").hidden);
  ok("testimonials section hidden", d2.getElementById("testimonialsSection").hidden);

  console.log("\n=== SERVICE WORKER ===");
  ok("SW cache bumped to v5", /CACHE = "shop-v5"/.test(swJs));
  ok("SW has network-first data path", /isDataRequest/.test(swJs));
  ok("SW no longer precaches data JSON", !/PRECACHE[\s\S]*data\/items\.json/.test(swJs));
  ok("SW precaches individually (1 404 safe)", /cache\.add\(file\)\.catch/.test(swJs));

  console.log("\n=== OG IMAGE ===");
  ok("og:image is PNG", /og:image" content="[^"]+\.png"/.test(html));
  ok("no SVG og:image", !/og:image" content="[^"]+\.svg"/.test(html));
  ok("og:image dimensions declared", /og:image:width/.test(html) && /og:image:height/.test(html));
  ok("share.png exists on disk", fs.existsSync(path.join(ROOT, "assets/share.png")));
  const png = fs.readFileSync(path.join(ROOT, "assets/share.png"));
  ok(
    "share.png is a real PNG",
    png.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  );
  ok("share.png is 1200x630", png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630);

  console.log("\n=== ADMIN PASSWORD ===");
  const adminJs = rd("admin/js/admin.js");
  const adminHtml = rd("admin/index.html");

  // The gate must compare against a 64-char SHA-256 hex digest.
  const hashMatch = adminJs.match(/PASS_HASH = "([0-9a-f]{64})"/);
  ok(
    "PASS_HASH holds a 64-char sha256 hex digest",
    !!hashMatch,
    hashMatch ? hashMatch[1] : "not found"
  );

  // If the password is supplied via env, verify the hash actually matches it.
  // (Kept out of the source tree on purpose.)
  if (process.env.ADMIN_PASSWORD) {
    const expected = crypto
      .createHash("sha256")
      .update(process.env.ADMIN_PASSWORD, "utf8")
      .digest("hex");
    ok("PASS_HASH matches ADMIN_PASSWORD", hashMatch && hashMatch[1] === expected, expected);
  } else {
    ok("ADMIN_PASSWORD not in env — hash-vs-password check skipped", true);
  }

  // No 4-digit PIN gate anymore (old gate was `const PIN = "1234"`).
  ok("no legacy short PIN constant", !/const PIN = "\d{4}"/.test(adminJs));
  ok("no demo PIN hint in UI", !/Demo PIN/.test(adminHtml));
  ok("admin manages shop settings", /shopForm/.test(adminHtml) && /shopForm/.test(adminJs));
  ok("admin can edit the special flag", /editSpecial/.test(adminHtml));

  console.log("\n=== DEAD CODE REMOVED ===");
  const css = rd("css/style.css") + rd("admin/css/admin.css");
  ok("no .hidden-item rule", !/\.hidden-item/.test(css));
  ok("no .pin-demo-hint rule", !/pin-demo-hint/.test(css));

  console.log("\n=== SITEMAP / ROBOTS ===");
  ok("sitemap.xml exists", fs.existsSync(path.join(ROOT, "sitemap.xml")));
  ok("robots.txt exists", fs.existsSync(path.join(ROOT, "robots.txt")));
  ok("robots disallows admin", /Disallow: \/admin\//.test(rd("robots.txt")));
  ok("deploy-config script exists", fs.existsSync(path.join(ROOT, "scripts/deploy-config.sh")));

  console.log("\n══════════════════════════════════════");
  console.log("  RESULTS: " + pass + " passed, " + fail + " failed");
  console.log("══════════════════════════════════════");
  process.exit(fail > 0 ? 1 : 0);
})();
