// app.js — the shop app shell: router, views, rendering, cart wiring.
//
// STRUCTURE
//   Views are plain <section> elements in index.html. The router shows one
//   at a time by toggling [hidden]. No framework, no virtual DOM, no router
//   library — hash routing with a data-view attribute on each tab.
//
//   The bottom tab bar is the primary navigation, exactly like a native
//   app. Hash routes (#/menu, #/cart, #/visit, #/more) make the browser
//   back button work like Android's back gesture.
//
// WHY THE CART LIVES IN ITS OWN FILE
//   Cart state, menu data and chrome are three different concerns with
//   three different lifetimes. Splitting them keeps each file small enough
//   to read in one sitting and makes each testable on its own.
(function () {
  "use strict";

  const T = function (key) {
    return window.I18N ? window.I18N.t(key) : key;
  };

  // --- State ---
  let items = [];
  let shop = {};
  let activeFilter = "all";
  let searchTerm = "";
  let activeView = "menu";
  let lastFocused = null;
  let deferredInstall = null;
  // The item currently open in the detail sheet. The sheet is built with
  // translated strings, so a language switch has to rebuild it — otherwise
  // the button inside the sheet stays in the previous language.
  let sheetItemId = null;
  const scrollMemory = {};

  // --- Element lookup (cached once, after DOM ready) ---
  const el = {};

  function cacheEls() {
    el.grid = document.getElementById("menuGrid");
    el.cartView = document.getElementById("viewCart");
    el.menuView = document.getElementById("viewMenu");
    el.visitView = document.getElementById("viewVisit");
    el.moreView = document.getElementById("viewMore");
    el.tabbar = document.getElementById("tabbar");
    el.cartList = document.getElementById("cartList");
    el.cartTotal = document.getElementById("cartTotal");
    el.cartCount = document.getElementById("cartCount");
    el.cartBadge = document.getElementById("cartBadge");
    el.searchInput = document.getElementById("searchInput");
    el.specialBanner = document.getElementById("specialBanner");
    el.specialName = document.getElementById("specialName");
    el.statusPill = document.getElementById("statusPill");
    el.shopTitle = document.getElementById("shopTitle");
    el.toast = document.getElementById("toast");
    el.offlineBanner = document.getElementById("offlineBanner");
    el.sheet = document.getElementById("itemSheet");
    el.sheetBody = document.getElementById("sheetBody");
    el.orderBtn = document.getElementById("btnOrder");
    el.lastUpdated = document.getElementById("lastUpdated");
    el.visitBody = document.getElementById("visitBody");
    el.moreBody = document.getElementById("moreBody");
    el.installBtn = document.getElementById("btnInstall");
  }

  // --- Toast ---
  let toastTimer = null;

  function toast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.hidden = false;
    // Force reflow so the transition restarts on repeated toasts.
    void el.toast.offsetWidth;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove("show");
      setTimeout(function () {
        if (!el.toast.classList.contains("show")) el.toast.hidden = true;
      }, 220);
    }, 2200);
  }

  // --- Haptics (no-op where unsupported) ---
  // Chrome refuses navigator.vibrate() until the frame has received a real
  // user gesture, and it reports that refusal as a console error. Checking
  // navigator.userActivation first keeps the console clean instead of
  // silencing it after the fact.
  function buzz(ms) {
    if (!navigator.vibrate) return;
    const activation = navigator.userActivation;
    if (activation && !activation.hasBeenActive) return;
    try {
      navigator.vibrate(ms || 8);
    } catch (e) {
      // Some browsers throw when the page is not visible.
    }
  }

  // --- Data ---
  function validateItems(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (item) {
      return (
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.nameHi === "string" &&
        typeof item.image === "string" &&
        typeof item.price === "number" &&
        typeof item.qty === "number" &&
        typeof item.category === "string"
      );
    });
  }

  function itemName(item) {
    return window.I18N && window.I18N.isHindi() ? item.nameHi : item.name;
  }

  function unitKey(item) {
    return item.unit === "kg" ? "unitKg" : item.unit === "plate" ? "unitPlate" : "unitPc";
  }

  function priceLabel(item) {
    return T("pricePrefix") + item.price + "/" + T(unitKey(item));
  }

  // --- Filtering + search ---
  function visibleItems() {
    let list = items;
    if (activeFilter !== "all") {
      list = list.filter(function (item) {
        return item.category === activeFilter;
      });
    }
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      list = list.filter(function (item) {
        const haystack = (
          item.name +
          " " +
          item.nameHi +
          " " +
          (item.tags || []).join(" ")
        ).toLowerCase();
        return haystack.indexOf(term) !== -1;
      });
    }
    return list;
  }

  // --- Menu rendering ---
  function showSkeletons() {
    if (!el.grid) return;
    el.grid.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const sk = document.createElement("div");
      sk.className = "skeleton-card";
      sk.setAttribute("aria-hidden", "true");
      el.grid.appendChild(sk);
    }
  }

  // Veg / non-veg marker. The convention in India is a green square for
  // vegetarian and a red/brown one for non-vegetarian. The field is
  // optional — items without it simply get no marker.
  function makeDietMarker(item) {
    if (item.veg === true || item.veg === false) {
      const marker = document.createElement("span");
      marker.className = "diet-marker " + (item.veg ? "veg" : "non-veg");
      const label = item.veg ? T("vegLabel") : T("nonVegLabel");
      marker.setAttribute("aria-label", label);
      marker.setAttribute("title", label);
      marker.innerHTML =
        '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">' +
        '<circle cx="5" cy="5" r="2.6" fill="currentColor"/></svg>';
      return marker;
    }
    return null;
  }

  function makeItemCard(item, index) {
    const card = document.createElement("article");
    card.className = "item-card" + (item.qty === 0 ? " oos" : "");
    card.dataset.id = item.id;

    const media = document.createElement("div");
    media.className = "card-media";

    const img = document.createElement("img");
    img.src = item.image;
    img.alt = itemName(item);
    img.width = 640;
    img.height = 480;
    img.loading = index > 2 ? "lazy" : "eager";
    if (index === 0) img.fetchPriority = "high";
    media.appendChild(img);

    // The aiGenerated flag is a factual claim about the image source, so it
    // is surfaced as a badge rather than hidden. See README.
    if (item.aiGenerated === true) {
      const badge = document.createElement("span");
      badge.className = "ai-badge";
      badge.textContent = T("aiBadge");
      badge.title = T("aiImageAlt");
      badge.setAttribute("aria-label", T("aiImageAlt"));
      media.appendChild(badge);
    }

    if (item.qty === 0) {
      const oos = document.createElement("span");
      oos.className = "oos-label";
      oos.textContent = T("outOfStock");
      media.appendChild(oos);
    }

    const body = document.createElement("div");
    body.className = "card-body";

    const name = document.createElement("h3");
    name.className = "item-name";
    name.textContent = itemName(item);

    const marker = makeDietMarker(item);
    if (marker) name.appendChild(marker);

    const meta = document.createElement("div");
    meta.className = "item-meta";

    const price = document.createElement("span");
    price.className = "item-price";
    price.textContent = priceLabel(item);
    meta.appendChild(price);

    if (item.qty > 0) {
      const qty = document.createElement("span");
      qty.className = "item-qty";
      qty.textContent = item.qty + " " + T("qtyLeft");
      meta.appendChild(qty);
    }

    body.appendChild(name);
    body.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const details = document.createElement("button");
    details.type = "button";
    details.className = "btn-ghost btn-sm";
    details.textContent = T("viewDetails");
    details.addEventListener("click", function () {
      openSheet(item);
    });
    actions.appendChild(details);

    if (item.qty > 0) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "btn-primary btn-sm";
      add.textContent = T("addToCart");
      add.setAttribute("data-add", item.id);
      add.addEventListener("click", function () {
        const took = window.Cart.add(item.id, item.qty, 1);
        if (took > 0) {
          buzz();
          toast(T("addedToCart"));
          // Re-render so the card reflects the new stock, then put focus
          // back on the button the user just pressed.
          renderMenu();
          const again = el.grid.querySelector('[data-add="' + item.id + '"]');
          if (again) again.focus();
        } else {
          toast(T("outOfStock"));
        }
      });
      actions.appendChild(add);
    } else {
      const disabled = document.createElement("button");
      disabled.type = "button";
      disabled.className = "btn-primary btn-sm is-disabled";
      disabled.disabled = true;
      disabled.textContent = T("outOfStock");
      actions.appendChild(disabled);
    }

    body.appendChild(actions);
    card.appendChild(media);
    card.appendChild(body);
    return card;
  }

  function renderMenu() {
    if (!el.grid) return;
    const list = visibleItems();
    el.grid.innerHTML = "";
    el.grid.removeAttribute("aria-busy");

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const h = document.createElement("h3");
      h.textContent = T("noResults");
      const p = document.createElement("p");
      p.textContent = T("noResultsHint");
      empty.appendChild(h);
      empty.appendChild(p);
      el.grid.appendChild(empty);
      return;
    }

    list.forEach(function (item, index) {
      el.grid.appendChild(makeItemCard(item, index));
    });
  }

  function renderSpecial() {
    if (!el.specialBanner || !el.specialName) return;
    const special = items.find(function (i) {
      return i.isSpecial && i.qty > 0;
    });
    if (special) {
      el.specialBanner.hidden = false;
      el.specialName.textContent = itemName(special) + " — " + priceLabel(special);
    } else {
      el.specialBanner.hidden = true;
    }
  }

  function renderLastUpdated() {
    if (!el.lastUpdated || items.length === 0) return;
    const latest = items.reduce(function (max, item) {
      return item.updatedAt > max ? item.updatedAt : max;
    }, items[0].updatedAt || "");
    if (latest) {
      el.lastUpdated.textContent = new Date(latest).toLocaleDateString(
        window.I18N && window.I18N.isHindi() ? "hi-IN" : "en-IN",
        { day: "numeric", month: "short", year: "numeric" }
      );
    }
  }

  // --- Cart rendering ---
  function cartItems() {
    const cart = window.Cart.getAll();
    return items
      .filter(function (item) {
        return cart[item.id] > 0;
      })
      .map(function (item) {
        return { item: item, qty: cart[item.id] };
      });
  }

  function renderCart() {
    if (!el.cartList) return;
    const lines = cartItems();
    el.cartList.innerHTML = "";

    if (lines.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const h = document.createElement("h3");
      h.textContent = T("cartEmpty");
      const p = document.createElement("p");
      p.textContent = T("cartEmptyHint");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-primary";
      btn.textContent = T("browseMenu");
      btn.addEventListener("click", function () {
        navigate("menu");
      });
      empty.appendChild(h);
      empty.appendChild(p);
      empty.appendChild(btn);
      el.cartList.appendChild(empty);
    } else {
      let total = 0;
      lines.forEach(function (line) {
        total += line.item.price * line.qty;
        el.cartList.appendChild(makeCartRow(line));
      });
      if (el.cartTotal) el.cartTotal.textContent = "₹" + total;
    }

    // The order button is only meaningful with at least one line. It ships
    // hidden so a fresh visitor never sees a dead "send order" button.
    if (el.orderBtn) el.orderBtn.hidden = lines.length === 0;
    if (el.cartTotal && lines.length === 0) el.cartTotal.textContent = "₹0";

    // Badge on the tab bar
    const count = window.Cart ? window.Cart.count() : 0;
    if (el.cartBadge) {
      el.cartBadge.textContent = count > 99 ? "99+" : String(count);
      el.cartBadge.hidden = count === 0;
    }
    if (el.cartCount) {
      el.cartCount.textContent = count + " " + T("itemsLabel");
    }
  }

  function makeCartRow(line) {
    const row = document.createElement("div");
    row.className = "cart-row";

    const img = document.createElement("img");
    img.className = "cart-img";
    img.src = line.item.image;
    img.alt = "";
    img.width = 56;
    img.height = 56;
    img.loading = "lazy";
    row.appendChild(img);

    const info = document.createElement("div");
    info.className = "cart-info";

    const name = document.createElement("p");
    name.className = "cart-name";
    name.textContent = itemName(line.item);
    info.appendChild(name);

    const price = document.createElement("p");
    price.className = "cart-price";
    price.textContent = priceLabel(line.item);
    info.appendChild(price);

    row.appendChild(info);

    const stepper = document.createElement("div");
    stepper.className = "stepper";

    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "step-btn";
    minus.textContent = "−";
    minus.setAttribute("aria-label", T("decreaseQty"));
    minus.addEventListener("click", function () {
      const current = window.Cart.qtyOf(line.item.id);
      if (current <= 1) {
        window.Cart.remove(line.item.id);
        toast(T("removedFromCart"));
      } else {
        window.Cart.setQty(line.item.id, current - 1, line.item.qty);
      }
      buzz();
    });

    const qty = document.createElement("span");
    qty.className = "step-qty";
    qty.textContent = String(line.qty);
    qty.setAttribute("aria-live", "polite");

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "step-btn";
    plus.textContent = "+";
    plus.setAttribute("aria-label", T("increaseQty"));
    plus.addEventListener("click", function () {
      const took = window.Cart.add(line.item.id, line.item.qty, 1);
      if (took === 0) {
        toast(T("outOfStock"));
      } else {
        buzz();
      }
    });

    stepper.appendChild(minus);
    stepper.appendChild(qty);
    stepper.appendChild(plus);
    row.appendChild(stepper);

    return row;
  }

  // --- Item detail sheet ---
  function openSheet(item) {
    if (!el.sheet || !el.sheetBody) return;
    // Remember the card button that opened the sheet, so focus can go back
    // to it. The currently focused element is not reliable here: a route
    // change moves focus to the view heading, and a language switch
    // re-renders the grid, detaching the original button.
    if (!sheetItemId || sheetItemId !== item.id) {
      lastFocused = document.activeElement;
    }
    sheetItemId = item.id;
    el.sheetBody.innerHTML = "";

    const img = document.createElement("img");
    img.className = "sheet-img";
    img.src = item.image;
    img.alt = itemName(item);
    img.width = 640;
    img.height = 480;
    el.sheetBody.appendChild(img);

    const name = document.createElement("h2");
    name.className = "sheet-title";
    name.textContent = itemName(item);

    const marker = makeDietMarker(item);
    if (marker) name.appendChild(marker);

    el.sheetBody.appendChild(name);

    const price = document.createElement("p");
    price.className = "sheet-price";
    price.textContent = priceLabel(item);
    el.sheetBody.appendChild(price);

    if (item.tags && item.tags.length) {
      const tags = document.createElement("ul");
      tags.className = "sheet-tags";
      item.tags.forEach(function (tag) {
        const li = document.createElement("li");
        li.textContent = tag;
        tags.appendChild(li);
      });
      el.sheetBody.appendChild(tags);
    }

    if (item.aiGenerated === true) {
      const note = document.createElement("p");
      note.className = "sheet-note";
      note.textContent = T("aiImageAlt");
      el.sheetBody.appendChild(note);
    }

    if (item.qty > 0) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "btn-primary btn-block";
      add.textContent = T("addToCart");
      add.setAttribute("data-add", item.id);
      add.addEventListener("click", function () {
        const took = window.Cart.add(item.id, item.qty, 1);
        if (took > 0) {
          buzz();
          toast(T("addedToCart"));
          renderMenu();
        } else {
          toast(T("outOfStock"));
        }
        closeSheet(item.id);
      });
      el.sheetBody.appendChild(add);
    } else {
      const disabled = document.createElement("button");
      disabled.type = "button";
      disabled.className = "btn-primary btn-block is-disabled";
      disabled.disabled = true;
      disabled.textContent = T("outOfStock");
      el.sheetBody.appendChild(disabled);
    }

    el.sheet.hidden = false;
    document.body.classList.add("sheet-open");
    // requestAnimationFrame is not guaranteed in every environment (older
    // WebViews, some test harnesses). Fall back to a timeout so the sheet
    // still reaches its open state instead of being left half-open.
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () {
        el.sheet.classList.add("open");
      });
    } else {
      setTimeout(function () {
        el.sheet.classList.add("open");
      }, 0);
    }
    const closeBtn = el.sheet.querySelector(".sheet-close");
    if (closeBtn) closeBtn.focus();
  }

  function closeSheet(focusItemId) {
    if (!el.sheet) return;
    el.sheet.classList.remove("open");
    document.body.classList.remove("sheet-open");
    sheetItemId = null;
    // The sheet stays in the DOM until its exit transition finishes, so the
    // backdrop does not vanish mid-animation. The delay matches --dur-sheet.
    setTimeout(function () {
      el.sheet.hidden = true;
    }, 220);
    // Focus goes back to the card that opened the sheet. The element that was
    // focused when the sheet opened may have been re-rendered out from
    // under it (a language switch rebuilds the grid), so the card is
    // resolved from the item id first and the remembered element is only
    // the fallback.
    if (focusItemId && el.grid) {
      // Prefer the card's "view details" button — that is what opened the
      // sheet. If the sheet was opened some other way (deep link), fall
      // back to the add button so focus still lands in the card.
      const card = el.grid.querySelector('[data-id="' + focusItemId + '"]');
      const again = card ? card.querySelector(".btn-ghost") : null;
      if (again) {
        again.focus();
        return;
      }
      const addBtn = el.grid.querySelector('[data-add="' + focusItemId + '"]');
      if (addBtn) {
        addBtn.focus();
        return;
      }
    }
    if (lastFocused && lastFocused.isConnected && lastFocused.focus) {
      lastFocused.focus();
    }
  }

  // Keep Tab inside the sheet while it is open.
  function trapSheetFocus(e) {
    if (el.sheet.hidden || e.key !== "Tab") return;
    const focusable = el.sheet.querySelectorAll(
      'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // --- Router ---
  const VIEWS = ["menu", "cart", "visit", "more"];

  const TAB_KEY = {
    menu: "menuTab",
    cart: "cartTab",
    visit: "visitTab",
    more: "moreTab"
  };

  function viewId(view) {
    return "view" + view.charAt(0).toUpperCase() + view.slice(1);
  }

  function navigate(view, skipHash) {
    if (VIEWS.indexOf(view) === -1) view = "menu";
    const previous = activeView;

    // Remember where the outgoing view was scrolled to.
    if (previous !== view) scrollMemory[previous] = window.scrollY;

    activeView = view;

    VIEWS.forEach(function (v) {
      const node = document.getElementById(viewId(v));
      if (node) node.hidden = v !== view;
    });

    if (el.tabbar) {
      el.tabbar.querySelectorAll(".tab").forEach(function (tab) {
        const isActive = tab.dataset.view === view;
        tab.classList.toggle("active", isActive);
        tab.setAttribute("aria-current", isActive ? "page" : "false");
      });
    }

    document.title = shopTitle() + " · " + T(TAB_KEY[view]);

    if (!skipHash) {
      if (window.location.hash !== "#/" + view) {
        window.history.pushState({ view: view }, "", "#/" + view);
      }
    }

    // Move focus to the view heading so keyboard and screen-reader users
    // land in the right place after a route change.
    const heading = document.querySelector("#" + viewId(view) + " [data-view-heading]");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }

    // Each view keeps its own scroll position, like a native app.
    const restore = scrollMemory[view] || 0;
    window.scrollTo(0, restore);
  }

  function shopTitle() {
    if (!shop || !shop.name) return T("shopName");
    return window.I18N && window.I18N.isHindi() ? shop.nameHi || shop.name : shop.name;
  }

  function routeFromHash() {
    const hash = window.location.hash.replace(/^#\/?/, "");
    return VIEWS.indexOf(hash) !== -1 ? hash : "menu";
  }

  // --- Visit + More views ---
  function shopStatus() {
    return window.Hours
      ? window.Hours.status(shop.hours, {
          timezone: shop.timezone,
          t: T
        })
      : { state: "unknown", label: "", nextOpenText: null };
  }

  function renderVisit() {
    if (!el.visitBody) return;
    el.visitBody.innerHTML = "";

    const status = shopStatus();

    const card = document.createElement("div");
    card.className = "visit-card";

    const pill = document.createElement("span");
    pill.className = "status-pill status-" + status.state;
    pill.textContent = status.label || "—";
    card.appendChild(pill);

    const hours = shop.hours || {};
    if (hours.open && hours.close) {
      const row = document.createElement("p");
      row.className = "visit-row";
      row.textContent = T("opensAt") + " " + hours.open + " – " + T("closesAt") + " " + hours.close;
      card.appendChild(row);
    }
    if (hours.days) {
      const row = document.createElement("p");
      row.className = "visit-row";
      row.textContent = hours.days;
      card.appendChild(row);
    }
    if (status.nextOpenText) {
      const row = document.createElement("p");
      row.className = "visit-row visit-muted";
      row.textContent = T("opensAt") + " " + status.nextOpenText;
      card.appendChild(row);
    }

    if (shop.address) {
      const addr = document.createElement("p");
      addr.className = "visit-address";
      addr.textContent = shop.address;
      card.appendChild(addr);
    }

    const actions = document.createElement("div");
    actions.className = "visit-actions";

    if (shop.mapsUrl) {
      const dir = document.createElement("a");
      dir.className = "btn-primary";
      dir.href = shop.mapsUrl;
      dir.target = "_blank";
      dir.rel = "noopener";
      dir.textContent = T("getDirections");
      actions.appendChild(dir);
    }

    if (shop.whatsapp) {
      const wa = document.createElement("a");
      wa.className = "btn-outline";
      wa.href =
        "https://wa.me/" +
        shop.whatsapp +
        "?text=" +
        encodeURIComponent(T("whatsappEnquiry") + " " + shopTitle());
      wa.target = "_blank";
      wa.rel = "noopener";
      wa.textContent = T("whatsappEnquiryLabel");
      actions.appendChild(wa);

      // The same number reaches the shop's phone line. A customer who is
      // already at the counter prefers ringing over typing.
      const call = document.createElement("a");
      call.className = "btn-outline";
      call.href = "tel:+" + shop.whatsapp;
      call.textContent = T("callShop");
      actions.appendChild(call);
    }

    if (shop.address) {
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "btn-outline";
      copy.textContent = T("copyAddress");
      copy.addEventListener("click", function () {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(shop.address).then(function () {
            toast(T("addressCopied"));
          });
        }
      });
      actions.appendChild(copy);
    }

    card.appendChild(actions);
    el.visitBody.appendChild(card);
  }

  function renderMore() {
    if (!el.moreBody) return;
    el.moreBody.innerHTML = "";

    // How it works
    const how = document.createElement("div");
    how.className = "how-block";
    const howTitle = document.createElement("h3");
    howTitle.className = "block-title";
    howTitle.textContent = T("howItWorks");
    how.appendChild(howTitle);

    const steps = [
      ["howStep1Title", "howStep1Body"],
      ["howStep2Title", "howStep2Body"],
      ["howStep3Title", "howStep3Body"]
    ];
    steps.forEach(function (pair, i) {
      const step = document.createElement("div");
      step.className = "how-step";
      const num = document.createElement("span");
      num.className = "how-num";
      num.textContent = String(i + 1).padStart(2, "0");
      step.appendChild(num);
      const txt = document.createElement("div");
      const h = document.createElement("h4");
      h.textContent = T(pair[0]);
      const p = document.createElement("p");
      p.textContent = T(pair[1]);
      txt.appendChild(h);
      txt.appendChild(p);
      step.appendChild(txt);
      how.appendChild(step);
    });
    el.moreBody.appendChild(how);

    // Testimonials
    const list = shop.testimonials || [];
    if (list.length > 0) {
      const t = document.createElement("div");
      t.className = "how-block";
      const title = document.createElement("h3");
      title.className = "block-title";
      title.textContent = T("testimonialsTitle");
      t.appendChild(title);
      const wrap = document.createElement("div");
      wrap.className = "testimonials-list";
      list.forEach(function (item) {
        const block = document.createElement("blockquote");
        block.className = "testimonial";
        const q = document.createElement("p");
        q.className = "testimonial-text";
        q.textContent = "\u201C" + item.text + "\u201D";
        const c = document.createElement("cite");
        c.className = "testimonial-name";
        c.textContent = "— " + item.name;
        block.appendChild(q);
        block.appendChild(c);
        wrap.appendChild(block);
      });
      t.appendChild(wrap);
      el.moreBody.appendChild(t);
    }

    // Meta
    const meta = document.createElement("div");
    meta.className = "how-block";
    const metaRow = document.createElement("p");
    metaRow.className = "visit-row visit-muted";
    metaRow.textContent =
      T("menuUpdated") + ": " + (el.lastUpdated ? el.lastUpdated.textContent : "—");
    meta.appendChild(metaRow);
    el.moreBody.appendChild(meta);
  }

  // --- Status pill in the header ---
  function renderStatus() {
    if (!el.statusPill) return;
    const status = shopStatus();
    el.statusPill.textContent = status.label || "";
    el.statusPill.hidden = status.state === "unknown";
    el.statusPill.className = "status-pill status-" + status.state;
  }

  // --- Filters ---
  function bindFilters() {
    const bar = document.getElementById("filterBar");
    if (!bar) return;
    bar.addEventListener("click", function (e) {
      const btn = e.target.closest(".filter-btn");
      if (!btn) return;
      activeFilter = btn.dataset.filter;
      bar.querySelectorAll(".filter-btn").forEach(function (b) {
        const isActive = b === btn;
        b.classList.toggle("active", isActive);
        b.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
      renderMenu();
    });
  }

  // --- Search ---
  function bindSearch() {
    if (!el.searchInput) return;
    let timer = null;
    el.searchInput.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        searchTerm = el.searchInput.value;
        renderMenu();
      }, 140);
    });

    const clear = document.getElementById("searchClear");
    if (clear) {
      clear.addEventListener("click", function () {
        el.searchInput.value = "";
        searchTerm = "";
        renderMenu();
        el.searchInput.focus();
      });
    }
  }

  // --- Tabs ---
  function bindTabs() {
    if (!el.tabbar) return;
    el.tabbar.addEventListener("click", function (e) {
      const tab = e.target.closest(".tab");
      if (!tab) return;
      navigate(tab.dataset.view);
    });
  }

  // --- Order handoff ---
  function bindOrder() {
    if (!el.orderBtn) return;
    el.orderBtn.addEventListener("click", function () {
      const lines = cartItems();
      if (lines.length === 0) return;
      const message = window.Cart.buildOrderText(
        lines.map(function (l) {
          return { name: l.item.name, nameHi: l.item.nameHi, price: l.item.price, qty: l.qty };
        }),
        shop,
        window.I18N ? window.I18N.getLang() : "en"
      );
      const number = shop.whatsapp || "";
      if (!number) {
        toast(T("orderNote"));
        return;
      }
      window.location.href = "https://wa.me/" + number + "?text=" + encodeURIComponent(message);
    });
  }

  function bindSheet() {
    if (!el.sheet) return;
    el.sheet.querySelectorAll("[data-sheet-close]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeSheet(sheetItemId);
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !el.sheet.hidden) closeSheet(sheetItemId);
    });
    document.addEventListener("keydown", trapSheetFocus);
  }

  // --- Install prompt ---
  function bindInstall() {
    if (el.installBtn) {
      el.installBtn.addEventListener("click", function () {
        if (!deferredInstall) {
          toast(T("installUnavailable"));
          return;
        }
        deferredInstall.prompt();
        deferredInstall.userChoice.then(function (choice) {
          if (choice.outcome === "accepted") {
            toast(T("installed"));
          }
          deferredInstall = null;
          if (el.installBtn) el.installBtn.hidden = true;
        });
      });
    }
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredInstall = e;
      if (el.installBtn) el.installBtn.hidden = false;
    });
  }

  // --- Online/offline ---
  function bindConnectivity() {
    function update(online) {
      if (!el.offlineBanner) return;
      el.offlineBanner.hidden = online;
      el.offlineBanner.textContent = online ? "" : T("offline");
      if (online && items.length === 0) loadItems();
    }
    window.addEventListener("online", function () {
      update(true);
      toast(T("online"));
    });
    window.addEventListener("offline", function () {
      update(false);
    });
    update(navigator.onLine !== false);
  }

  // --- Language ---
  function bindLang() {
    const btn = document.getElementById("langToggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      const next = window.I18N.getLang() === "en" ? "hi" : "en";
      window.I18N.setLang(next);
    });
    document.addEventListener("langchange", function () {
      if (el.shopTitle) el.shopTitle.textContent = shopTitle();
      renderMenu();
      renderCart();
      renderSpecial();
      renderVisit();
      renderMore();
      renderStatus();
      // navigate() moves focus to the view heading, so the sheet rebuild
      // (which puts focus back inside the sheet) has to run after it.
      navigate(activeView, true);
      // The open sheet holds translated strings, so it has to be rebuilt in
      // the new language too. It stays open and keeps its position.
      if (sheetItemId && el.sheet && !el.sheet.hidden) {
        const open = items.find(function (i) {
          return i.id === sheetItemId;
        });
        if (open) {
          // openSheet() keeps the existing lastFocused when the item is
          // unchanged, so the card button that opened the sheet is still
          // the focus target after the rebuild.
          openSheet(open);
          const btn = el.sheet.querySelector(".sheet-close");
          if (btn) btn.focus();
        }
      }
    });
  }

  // --- Share ---
  function bindShare() {
    const btn = document.getElementById("btnShare");
    if (!btn) return;
    btn.addEventListener("click", function () {
      const url = window.location.origin + window.location.pathname;
      if (navigator.share) {
        navigator
          .share({
            title: shopTitle(),
            text: shopTitle(),
            url: url
          })
          .catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          toast(T("shareCopied"));
        });
      }
    });
  }

  // --- Service worker ---
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {
        // Offline support is progressive enhancement; failure is silent.
      });
    });
  }

  // --- Load ---
  function loadItems() {
    showSkeletons();
    const controller = new AbortController();
    const timeout = setTimeout(function () {
      controller.abort();
    }, 6000);

    fetch("data/items.json", { signal: controller.signal, cache: "no-cache" })
      .then(function (res) {
        clearTimeout(timeout);
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (raw) {
        items = validateItems(raw);
        renderSpecial();
        renderLastUpdated();
        renderMenu();
        renderCart();
      })
      .catch(function (err) {
        clearTimeout(timeout);
        if (el.grid) {
          el.grid.removeAttribute("aria-busy");
          el.grid.innerHTML = "";
          const p = document.createElement("p");
          p.className = "menu-error";
          p.textContent =
            err.name === "AbortError" ? T("loadTimeout") : T("loadError") + " " + err.message;
          el.grid.appendChild(p);
        }
      });
  }

  function loadShop() {
    fetch("data/shop.json", { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        shop = data || {};
        if (el.shopTitle) el.shopTitle.textContent = shopTitle();
        renderStatus();
        renderVisit();
        renderMore();
        navigate(activeView, true);
      })
      .catch(function () {
        // shop.json is an enhancement — the menu still works without it.
      });
  }

  function init() {
    cacheEls();
    // One subscription for the lifetime of the app. Registering it inside
    // renderCart() would add a new listener on every render.
    if (window.Cart) window.Cart.onChange(renderCart);

    bindFilters();
    bindSearch();
    bindTabs();
    bindOrder();
    bindSheet();
    bindInstall();
    bindConnectivity();
    bindLang();
    bindShare();
    registerSW();

    window.addEventListener("popstate", function () {
      navigate(routeFromHash(), true);
    });

    navigate(routeFromHash(), true);
    loadItems();
    loadShop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
