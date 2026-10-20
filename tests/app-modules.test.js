// Module-level tests for the app: cart rules, shop hours, the WhatsApp
// handoff, and the service worker contract.
// Run: node tests/app-modules.test.js  (requires jsdom in /root/lint-tools)
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("/root/lint-tools/node_modules/jsdom");

const ROOT = path.resolve(__dirname, "..");
const rd = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const html = rd("index.html");
const i18nJs = rd("js/i18n.js");
const hoursJs = rd("js/hours.js");
const cartJs = rd("js/cart.js");
const swJs = rd("sw.js");
const manifestJson = JSON.parse(rd("manifest.json"));
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

function moduleWindow(seed) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "outside-only",
    url: "http://127.0.0.1:8899/"
  });
  const w = dom.window;
  // Each JSDOM window has its own localStorage, so a corrupt value has to be
  // seeded BEFORE the cart module reads it on startup.
  if (seed !== undefined) w.localStorage.setItem("shop_cart_v1", seed);
  w.eval(i18nJs);
  w.eval(hoursJs);
  w.eval(cartJs);
  return w;
}

(async () => {
  console.log("\n=== CART: ADD / STOCK ===");
  const w = moduleWindow();
  const Cart = w.Cart;
  const rasgulla = items.find((i) => i.id === "rasgulla-01"); // qty 48
  const litti = items.find((i) => i.id === "litti-04"); // qty 0

  ok("add returns the amount taken", Cart.add("rasgulla-01", 48, 1) === 1);
  ok("count reflects the addition", Cart.count() === 1);
  ok("qtyOf reads back", Cart.qtyOf("rasgulla-01") === 1);
  ok("has() is true for a present item", Cart.has("rasgulla-01"));
  ok("has() is false for an absent item", !Cart.has("nope"));

  ok("sold-out item cannot be added", Cart.add("litti-04", 0, 1) === 0);
  ok("sold-out item stays absent", !Cart.has("litti-04"));

  ok("amount of 0 is rejected", Cart.add("rasgulla-01", 48, 0) === 0);
  ok("negative amount is rejected", Cart.add("rasgulla-01", 48, -3) === 0);
  ok("empty id is rejected", Cart.add("", 48, 1) === 0);
  ok("non-numeric amount is rejected", Cart.add("rasgulla-01", 48, "abc") === 0);

  console.log("\n=== CART: STOCK CEILING ===");
  Cart.clear();
  Cart.add("rasgulla-01", 48, 48);
  ok("cart holds the full stock", Cart.qtyOf("rasgulla-01") === 48);
  ok("adding past stock returns 0", Cart.add("rasgulla-01", 48, 1) === 0);
  ok("qty stays at the stock limit", Cart.qtyOf("rasgulla-01") === 48);

  Cart.clear();
  Cart.add("rasgulla-01", 3, 10);
  ok("add is clamped to remaining stock", Cart.qtyOf("rasgulla-01") === 3, String(Cart.qtyOf("rasgulla-01")));

  console.log("\n=== CART: QUANTITY CAP ===");
  Cart.clear();
  Cart.setQty("rasgulla-01", 500, 48);
  ok("qty is capped at stock", Cart.qtyOf("rasgulla-01") === 48, String(Cart.qtyOf("rasgulla-01")));
  Cart.setQty("rasgulla-01", 99, 9999);
  ok("qty is capped at 99", Cart.qtyOf("rasgulla-01") === 99, String(Cart.qtyOf("rasgulla-01")));

  console.log("\n=== CART: REMOVE ===");
  Cart.clear();
  Cart.add("rasgulla-01", 48, 1);
  ok("remove reports the item left", Cart.remove("rasgulla-01") === true);
  ok("remove on an absent item is a no-op", Cart.remove("rasgulla-01") === false);
  ok("cart is empty", Cart.count() === 0);

  console.log("\n=== CART: PERSISTENCE ===");
  Cart.clear();
  Cart.add("rasgulla-01", 48, 3);
  const stored = w.localStorage.getItem("shop_cart_v1");
  ok("cart is written to localStorage", !!stored);
  const parsed = JSON.parse(stored);
  ok(
    "stored payload holds only id and qty",
    parsed["rasgulla-01"] === 3 &&
      Object.keys(parsed).every((k) => typeof parsed[k] === "number"),
    stored
  );
  ok(
    "stored payload holds no price",
    !/price/i.test(stored) && !/"[0-9]+"/.test(stored),
    stored
  );

  // Re-running the module in the same window is what a page reload does:
  // the module re-reads storage on startup.
  w.eval(cartJs);
  ok("cart survives a reload", w.Cart.qtyOf("rasgulla-01") === 3, String(w.Cart.qtyOf("rasgulla-01")));
  ok("reload keeps the count", w.Cart.count() === 3, String(w.Cart.count()));

  console.log("\n=== CART: CORRUPT STORAGE ===");
  const w2 = moduleWindow("{not json");
  ok("corrupt storage does not throw", w2.Cart.count() === 0, String(w2.Cart.count()));
  const w3 = moduleWindow("[1,2,3]");
  ok("array storage is rejected", w3.Cart.count() === 0, String(w3.Cart.count()));
  const w4 = moduleWindow('{"a":-5,"b":0}');
  ok("non-positive quantities are dropped", w4.Cart.count() === 0, String(w4.Cart.count()));
  const w5 = moduleWindow('{"a":3,"b":"x"}');
  ok("a valid quantity survives a mixed payload", w5.Cart.qtyOf("a") === 3, String(w5.Cart.qtyOf("a")));
  ok("a non-numeric quantity is dropped", w5.Cart.qtyOf("b") === 0);

  console.log("\n=== CART: WHATSAPP ORDER TEXT ===");
  Cart.clear();
  const lines = [
    { name: "Rasgulla", nameHi: "रसगुल्ला", price: 20, qty: 2 },
    { name: "Samosa", nameHi: "समोसा", price: 15, qty: 1 }
  ];
  const enText = Cart.buildOrderText(lines, shop, "en");
  ok("English message greets the shop", enText.indexOf("Hello Demo Sweet Shop") === 0, enText.split("\n")[0]);
  ok("English message lists the items", enText.indexOf("Rasgulla x 2") !== -1);
  ok("English message shows the line total", enText.indexOf("= ₹40") !== -1);
  ok("English message shows the grand total", enText.indexOf("Total: ₹55") !== -1, enText);
  ok("English message asks for confirmation", /confirm/i.test(enText));
  ok("English message does not claim payment", !/payment|pay now|paid/i.test(enText));

  const hiText = Cart.buildOrderText(lines, shop, "hi");
  ok("Hindi message greets the shop", hiText.indexOf("नमस्ते") === 0, hiText.split("\n")[0]);
  ok("Hindi message lists the Hindi item name", hiText.indexOf("रसगुल्ला") !== -1);
  ok("Hindi message shows the grand total", hiText.indexOf("₹55") !== -1);
  ok("Hindi message does not leak the English item name", hiText.indexOf("Rasgulla") === -1);

  console.log("\n=== CART: ORDER TEXT USES LIVE PRICES ===");
  const liveLines = [{ name: "Rasgulla", nameHi: "रसगुल्ला", price: 99, qty: 1 }];
  const liveText = Cart.buildOrderText(liveLines, shop, "en");
  ok("order text uses the price passed in, not a stored one", liveText.indexOf("₹99") !== -1);

  console.log("\n=== HOURS: DAY RANGE PARSING ===");
  const Hours = w.Hours;
  const monFri = Hours.parseDays("Mon–Fri");
  ok("Mon–Fri expands to 5 days", monFri && monFri.size === 5, monFri ? String(monFri.size) : "null");
  ok("Mon–Fri includes Wednesday", monFri && monFri.has(3));
  ok("Mon–Fri excludes Sunday", monFri && !monFri.has(0));
  ok("Mon–Fri excludes Saturday", monFri && !monFri.has(6));

  const hyphen = Hours.parseDays("Mon-Fri");
  ok("ASCII hyphen range works too", hyphen && hyphen.size === 5, hyphen ? String(hyphen.size) : "null");

  const listed = Hours.parseDays("Mon,Wed,Fri");
  ok("comma list parses to 3 days", listed && listed.size === 3, listed ? String(listed.size) : "null");
  ok("comma list includes Friday", listed && listed.has(5));

  ok("daily means every day", Hours.parseDays("Daily") === null);
  ok("empty days means every day", Hours.parseDays("") === null);
  ok("garbage days means every day", Hours.parseDays("notaday") === null);

  console.log("\n=== HOURS: TIME PARSING ===");
  ok("09:00 -> 540", Hours.parseTime("09:00") === 540);
  ok("21:30 -> 1290", Hours.parseTime("21:30") === 1290);
  ok("00:00 -> 0", Hours.parseTime("00:00") === 0);
  ok("invalid time rejected", Hours.parseTime("25:00") === null);
  ok("non-string rejected", Hours.parseTime(900) === null);
  ok("garbage rejected", Hours.parseTime("abc") === null);

  console.log("\n=== HOURS: SHOP TIMEZONE ===");
  const noon = new Date("2026-10-15T06:30:00Z"); // 12:00 in Kolkata
  const zoned = Hours.zonedParts(noon, "Asia/Kolkata");
  ok("Kolkata noon is 12:00", zoned.minutes === 720, String(zoned.minutes));
  ok("Kolkata date is correct", zoned.dateKey === "2026-10-15", zoned.dateKey);
  ok("Kolkata weekday is Thursday", zoned.weekday === 4, String(zoned.weekday));

  const utc = Hours.zonedParts(noon, "UTC");
  ok("UTC time is the UTC time", utc.minutes === 390, String(utc.minutes));
  ok("the shop timezone changes the answer", utc.minutes !== zoned.minutes);

  console.log("\n=== HOURS: OPEN / CLOSED ===");
  const daytime = { open: "09:00", close: "21:00", days: "Mon–Sun" };
  const openStatus = Hours.status(daytime, {
    timezone: "Asia/Kolkata",
    now: new Date("2026-10-15T06:30:00Z")
  });
  ok("12:00 Kolkata on a Thursday is open", openStatus.state === "open", openStatus.state);
  ok("open status carries the opening time", openStatus.open === "09:00");
  ok("open status carries the closing time", openStatus.close === "21:00");

  const early = Hours.status(daytime, {
    timezone: "Asia/Kolkata",
    now: new Date("2026-10-14T22:00:00Z") // 03:30 Kolkata, Thursday
  });
  ok("03:30 Kolkata is closed", early.state === "closed", early.state);
  ok("closed status knows the next opening", early.nextOpen === "09:00", String(early.nextOpen));

  const afterClose = Hours.status(daytime, {
    timezone: "Asia/Kolkata",
    now: new Date("2026-10-15T16:00:00Z") // 21:30 Kolkata
  });
  ok("21:30 Kolkata is closed", afterClose.state === "closed", afterClose.state);

  const atClose = Hours.status(daytime, {
    timezone: "Asia/Kolkata",
    now: new Date("2026-10-15T15:30:00Z") // exactly 21:00
  });
  ok("closing time is exclusive", atClose.state === "closed", atClose.state);

  const atOpen = Hours.status(daytime, {
    timezone: "Asia/Kolkata",
    now: new Date("2026-10-15T03:30:00Z") // exactly 09:00
  });
  ok("opening time is inclusive", atOpen.state === "open", atOpen.state);

  console.log("\n=== HOURS: CLOSED DAYS ===");
  const weekdaysOnly = { open: "09:00", close: "21:00", days: "Mon–Fri" };
  const sundayNoon = Hours.status(weekdaysOnly, {
    timezone: "Asia/Kolkata",
    now: new Date("2026-10-18T06:30:00Z") // Sunday 12:00
  });
  ok("a Sunday is closed for a Mon–Fri shop", sundayNoon.state === "closed", sundayNoon.state);
  ok("next opening is on a weekday", sundayNoon.nextOpenDay === 1, String(sundayNoon.nextOpenDay));
  ok("next opening text is produced", !!sundayNoon.nextOpenText, String(sundayNoon.nextOpenText));

  const sundayNight = Hours.status(weekdaysOnly, {
    timezone: "Asia/Kolkata",
    now: new Date("2026-10-18T20:00:00Z") // Monday 01:30
  });
  ok("a Monday 01:30 is closed for a 09:00 shop", sundayNight.state === "closed", sundayNight.state);
  ok("next opening is today at 09:00", sundayNight.nextOpen === "09:00");
  ok("next opening is on the same weekday", sundayNight.nextOpenDay === 1, String(sundayNight.nextOpenDay));

  console.log("\n=== HOURS: OVERNIGHT SHOP ===");
  const overnight = { open: "18:00", close: "02:00", days: "Mon–Sun" };
  const lateNight = Hours.status(overnight, {
    timezone: "Asia/Kolkata",
    now: new Date("2026-10-15T20:00:00Z") // Friday 01:30
  });
  ok("01:30 is open for an overnight shop", lateNight.state === "open", lateNight.state);

  const lateAfternoon = Hours.status(overnight, {
    timezone: "Asia/Kolkata",
    now: new Date("2026-10-15T10:00:00Z") // Friday 15:30
  });
  ok("15:30 is closed before an overnight opening", lateAfternoon.state === "closed", lateAfternoon.state);

  console.log("\n=== HOURS: MISSING CONFIG ===");
  const noHours = Hours.status(null, { timezone: "Asia/Kolkata" });
  ok("no hours -> unknown", noHours.state === "unknown", noHours.state);
  const partial = Hours.status({ open: "09:00" }, { timezone: "Asia/Kolkata" });
  ok("half-configured hours -> unknown", partial.state === "unknown", partial.state);
  const badTime = Hours.status({ open: "99:99", close: "21:00" }, { timezone: "Asia/Kolkata" });
  ok("invalid time -> unknown", badTime.state === "unknown", badTime.state);

  console.log("\n=== HOURS: UNKNOWN TIMEZONE FALLBACK ===");
  const weirdTz = Hours.status(daytime, {
    timezone: "Not/AZone",
    now: new Date("2026-10-15T06:30:00Z")
  });
  ok("an unknown timezone does not throw", weirdTz.state === "open" || weirdTz.state === "closed", weirdTz.state);

  console.log("\n=== SERVICE WORKER ===");
  ok("SW precaches the app shell", /index\.html/.test(swJs));
  ok("SW precaches js/app.js", /js\/app\.js/.test(swJs));
  ok("SW precaches js/cart.js", /js\/cart\.js/.test(swJs));
  ok("SW precaches js/hours.js", /js\/hours\.js/.test(swJs));
  ok("SW precaches js/i18n.js", /js\/i18n\.js/.test(swJs));
  ok("SW no longer precaches the removed js/menu.js", !/js\/menu\.js/.test(swJs));
  ok("SW has network-first for data JSON", /isDataRequest/.test(swJs));
  ok("SW does not serve data JSON from a stale cache first", !/PRECACHE[\s\S]*data\/items\.json/.test(swJs));
  ok("SW precaches individually so one 404 cannot abort install", /cache\.add\(file\)\.catch/.test(swJs));
  ok("SW skips waiting so a new version takes over", /skipWaiting/.test(swJs));
  ok("SW claims clients on activate", /clients\.claim/.test(swJs));
  ok("SW handles navigations network-first", /req\.mode === "navigate"/.test(swJs));

  console.log("\n=== SERVICE WORKER CACHE VERSION ===");
  const versionMatch = swJs.match(/const VERSION = "([^"]+)"/);
  ok("SW has a version constant", !!versionMatch, versionMatch ? versionMatch[1] : "missing");
  ok("SW version is not an unreplaced placeholder", !!versionMatch && versionMatch[1] !== "__SW_VERSION__", versionMatch ? versionMatch[1] : "missing");
  ok("SW version is content-derived", !!versionMatch && /^v[0-9a-f]{6,}$/.test(versionMatch[1]), versionMatch ? versionMatch[1] : "missing");
  ok("SW cache name is derived from the version", /const CACHE = "shop-" \+ VERSION/.test(swJs));
  ok("no bare hand-maintained cache version remains", !/const CACHE = "shop-v\d+"/.test(swJs));

  // The build script must be able to regenerate the version from the
  // precached files, and the committed version must match the current
  // contents — otherwise the app shell would be served stale.
  const precacheFiles = [
    "index.html",
    "404.html",
    "css/style.css",
    "js/i18n.js",
    "js/hours.js",
    "js/cart.js",
    "js/app.js",
    "manifest.json"
  ];
  const crypto = require("crypto");
  const hash = crypto
    .createHash("sha256")
    .update(precacheFiles.map((f) => fs.readFileSync(path.join(ROOT, f))).join(""))
    .digest("hex")
    .slice(0, 12);
  ok(
    "SW version matches the current file contents",
    versionMatch && versionMatch[1] === "v" + hash,
    "sw says " + (versionMatch ? versionMatch[1] : "?") + ", files hash to v" + hash
  );
  ok("build-sw script exists", fs.existsSync(path.join(ROOT, "scripts/build-sw.sh")));

  console.log("\n=== MANIFEST ===");
  ok("manifest is standalone", manifestJson.display === "standalone");
  ok("manifest has a 192 icon", manifestJson.icons.some((i) => i.sizes === "192x192"));
  ok("manifest has a 512 icon", manifestJson.icons.some((i) => i.sizes === "512x512"));
  ok("manifest has a maskable icon", manifestJson.icons.some((i) => (i.purpose || "").includes("maskable")));
  ok("manifest has a maskable 512 icon", manifestJson.icons.some((i) => i.sizes === "512x512" && (i.purpose || "").includes("maskable")));
  ok("manifest names a start_url", !!manifestJson.start_url);
  ok("manifest has a theme colour", !!manifestJson.theme_color);
  ok("manifest has a background colour", !!manifestJson.background_color);
  ok("manifest declares a scope", !!manifestJson.scope);
  ok("manifest declares shortcuts", Array.isArray(manifestJson.shortcuts) && manifestJson.shortcuts.length > 0);
  ok(
    "every declared icon exists on disk",
    manifestJson.icons.every((i) => fs.existsSync(path.join(ROOT, i.src))),
    manifestJson.icons.map((i) => i.src).filter((s) => !fs.existsSync(path.join(ROOT, s))).join(", ")
  );
  ok(
    "every icon is a real PNG or SVG",
    manifestJson.icons.every((i) => {
      const p = path.join(ROOT, i.src);
      const d = fs.readFileSync(p);
      if (i.type === "image/png") {
        return d.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      }
      return d.slice(0, 4).toString() === "<svg" || d.toString("utf8").indexOf("<svg") !== -1;
    })
  );

  console.log("\n=== APP REGISTERS THE SERVICE WORKER ===");
  const appJs = rd("js/app.js");
  ok("app registers sw.js", /register\("sw\.js"\)/.test(appJs));
  ok("app registers the service worker safely", /\.catch\(function/.test(appJs));

  console.log("\n=== INDEX REFERENCES THE NEW MODULES ===");
  ok("index loads js/i18n.js", /js\/i18n\.js/.test(html));
  ok("index loads js/hours.js", /js\/hours\.js/.test(html));
  ok("index loads js/cart.js", /js\/cart\.js/.test(html));
  ok("index loads js/app.js", /js\/app\.js/.test(html));
  ok("index no longer loads js/menu.js", !/js\/menu\.js/.test(html));

  console.log("\n══════════════════════════════════════");
  console.log("  RESULTS: " + pass + " passed, " + fail + " failed");
  console.log("══════════════════════════════════════");
  process.exit(fail > 0 ? 1 : 0);
})();