// End-to-end admin panel test: password gate + shop settings + item CRUD.
// Reads the password from ADMIN_PASSWORD env so it never lives in the repo.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("/root/lint-tools/node_modules/jsdom");

const ROOT = path.resolve(__dirname, "..");
const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) {
  console.log("SKIP: set ADMIN_PASSWORD to run the admin e2e test.");
  process.exit(0);
}

const html = fs.readFileSync(path.join(ROOT, "admin/index.html"), "utf8");
const adminJs = fs.readFileSync(path.join(ROOT, "admin/js/admin.js"), "utf8");
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

const tick = () => new Promise((r) => setTimeout(r, 40));

// Minimal localStorage shim
function makeStorage() {
  const map = {};
  return {
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => {
      map[k] = String(v);
    },
    removeItem: (k) => {
      delete map[k];
    },
    clear: () => {
      Object.keys(map).forEach((k) => delete map[k]);
    }
  };
}

(async () => {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://127.0.0.1:8899/admin/" });
  const w = dom.window;
  const doc = w.document;

  Object.defineProperty(w, "localStorage", { value: makeStorage(), writable: true });
  w.fetch = function (url) {
    const n = String(url).split("/").pop();
    const d = n === "items.json" ? items : n === "shop.json" ? shop : null;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(d) });
  };
  w.confirm = () => true;
  w.URL.createObjectURL = () => "blob:fake";
  w.URL.revokeObjectURL = () => {};
  // jsdom has no <dialog> showModal in older versions; shim if missing
  if (!w.HTMLDialogElement || !w.HTMLDialogElement.prototype.showModal) {
    const proto = w.HTMLDialogElement ? w.HTMLDialogElement.prototype : null;
    if (proto) {
      proto.showModal = function () {
        this.open = true;
      };
      proto.close = function () {
        this.open = false;
      };
    }
  }

  w.eval(adminJs);
  await tick();

  const pinInput = doc.getElementById("pinInput");
  const pinForm = doc.getElementById("pinForm");

  console.log("\n=== PASSWORD GATE ===");
  ok("gate visible on load", !doc.getElementById("pinGate").hidden);
  ok("panel hidden on load", doc.getElementById("adminPanel").hidden);

  // wrong password
  pinInput.value = "wrong-password";
  pinForm.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  ok("wrong password rejected", !doc.getElementById("pinError").hidden);
  ok("panel still hidden after wrong password", doc.getElementById("adminPanel").hidden);

  // correct password
  pinInput.value = PASSWORD;
  pinForm.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  await tick();
  ok("correct password unlocks", doc.getElementById("pinGate").hidden);
  ok("panel visible after unlock", !doc.getElementById("adminPanel").hidden);
  ok(
    "items loaded from defaults",
    doc.querySelectorAll(".item-row").length === 6,
    "got " + doc.querySelectorAll(".item-row").length
  );

  console.log("\n=== SHOP SETTINGS TAB ===");
  ok("shop name prefilled", doc.getElementById("shopName").value === shop.name);
  ok("whatsapp prefilled", doc.getElementById("shopWhatsapp").value === shop.whatsapp);
  ok("hours prefilled", doc.getElementById("shopOpen").value === shop.hours.open);

  // change whatsapp
  doc.getElementById("shopWhatsapp").value = "+91 98765 43210";
  doc.getElementById("shopName").value = "Test Mithai Bhandar";
  doc
    .getElementById("shopForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  ok(
    "whatsapp saved digits-only",
    w.localStorage.getItem("shop_settings").includes("919876543210"),
    w.localStorage.getItem("shop_settings")
  );
  ok("shop save confirmed in UI", doc.getElementById("shopSaved").textContent.includes("Saved"));
  ok("shop change logged", w.localStorage.getItem("shop_history").includes("SHOP"));

  console.log("\n=== TIMEZONE ===");
  ok(
    "timezone prefilled from shop.json",
    doc.getElementById("shopTimezone").value === shop.timezone,
    doc.getElementById("shopTimezone").value
  );
  // An invalid IANA zone must be rejected outright.
  doc.getElementById("shopTimezone").value = "Not/AZone";
  doc
    .getElementById("shopForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  ok(
    "invalid timezone rejected",
    doc.getElementById("shopSaved").textContent.includes("Invalid timezone"),
    doc.getElementById("shopSaved").textContent
  );
  ok(
    "invalid timezone not persisted",
    !w.localStorage.getItem("shop_settings").includes("Not/AZone")
  );
  // A valid non-default zone must be accepted and stored.
  doc.getElementById("shopTimezone").value = "Asia/Dubai";
  doc
    .getElementById("shopForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  ok(
    "valid timezone saved",
    w.localStorage.getItem("shop_settings").includes("Asia/Dubai"),
    w.localStorage.getItem("shop_settings")
  );
  // Restore the original so later assertions see the shipped value.
  doc.getElementById("shopTimezone").value = shop.timezone;
  doc
    .getElementById("shopForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await tick();

  console.log("\n=== TABS ===");
  const shopTab = doc.querySelector('.admin-tab[data-tab="shop"]');
  shopTab.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("shop tab activates", shopTab.classList.contains("active"));
  ok("shop panel shown", !doc.getElementById("tab-shop").hidden);
  ok("items panel hidden", doc.getElementById("tab-items").hidden);

  console.log("\n=== ITEM ACTIONS ===");
  doc
    .querySelector('.admin-tab[data-tab="items"]')
    .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  const firstRow = doc.querySelector(".item-row");
  const specialBtn = Array.from(firstRow.querySelectorAll("button")).find((b) =>
    /Special/.test(b.textContent)
  );
  specialBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("special flag toggled on", w.localStorage.getItem("shop_items").includes("isSpecial"));
  ok("special change logged", w.localStorage.getItem("shop_history").includes("SPECIAL"));

  const oosBtn = Array.from(doc.querySelectorAll(".item-row")[0].querySelectorAll("button")).find(
    (b) => /OOS|Restock/.test(b.textContent)
  );
  oosBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("stock toggle logged", w.localStorage.getItem("shop_history").includes("OOS"));

  console.log("\n=== DIET (veg) EDITOR ===");
  // Open the edit dialog for the first item and check the diet select
  // reflects the stored value.
  const editBtn = Array.from(doc.querySelectorAll(".item-row")[0].querySelectorAll("button")).find(
    (b) => /Edit/i.test(b.textContent)
  );
  ok("item row has an edit button", !!editBtn);
  editBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("edit dialog opened", doc.getElementById("editDialog").open === true);
  const firstItem = items[0];
  const expectedVeg =
    firstItem.veg === true ? "true" : firstItem.veg === false ? "false" : "";
  ok(
    "diet select reflects stored value",
    doc.getElementById("editVeg").value === expectedVeg,
    "got '" + doc.getElementById("editVeg").value + "' want '" + expectedVeg + "'"
  );

  // Set it to non-vegetarian and save.
  doc.getElementById("editVeg").value = "false";
  doc
    .getElementById("editForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  let stored = JSON.parse(w.localStorage.getItem("shop_items"));
  ok(
    "veg:false persisted as a boolean",
    stored[0].veg === false,
    JSON.stringify(stored[0].veg)
  );
  ok(
    "diet change logged",
    w.localStorage.getItem("shop_history").includes("diet"),
    w.localStorage.getItem("shop_history").slice(0, 200)
  );

  // Set it back to "Not marked" — the key must disappear entirely.
  const editBtn2 = Array.from(doc.querySelectorAll(".item-row")[0].querySelectorAll("button")).find(
    (b) => /Edit/i.test(b.textContent)
  );
  editBtn2.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  doc.getElementById("editVeg").value = "";
  doc
    .getElementById("editForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  stored = JSON.parse(w.localStorage.getItem("shop_items"));
  ok(
    "unmarking removes the veg key entirely",
    !("veg" in stored[0]),
    JSON.stringify(stored[0])
  );

  console.log("\n=== LOCK ===");
  doc.getElementById("btnLock").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await tick();
  ok("lock hides panel", doc.getElementById("adminPanel").hidden);
  ok("lock shows gate", !doc.getElementById("pinGate").hidden);
  ok("lock clears input", pinInput.value === "");

  console.log("\n══════════════════════════════════════");
  console.log("  RESULTS: " + pass + " passed, " + fail + " failed");
  console.log("══════════════════════════════════════");
  process.exit(fail > 0 ? 1 : 0);
})();
