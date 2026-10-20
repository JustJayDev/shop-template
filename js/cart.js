// cart.js — local cart state for the shop app.
//
// WHAT THIS IS
// A list of what the customer wants, kept in localStorage so it survives a
// reload. Nothing is sent anywhere. The only exit from the cart is a
// WhatsApp message the customer sends themselves.
//
// WHAT THIS IS NOT
// This is not a payment system. There is no server, no order database, no
// card handling, no auth, no stock reservation. The shop confirms the order
// in the WhatsApp chat. Do not describe this as "checkout" in UI copy —
// say "send order on WhatsApp".
//
// The cart stores ITEM IDs and quantities only — never a price. Prices are
// always read fresh from the menu at render time, so a price change at the
// shop cannot be overridden by a stale number sitting in localStorage.
(function () {
  "use strict";

  const KEY = "shop_cart_v1";
  const MAX_QTY = 99;

  let cart = {};
  let listeners = [];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const clean = {};
      Object.keys(parsed).forEach(function (id) {
        const qty = parseInt(parsed[id], 10);
        if (typeof id === "string" && id.length && qty > 0) {
          clean[id] = Math.min(qty, MAX_QTY);
        }
      });
      return clean;
    } catch (e) {
      // Corrupt or unavailable storage — start empty rather than crash.
      return {};
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(cart));
    } catch (e) {
      // Private mode — the cart still works for this session in memory.
    }
  }

  function emit() {
    listeners.forEach(function (fn) {
      try {
        fn(cart);
      } catch (e) {
        // A broken listener must not break the cart.
      }
    });
  }

  function getAll() {
    return cart;
  }

  function count() {
    return Object.keys(cart).reduce(function (sum, id) {
      return sum + cart[id];
    }, 0);
  }

  function qtyOf(id) {
    return cart[id] || 0;
  }

  function has(id) {
    return qtyOf(id) > 0;
  }

  // Stock is the shop's remaining count, not the cart count.
  // Returns how many were actually added (0 when sold out or at cap).
  function add(id, stock, amount) {
    const n = amount == null ? 1 : parseInt(amount, 10);
    if (!id || !Number.isFinite(n) || n <= 0) return 0;
    const limit = Math.min(Number(stock) || 0, MAX_QTY);
    if (limit <= 0) return 0;
    const current = qtyOf(id);
    const room = limit - current;
    if (room <= 0) return 0;
    const take = Math.min(n, room);
    cart[id] = current + take;
    save();
    emit();
    return take;
  }

  // Decrement. Returns true when the item left the cart entirely.
  function remove(id) {
    if (!has(id)) return false;
    delete cart[id];
    save();
    emit();
    return true;
  }

  function setQty(id, qty, stock) {
    const n = parseInt(qty, 10);
    if (!Number.isFinite(n) || n <= 0) return remove(id);
    const limit = Math.min(Number(stock) || 0, MAX_QTY);
    if (limit <= 0) return remove(id);
    cart[id] = Math.min(n, limit);
    save();
    emit();
    return true;
  }

  function clear() {
    cart = {};
    save();
    emit();
  }

  function onChange(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (f) {
        return f !== fn;
      });
    };
  }

  // Build the WhatsApp order message. Prices come from the live menu, so the
  // customer and the shop see the same numbers.
  function buildOrderText(items, shop, lang) {
    const t = window.I18N
      ? window.I18N.t
      : function (k) {
          return k;
        };
    const isHi = lang === "hi";
    const name = (isHi ? shop.nameHi : shop.name) || shop.name || "";
    const lines = [];
    lines.push(isHi ? "नमस्ते " + name + "!" : "Hello " + name + "!");
    lines.push("");
    lines.push(isHi ? "मेरा ऑर्डर:" : "My order:");

    let total = 0;
    items.forEach(function (item) {
      const qty = item.qty;
      const label = isHi ? item.nameHi : item.name;
      const lineTotal = item.price * qty;
      total += lineTotal;
      lines.push("- " + label + " x " + qty + " = ₹" + lineTotal);
    });

    lines.push("");
    lines.push((isHi ? t("total") : "Total") + ": ₹" + total);
    lines.push("");
    lines.push(
      isHi
        ? "कृपया कन्फर्म करें कि क्या और कब तैयार होगा।"
        : "Please confirm what is available and when it will be ready."
    );

    return lines.join("\n");
  }

  cart = load();

  window.Cart = {
    getAll: getAll,
    count: count,
    qtyOf: qtyOf,
    has: has,
    add: add,
    remove: remove,
    setQty: setQty,
    clear: clear,
    onChange: onChange,
    buildOrderText: buildOrderText,
    KEY: KEY
  };
})();
