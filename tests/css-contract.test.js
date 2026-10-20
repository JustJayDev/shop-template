// Static CSS contract checks.
//
// These cannot run in jsdom (no layout engine), so they assert against the
// stylesheet source. They exist because a tap target below 44px is an
// accessibility regression that a DOM test cannot catch, and because the
// service worker cache name must always match the current shell contents —
// a mismatch serves a stale app to every returning customer.
//
// Usage: node tests/css-contract.test.js

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

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

// --- 1. Tap targets -------------------------------------------------------
// Every rule that styles a control must declare a 44px min-height, or an
// explicit 44px width AND height for a square icon button.
const TAP_RULES = [
  { sel: ".btn-primary,\n.btn-outline,\n.btn-ghost", label: "button base" },
  { sel: ".btn-sm", label: "small button" },
  { sel: ".filter-btn", label: "filter chip" },
  { sel: ".lang-btn", label: "language toggle" },
  { sel: ".step-btn", label: "quantity stepper" },
  { sel: ".search-clear", label: "clear search" },
  { sel: ".skip-link", label: "skip link" },
  { sel: ".sheet-close", label: "sheet close button" }
];

console.log("=== TAP TARGETS ===");
for (const rule of TAP_RULES) {
  const idx = css.indexOf(rule.sel + " {");
  const body = idx === -1 ? "" : css.slice(idx, css.indexOf("}", idx));
  const minH = /min-height:\s*(\d+)px/.exec(body);
  const w = /width:\s*(\d+)px/.exec(body);
  const h = /height:\s*(\d+)px/.exec(body);
  const is44 =
    minH && Number(minH[1]) >= 44 ? true : w && h && Number(w[1]) >= 44 && Number(h[1]) >= 44;
  ok(rule.label + " has a >=44px tap target", is44, body.replace(/\s+/g, " ").trim().slice(0, 90));
}

// The tab bar itself must be at least 44px tall.
const tabbarH = /--tabbar-h:\s*(\d+)px/.exec(css);
ok(
  "tab bar is at least 44px tall",
  !!tabbarH && Number(tabbarH[1]) >= 44,
  tabbarH ? tabbarH[0] : "--tabbar-h not found"
);

// --- 2. No !important -----------------------------------------------------
console.log("\n=== NO !IMPORTANT ===");
// Strip comments first — a comment that merely mentions !important (as the
// explanatory notes in this stylesheet do) is not a declaration.
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
const important = cssNoComments.match(/!important/g);
ok("stylesheet contains no !important", !important, (important || []).length + " found");

// --- 3. Motion tokens -----------------------------------------------------
console.log("\n=== MOTION TOKENS ===");
for (const token of [
  "--dur-fast",
  "--dur-med",
  "--dur-slow",
  "--dur-sheet",
  "--dur-toast",
  "--dur-skeleton"
]) {
  ok(token + " is defined", css.includes(token + ":"));
}
ok(
  "reduced-motion block neutralises the tokens",
  /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*--dur-/.test(css)
);

// --- 4. Service worker cache name matches the shell ----------------------
console.log("\n=== SERVICE WORKER CACHE SYNC ===");
const FILES = [
  "index.html",
  "404.html",
  "css/style.css",
  "js/i18n.js",
  "js/hours.js",
  "js/cart.js",
  "js/app.js",
  "manifest.json"
];
// The hash must be computed exactly the way scripts/build-sw.sh does it:
// the concatenated file contents piped through sha256sum, then truncated.
const hash = crypto
  .createHash("sha256")
  .update(FILES.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join(""))
  .digest("hex")
  .slice(0, 12);
const version = /const VERSION = "([^"]+)"/.exec(sw);
ok("sw.js declares a VERSION", !!version);
ok(
  "sw.js VERSION matches the current shell contents",
  !!version && version[1] === "v" + hash,
  version ? version[1] + " vs v" + hash : "no version"
);

// The precache list must cover every shell file, or a returning customer
// gets a mix of new and old assets.
for (const f of FILES) {
  ok("precache includes " + f, sw.includes('"' + f + '"'));
}
// The removed legacy module must NOT be precached.
ok("legacy js/menu.js is not precached", !sw.includes("js/menu.js"));

// --- 5. Image sizing ------------------------------------------------------
console.log("\n=== IMAGE SIZING ===");
// The <img> elements carry width/height attributes so the browser can reserve
// space before the image loads. Those attributes map to presentational hints
// that win over a CSS aspect-ratio unless the stylesheet sets height:auto —
// which made every card render 480px tall instead of 163px.
function ruleBody(selector) {
  const idx = css.indexOf(selector + " {");
  if (idx === -1) return "";
  return css.slice(idx, css.indexOf("}", idx));
}
for (const sel of [".item-card img", ".sheet-img"]) {
  const body = ruleBody(sel);
  ok(
    sel + " sets height:auto so aspect-ratio wins",
    /height:\s*auto/.test(body),
    body.replace(/\s+/g, " ").trim().slice(0, 80)
  );
  ok(sel + " declares an aspect-ratio", /aspect-ratio:\s*[\d\s/]+/.test(body));
}
const appJs = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
ok(
  "card images still declare intrinsic width/height",
  /img\.width = 640/.test(appJs) && /img\.height = 480/.test(appJs)
);

// --- 6. Shell alignment ----------------------------------------------------
console.log("\n=== SHELL ALIGNMENT ===");
// On a wide desktop the header, the menu grid and the tab bar must share one
// content column. If the header row is not constrained, the shop name drifts
// to the far left while the cards sit in the middle.
ok("--shell-w token is defined", /--shell-w:\s*\d+px/.test(css));
const headerRowBody = ruleBody(".app-header-row,\n.app-header-sub");
ok(
  "header row is centred on the shell column",
  /margin-inline:\s*auto/.test(headerRowBody) && /width:\s*min\(/.test(headerRowBody),
  headerRowBody.replace(/\s+/g, " ").trim().slice(0, 90)
);
const tabbarBody = ruleBody(".tabbar");
ok(
  "tab bar centres its buttons on the shell column",
  /padding-inline:\s*max\(/.test(tabbarBody),
  tabbarBody.replace(/\s+/g, " ").trim().slice(0, 90)
);
const appViewBody = ruleBody(".app-view");
ok(
  ".app-view uses the shell width token",
  /max-width:\s*var\(--shell-w\)/.test(appViewBody),
  appViewBody.replace(/\s+/g, " ").trim().slice(0, 90)
);

// --- 7. Heading level contract ----------------------------------------------
console.log("\n=== HEADING LEVELS ===");
// The app renders card titles as h3 and step titles as h4. The stylesheet
// styles them by element, so a heading-level change in JS without a matching
// CSS change would silently fall back to browser-default type.
const htmlSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
ok(
  "card titles are created as h3",
  /createElement\("h3"\)\s*;\s*\n\s*name\.className = "item-name"/.test(appJs),
  "makeItemCard must build an h3"
);
ok(
  "step titles are created as h4",
  /createElement\("h4"\)/.test(appJs),
  "how-step titles must be h4"
);
ok(
  "stylesheet styles the empty-state h3",
  /\.empty-state h3\s*\{/.test(css),
  "expected a .empty-state h3 rule"
);
ok(
  "stylesheet styles the how-step h4",
  /\.how-step h4\s*\{/.test(css),
  "expected a .how-step h4 rule"
);
ok(
  "no stale .empty-state h2 rule",
  !/\.empty-state h2\s*\{/.test(css),
  "a .empty-state h2 rule would be dead CSS"
);
ok(
  "no stale .how-step h3 rule",
  !/\.how-step h3\s*\{/.test(css),
  "a .how-step h3 rule would be dead CSS"
);
ok(
  "every landmark aria-label is translated",
  ["filterNavLabel", "mainNavLabel", "itemDetails", "close"].every((key) =>
    htmlSrc.includes('data-i18n-aria="' + key + '"')
  ),
  "aria-labels must carry data-i18n-aria"
);

// --- 8. Deploy URLs -------------------------------------------------------
console.log("\n=== DEPLOY URLS ===");
// Social crawlers drop a relative og:image, so the shared link renders
// without a preview. The absolute URL must also match the deployed domain
// in .deploy.env, or the link points at the wrong host.
const deployEnv = fs.existsSync(path.join(ROOT, ".deploy.env"))
  ? fs.readFileSync(path.join(ROOT, ".deploy.env"), "utf8")
  : "";
const siteUrl = (deployEnv.match(/SITE_URL=(.*)/) || [])[1];
ok(".deploy.env declares a SITE_URL", !!siteUrl, siteUrl || "missing");
ok("SITE_URL is not the placeholder", !!siteUrl && siteUrl !== "https://example.com", siteUrl);
const ogImage = (htmlSrc.match(/property="og:image"\s+content="([^"]+)"/) || [])[1];
ok("og:image is an absolute URL", !!ogImage && /^https:\/\//.test(ogImage), ogImage);
ok(
  "og:image points at the deployed domain",
  !!ogImage && !!siteUrl && ogImage.indexOf(siteUrl) === 0,
  ogImage + " vs " + siteUrl
);
const ogUrl = (htmlSrc.match(/property="og:url"\s+content="([^"]+)"/) || [])[1];
ok("og:url is present and absolute", !!ogUrl && /^https:\/\//.test(ogUrl), ogUrl);
ok(
  "og:url points at the deployed domain",
  !!ogUrl && !!siteUrl && ogUrl.indexOf(siteUrl) === 0,
  ogUrl + " vs " + siteUrl
);
const canonical = (htmlSrc.match(/rel="canonical"\s+href="([^"]+)"/) || [])[1];
ok("canonical link is present", !!canonical, canonical || "missing");
ok(
  "canonical points at the deployed domain",
  !!canonical && !!siteUrl && canonical.indexOf(siteUrl) === 0,
  canonical + " vs " + siteUrl
);
const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
ok(
  "sitemap uses the deployed domain",
  !!siteUrl && sitemap.includes("<loc>" + siteUrl + "/</loc>"),
  siteUrl
);
const robots = fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8");
ok(
  "robots.txt points at the deployed sitemap",
  !!siteUrl && robots.includes(siteUrl + "/sitemap.xml"),
  siteUrl
);
ok(
  "robots.txt blocks the admin panel",
  robots.includes("Disallow: /admin/"),
  "the admin gate should not be crawlable"
);

// --- 9. Manifest sanity ---------------------------------------------------
console.log("\n=== MANIFEST ===");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
ok("display is standalone", manifest.display === "standalone");
ok("scope is relative", manifest.scope === "./");
ok("id is relative (not an absolute path)", !String(manifest.id).startsWith("/"), manifest.id);
const iconSizes = (manifest.icons || []).map((i) => i.sizes);
ok("has a 192x192 icon", iconSizes.includes("192x192"));
ok("has a 512x512 icon", iconSizes.includes("512x512"));
ok(
  "has a maskable icon",
  (manifest.icons || []).some((i) => String(i.purpose || "").includes("maskable"))
);
ok(
  "every icon file exists on disk",
  (manifest.icons || []).every((i) => fs.existsSync(path.join(ROOT, i.src))),
  (manifest.icons || [])
    .filter((i) => !fs.existsSync(path.join(ROOT, i.src)))
    .map((i) => i.src)
    .join(", ")
);

console.log("");
console.log("══════════════════════════════════════");
console.log("  RESULTS: " + pass + " passed, " + fail + " failed");
console.log("══════════════════════════════════════");
process.exit(fail > 0 ? 1 : 0);
