// admin.js — localStorage-based admin panel for the shop template.
// Password gate (SHA-256), item CRUD, shop settings, history log, JSON export.
(function () {
  "use strict";

  // Password gate. Only the SHA-256 hash is stored — never the plaintext.
  // To change the password, generate a new hash and paste it below:
  //   node -e "console.log(require('crypto').createHash('sha256').update('YOUR_NEW_PASSWORD','utf8').digest('hex'))"
  //
  // The hash below is the sha256 of the owner's own password. The plaintext
  // is NOT in this repository — it is supplied to the admin e2e suite via
  // the ADMIN_PASSWORD environment variable, and it is not written in
  // README.md either. `tests/admin-hash.test.js` keeps this hash and the
  // ADMIN_PASSWORD value in sync, so a mismatch fails the check instead of
  // silently locking the owner out of their own panel.
  const PASS_HASH = "1ac0670f9d19fccfead8b605f341acee495d21cd814ac905a646dd6e9fb5e35a";

  const STORAGE_KEY = "shop_items";
  const HISTORY_KEY = "shop_history";
  const SHOP_KEY = "shop_settings";
  const DEFAULT_ITEMS_URL = "../data/items.json";
  const DEFAULT_SHOP_URL = "../data/shop.json";
  // Fallback timezone if the shop record has none. The app's hours logic
  // evaluates "open now" in the shop's own timezone, not the visitor's.
  const DEFAULT_TIMEZONE = "Asia/Kolkata";

  // Returns the timezone string if it is a valid IANA zone, else null.
  function validTimezone(tz) {
    if (!tz) return null;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch (err) {
      return null;
    }
  }

  // --- Minimal SHA-256 (UTF-8 aware). Verified against Node's crypto. ---
  function sha256(str) {
    function rrot(x, n) {
      return (x >>> n) | (x << (32 - n));
    }
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
      0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
      0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
      0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
      0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
      0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
      0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
      0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    let H = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];

    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 0x80) {
        bytes.push(c);
      } else if (c < 0x800) {
        bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      } else if (c < 0xd800 || c >= 0xe000) {
        bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      } else {
        i++;
        const cp = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
        bytes.push(
          0xf0 | (cp >> 18),
          0x80 | ((cp >> 12) & 63),
          0x80 | ((cp >> 6) & 63),
          0x80 | (cp & 63)
        );
      }
    }

    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const hi = Math.floor(bitLen / 0x100000000);
    const lo = bitLen >>> 0;
    bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
    bytes.push((lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);

    const w = new Array(64);
    for (let i = 0; i < bytes.length; i += 64) {
      for (let j = 0; j < 16; j++) {
        w[j] =
          (bytes[i + j * 4] << 24) |
          (bytes[i + j * 4 + 1] << 16) |
          (bytes[i + j * 4 + 2] << 8) |
          bytes[i + j * 4 + 3];
      }
      for (let j = 16; j < 64; j++) {
        const s0 = rrot(w[j - 15], 7) ^ rrot(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const s1 = rrot(w[j - 2], 17) ^ rrot(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      let a = H[0];
      let b = H[1];
      let c = H[2];
      let d = H[3];
      let e = H[4];
      let f = H[5];
      let g = H[6];
      let h = H[7];
      for (let j = 0; j < 64; j++) {
        const S1 = rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[j] + w[j]) | 0;
        const S0 = rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) | 0;
      }
      H = [
        (H[0] + a) | 0,
        (H[1] + b) | 0,
        (H[2] + c) | 0,
        (H[3] + d) | 0,
        (H[4] + e) | 0,
        (H[5] + f) | 0,
        (H[6] + g) | 0,
        (H[7] + h) | 0
      ];
    }
    return H.map(function (x) {
      return (x >>> 0).toString(16).padStart(8, "0");
    }).join("");
  }

  // --- DOM refs ---
  const pinGate = document.getElementById("pinGate");
  const pinForm = document.getElementById("pinForm");
  const pinInput = document.getElementById("pinInput");
  const pinError = document.getElementById("pinError");
  const adminPanel = document.getElementById("adminPanel");
  const itemList = document.getElementById("itemList");
  const itemCount = document.getElementById("itemCount");
  const historyList = document.getElementById("historyList");
  const editDialog = document.getElementById("editDialog");
  const editForm = document.getElementById("editForm");
  const dialogTitle = document.getElementById("dialogTitle");
  const shopForm = document.getElementById("shopForm");
  const shopSaved = document.getElementById("shopSaved");

  let items = [];
  let history = [];
  let shop = null;

  // --- Persistence ---

  function readJSON(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    if (shop) localStorage.setItem(SHOP_KEY, JSON.stringify(shop));
  }

  function loadItemsFromDefaults() {
    return fetch(DEFAULT_ITEMS_URL)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        items = Array.isArray(data) ? data : [];
        saveToStorage();
        render();
      })
      .catch(function () {
        items = [];
        render();
      });
  }

  function loadShopFromDefaults() {
    return fetch(DEFAULT_SHOP_URL)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        shop = data;
        saveToStorage();
        fillShopForm();
      })
      .catch(function () {
        shop = null;
      });
  }

  // --- History ---

  function logAction(action, detail) {
    history.unshift({ time: new Date().toISOString(), action: action, detail: detail });
    if (history.length > 200) history.length = 200;
    saveToStorage();
    renderHistory();
  }

  function renderHistory() {
    historyList.innerHTML = "";
    if (history.length === 0) {
      const empty = document.createElement("p");
      empty.className = "item-count";
      empty.textContent = "No changes recorded yet.";
      historyList.appendChild(empty);
      return;
    }
    history.slice(0, 50).forEach(function (h) {
      const div = document.createElement("div");
      div.className = "history-entry";
      const time = document.createElement("span");
      time.className = "h-time";
      time.textContent = new Date(h.time).toLocaleString();
      div.appendChild(time);
      div.appendChild(document.createTextNode(" — " + h.action + ": " + h.detail));
      historyList.appendChild(div);
    });
  }

  // --- Items render ---

  function render() {
    itemList.innerHTML = "";
    itemCount.textContent = items.length + " item" + (items.length !== 1 ? "s" : "");

    items.forEach(function (item, idx) {
      const row = document.createElement("div");
      row.className = "item-row" + (item.qty === 0 ? " oos" : "");

      const thumb = document.createElement("img");
      thumb.className = "item-thumb";
      thumb.src = "../" + item.image;
      thumb.alt = item.name;
      thumb.loading = "lazy";

      const info = document.createElement("div");
      info.className = "item-info";
      const nameEl = document.createElement("span");
      nameEl.className = "item-info-name";
      nameEl.textContent = item.name + " / " + item.nameHi;
      const metaEl = document.createElement("span");
      metaEl.className = "item-info-meta";
      metaEl.textContent =
        "\u20B9" +
        item.price +
        "/" +
        (item.unit || "pc") +
        " \u00B7 qty " +
        item.qty +
        " \u00B7 " +
        item.category +
        (item.isSpecial ? " \u00B7 SPECIAL" : "");
      info.appendChild(nameEl);
      info.appendChild(metaEl);

      const actions = document.createElement("div");
      actions.className = "item-row-actions";

      const btnEdit = document.createElement("button");
      btnEdit.className = "btn btn-sm";
      btnEdit.textContent = "Edit";
      btnEdit.addEventListener("click", function () {
        openEdit(idx);
      });

      const btnToggle = document.createElement("button");
      btnToggle.className = "btn btn-sm";
      btnToggle.textContent = item.qty === 0 ? "Restock" : "Mark OOS";
      btnToggle.addEventListener("click", function () {
        toggleStock(idx);
      });

      const btnSpecial = document.createElement("button");
      btnSpecial.className = "btn btn-sm";
      btnSpecial.textContent = item.isSpecial ? "Unset Special" : "Make Special";
      btnSpecial.addEventListener("click", function () {
        toggleSpecial(idx);
      });

      const btnDel = document.createElement("button");
      btnDel.className = "btn btn-sm btn-danger";
      btnDel.textContent = "Del";
      btnDel.addEventListener("click", function () {
        deleteItem(idx);
      });

      actions.appendChild(btnEdit);
      actions.appendChild(btnToggle);
      actions.appendChild(btnSpecial);
      actions.appendChild(btnDel);

      row.appendChild(thumb);
      row.appendChild(info);
      row.appendChild(actions);
      itemList.appendChild(row);
    });

    renderHistory();
  }

  // --- Item CRUD ---

  function openEdit(idx) {
    const isNew = idx === -1;
    dialogTitle.textContent = isNew ? "Add Item" : "Edit Item";
    const item = isNew
      ? {
          id: "",
          shopId: "demo",
          name: "",
          nameHi: "",
          image: "assets/new.svg",
          price: 10,
          unit: "pc",
          qty: 0,
          category: "sweet",
          tags: [],
          aiGenerated: false,
          updatedAt: ""
        }
      : items[idx];

    document.getElementById("editId").value = isNew ? "" : String(idx);
    document.getElementById("editName").value = item.name;
    document.getElementById("editNameHi").value = item.nameHi;
    document.getElementById("editPrice").value = item.price;
    document.getElementById("editQty").value = item.qty;
    document.getElementById("editCategory").value = item.category;
    document.getElementById("editUnit").value = item.unit || "pc";
    document.getElementById("editImage").value = item.image;
    document.getElementById("editAiGen").checked = !!item.aiGenerated;
    document.getElementById("editSpecial").checked = !!item.isSpecial;
    // `veg` is a tri-state on the wire: undefined (not marked),
    // true (vegetarian) or false (non-vegetarian). The app only renders a
    // marker for an explicit boolean, so "not marked" must stay undefined
    // rather than collapsing to false.
    document.getElementById("editVeg").value =
      item.veg === true ? "true" : item.veg === false ? "false" : "";

    editDialog.showModal();
  }

  function handleEditSubmit(e) {
    e.preventDefault();
    const idxStr = document.getElementById("editId").value;
    const isNew = idxStr === "";
    const idx = isNew ? items.length : parseInt(idxStr, 10);

    const name = document.getElementById("editName").value.trim();
    const nameHi = document.getElementById("editNameHi").value.trim();
    const price = parseInt(document.getElementById("editPrice").value, 10) || 0;
    const qty = parseInt(document.getElementById("editQty").value, 10) || 0;
    const category = document.getElementById("editCategory").value;
    const unit = document.getElementById("editUnit").value;
    const image = document.getElementById("editImage").value.trim() || "assets/new.svg";
    const aiGenerated = document.getElementById("editAiGen").checked;
    const isSpecial = document.getElementById("editSpecial").checked;
    const vegRaw = document.getElementById("editVeg").value;
    const veg = vegRaw === "" ? undefined : vegRaw === "true";

    const id = isNew
      ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36)
      : items[idx].id;

    const updated = {
      id: id,
      shopId: "demo",
      name: name,
      nameHi: nameHi,
      image: image,
      price: price,
      unit: unit,
      qty: qty,
      category: category,
      tags: isNew ? [category] : items[idx].tags,
      aiGenerated: aiGenerated,
      updatedAt: new Date().toISOString()
    };
    if (isSpecial) updated.isSpecial = true;
    // Only write `veg` when it is explicitly set. An undefined value is
    // omitted entirely so that "Not marked" removes the key instead of
    // persisting `null` or `false`.
    if (veg !== undefined) updated.veg = veg;

    if (isNew) {
      items.push(updated);
      logAction("ADD", name + " (\u20B9" + price + ")");
    } else {
      const old = items[idx];
      const changes = [];
      if (old.price !== price) changes.push("price " + old.price + "\u2192" + price);
      if (old.unit !== unit) changes.push("unit " + (old.unit || "pc") + "\u2192" + unit);
      if (old.qty !== qty) changes.push("qty " + old.qty + "\u2192" + qty);
      if (old.name !== name) changes.push("name");
      if (old.nameHi !== nameHi) changes.push("nameHi");
      if (!!old.isSpecial !== isSpecial) changes.push("special " + isSpecial);
      // Compare the tri-state by name, not by truthiness: `false` (non-veg)
      // and "not marked" are different values, not the same false.
      const oldDiet = old.veg === true ? "veg" : old.veg === false ? "non-veg" : "none";
      const newDiet = veg === true ? "veg" : veg === false ? "non-veg" : "none";
      if (oldDiet !== newDiet) changes.push("diet " + newDiet);
      items[idx] = updated;
      logAction("EDIT", name + " [" + (changes.join(", ") || "updated") + "]");
    }

    saveToStorage();
    render();
    editDialog.close();
  }

  function toggleStock(idx) {
    const item = items[idx];
    const oldQty = item.qty;
    item.qty = item.qty === 0 ? 10 : 0;
    item.updatedAt = new Date().toISOString();
    logAction(
      item.qty === 0 ? "OOS" : "RESTOCK",
      item.name + " qty " + oldQty + " \u2192 " + item.qty
    );
    saveToStorage();
    render();
  }

  function toggleSpecial(idx) {
    const item = items[idx];
    const on = !item.isSpecial;
    // Only one item can be special at a time.
    if (on) {
      items.forEach(function (i) {
        delete i.isSpecial;
      });
    }
    if (on) item.isSpecial = true;
    else delete item.isSpecial;
    logAction(on ? "SPECIAL" : "UNSPECIAL", item.name);
    saveToStorage();
    render();
  }

  function deleteItem(idx) {
    const name = items[idx].name;
    items.splice(idx, 1);
    logAction("DELETE", name);
    saveToStorage();
    render();
  }

  // --- Shop settings ---

  function fillShopForm() {
    if (!shop) return;
    document.getElementById("shopName").value = shop.name || "";
    document.getElementById("shopWhatsapp").value = shop.whatsapp || "";
    document.getElementById("shopAddressField").value = shop.address || "";
    document.getElementById("shopMapsUrl").value = shop.mapsUrl || "";
    document.getElementById("shopOpen").value = (shop.hours && shop.hours.open) || "";
    document.getElementById("shopClose").value = (shop.hours && shop.hours.close) || "";
    document.getElementById("shopDays").value = (shop.hours && shop.hours.days) || "";
    document.getElementById("shopTimezone").value = shop.timezone || DEFAULT_TIMEZONE;
  }

  shopForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const whatsapp = document.getElementById("shopWhatsapp").value.replace(/\D/g, "");
    const tzInput = document.getElementById("shopTimezone").value.trim();
    const tz = validTimezone(tzInput);
    if (!tz) {
      shopSaved.textContent = "Invalid timezone — use an IANA name like Asia/Kolkata";
      shopSaved.classList.add("is-error");
      document.getElementById("shopTimezone").focus();
      return;
    }
    shopSaved.classList.remove("is-error");
    shop = shop || {};
    shop.name = document.getElementById("shopName").value.trim();
    shop.whatsapp = whatsapp;
    shop.address = document.getElementById("shopAddressField").value.trim();
    shop.mapsUrl = document.getElementById("shopMapsUrl").value.trim();
    shop.timezone = tz;
    shop.hours = {
      open: document.getElementById("shopOpen").value,
      close: document.getElementById("shopClose").value,
      days: document.getElementById("shopDays").value.trim()
    };
    if (!shop.testimonials) shop.testimonials = [];
    saveToStorage();
    logAction("SHOP", "settings updated (whatsapp " + whatsapp + ")");
    shopSaved.textContent = "Saved \u2713";
    setTimeout(function () {
      shopSaved.textContent = "";
    }, 2000);
  });

  // --- Tabs ---

  document.querySelectorAll(".admin-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      const target = tab.getAttribute("data-tab");
      document.querySelectorAll(".admin-tab").forEach(function (t) {
        t.classList.toggle("active", t === tab);
      });
      document.querySelectorAll(".admin-tabpanel").forEach(function (p) {
        p.hidden = p.id !== "tab-" + target;
      });
    });
  });

  // --- Export ---

  function download(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- Gate ---

  function unlock() {
    pinGate.hidden = true;
    adminPanel.hidden = false;
    items = readJSON(STORAGE_KEY, []);
    history = readJSON(HISTORY_KEY, []);
    shop = readJSON(SHOP_KEY, null);

    if (!Array.isArray(items) || items.length === 0) {
      loadItemsFromDefaults();
    } else {
      render();
    }

    if (shop) {
      fillShopForm();
    } else {
      loadShopFromDefaults();
    }
  }

  function lock() {
    adminPanel.hidden = true;
    pinGate.hidden = false;
    pinInput.value = "";
    pinError.hidden = true;
  }

  // --- Events ---

  pinForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sha256(pinInput.value) === PASS_HASH) {
      unlock();
    } else {
      pinError.hidden = false;
      pinInput.value = "";
      pinInput.focus();
    }
  });

  document.getElementById("btnLock").addEventListener("click", lock);
  document.getElementById("btnAddItem").addEventListener("click", function () {
    openEdit(-1);
  });
  editForm.addEventListener("submit", handleEditSubmit);
  document.getElementById("btnCancelEdit").addEventListener("click", function () {
    editDialog.close();
  });

  document.getElementById("btnExport").addEventListener("click", function () {
    download("items.json", items);
    logAction("EXPORT", "items.json (" + items.length + " items)");
  });

  document.getElementById("btnExportShop").addEventListener("click", function () {
    download("shop.json", shop || {});
    logAction("EXPORT", "shop.json");
  });

  document.getElementById("btnExportHistory").addEventListener("click", function () {
    download("history.json", history);
  });

  document.getElementById("btnClearHistory").addEventListener("click", function () {
    if (confirm("Clear the change history?")) {
      history = [];
      saveToStorage();
      renderHistory();
    }
  });

  document.getElementById("btnReset").addEventListener("click", function () {
    if (confirm("Reset all items and shop settings to default? This clears your edits.")) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(HISTORY_KEY);
      localStorage.removeItem(SHOP_KEY);
      items = [];
      history = [];
      shop = null;
      logAction("RESET", "Restored defaults");
      loadItemsFromDefaults();
      loadShopFromDefaults();
    }
  });
})();
