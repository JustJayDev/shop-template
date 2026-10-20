// Verifies that every i18n key used anywhere resolves in BOTH languages,
// and that the English and Hindi dictionaries are exactly parallel.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const rd = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const i18nSrc = rd("js/i18n.js");
const appSrc = rd("js/app.js");
const cartSrc = rd("js/cart.js");
const hoursSrc = rd("js/hours.js");
const html = rd("index.html");

let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) {
    console.log("  PASS  " + name);
  } else {
    console.log("  FAIL  " + name + (extra ? " -> " + extra : ""));
    fail++;
  }
};

// --- Extract the two dictionaries by evaluating the module in a sandbox ---
const { JSDOM } = require("/root/lint-tools/node_modules/jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
const w = dom.window;
w.eval(i18nSrc);
const I18N = w.I18N;

// Pull the raw dictionaries straight from the module so we can compare key
// sets without relying on runtime fallbacks (which hide missing keys).
const enKeys = Object.keys(I18N.strings.en || {});
const hiKeys = Object.keys(I18N.strings.hi || {});

console.log("\n=== DICTIONARY PARITY ===");
ok("en dictionary parsed", Array.isArray(enKeys) && enKeys.length > 0, String(enKeys && enKeys.length));
ok("hi dictionary parsed", Array.isArray(hiKeys) && hiKeys.length > 0, String(hiKeys && hiKeys.length));

const enSet = new Set(enKeys || []);
const hiSet = new Set(hiKeys || []);
const missingInHi = (enKeys || []).filter((k) => !hiSet.has(k));
const missingInEn = (hiKeys || []).filter((k) => !enSet.has(k));
ok("every EN key exists in HI", missingInHi.length === 0, missingInHi.join(", "));
ok("every HI key exists in EN", missingInEn.length === 0, missingInEn.join(", "));
ok("key counts match", (enKeys || []).length === (hiKeys || []).length, `${enKeys.length} vs ${hiKeys.length}`);

console.log("\n=== KEYS USED IN CODE RESOLVE ===");
// T("key") calls in app.js / cart.js
const used = new Set();
[appSrc, cartSrc, hoursSrc].forEach((src) => {
  const re = /\bT\("([a-zA-Z0-9_]+)"\)/g;
  let m;
  while ((m = re.exec(src))) used.add(m[1]);
});
// t("key") inside cart.js buildOrderText
const tre = /\bt\("([a-zA-Z0-9_]+)"\)/g;
let tm;
while ((tm = tre.exec(cartSrc))) used.add(tm[1]);
// data-i18n="key" in HTML
const hre = /data-i18n="([a-zA-Z0-9_]+)"/g;
let hm;
while ((hm = hre.exec(html))) used.add(hm[1]);
// data-i18n-placeholder / data-i18n-aria / data-i18n-title
["placeholder", "aria", "title"].forEach((kind) => {
  const re2 = new RegExp('data-i18n-' + kind + '="([a-zA-Z0-9_]+)"', "g");
  let m2;
  while ((m2 = re2.exec(html))) used.add(m2[1]);
});
// "day" + N dynamic keys
used.add("day0");
used.add("day1");
used.add("day2");
used.add("day3");
used.add("day4");
used.add("day5");
used.add("day6");

const unresolved = [...used].filter((k) => !enSet.has(k));
ok("every used key exists in EN", unresolved.length === 0, unresolved.join(", "));
ok("used-key count is sane", used.size > 40, String(used.size));

// Every key must render a real string in both languages, not the key itself.
const notTranslated = [...used].filter((k) => {
  const en = I18N.t(k);
  return en === k;
});
ok("no used key falls through to its own name", notTranslated.length === 0, notTranslated.join(", "));

console.log("\n=== HINDI SANITY ===");
const hindiValues = (hiKeys || []).map((k) => ({ k, v: String(I18N.strings.hi[k] ?? "") }));

ok("no stray backslash before Devanagari", !hindiValues.some((x) => /\\[ऀ-ॿ]/.test(x.v)));
ok("no doubled Devanagari letters", !hindiValues.some((x) => /([ऀ-ॿ])\1/.test(x.v)));
ok("no empty Hindi strings", !hindiValues.some((x) => x.v.trim() === ""));

// A Hindi string that is pure ASCII is almost always an untranslated
// English string that slipped into the Hindi dictionary.
const asciiOnly = hindiValues.filter(
  (x) => !/[ऀ-ॿ]/.test(x.v) && /[A-Za-z]{3,}/.test(x.v) && !/^AI$/.test(x.v)
);
ok(
  "no untranslated English in Hindi dictionary",
  asciiOnly.length === 0,
  asciiOnly.map((x) => x.k + "=" + x.v).join(" | ")
);

// Every EN string must also be non-empty.
ok(
  "no empty English strings",
  !enKeys.some((k) => String(I18N.strings.en[k] ?? "").trim() === "")
);

console.log("\n══════════════════════════════════════");
console.log("  RESULTS: " + (fail === 0 ? "all passed" : fail + " failed"));
console.log("══════════════════════════════════════");
process.exit(fail > 0 ? 1 : 0);