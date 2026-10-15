// menu.js — fetches items.json once, caches in memory, renders browse-only cards.
(function () {
  "use strict";

  const grid = document.getElementById("menuGrid");
  let cachedItems = null;

  // --- Skeleton loading state ---
  function showSkeletons() {
    grid.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const sk = document.createElement("div");
      sk.className = "skeleton-card";
      sk.setAttribute("aria-hidden", "true");
      grid.appendChild(sk);
    }
  }

  // --- Data validation: skip malformed items ---
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

  // --- Show last updated timestamp ---
  function showLastUpdated(items) {
    const el = document.getElementById("lastUpdated");
    if (!el || items.length === 0) return;
    const latest = items.reduce(function (max, item) {
      return item.updatedAt > max ? item.updatedAt : max;
    }, items[0].updatedAt || "");
    if (latest) {
      el.textContent = new Date(latest).toLocaleDateString(
        window.I18N.getLang() === "hi" ? "hi-IN" : "en-IN",
        { day: "numeric", month: "short", year: "numeric" }
      );
    }
  }

  function renderItems(items) {
    const lang = window.I18N.getLang();
    grid.innerHTML = "";
    grid.removeAttribute("aria-busy");

    showLastUpdated(cachedItems || items);

    items.forEach(function (item, index) {
      const card = document.createElement("article");
      card.className = "item-card" + (item.qty === 0 ? " oos" : "");

      const img = document.createElement("img");
      img.src = item.image;
      img.alt = lang === "hi" ? item.nameHi : item.name;
      img.width = 640;
      img.height = 480;
      // First 3 are above the fold — load eagerly for LCP
      if (index === 0) img.fetchPriority = "high";
      if (index > 2) img.loading = "lazy";

      const body = document.createElement("div");
      body.className = "card-body";

      const name = document.createElement("h2");
      name.className = "item-name";
      name.textContent = lang === "hi" ? item.nameHi : item.name;

      const meta = document.createElement("div");
      meta.className = "item-meta";

      const price = document.createElement("span");
      price.className = "item-price";
      const unitKey =
        item.unit === "kg" ? "unitKg" : item.unit === "plate" ? "unitPlate" : "unitPc";
      price.textContent = window.I18N.t("pricePrefix") + item.price + "/" + window.I18N.t(unitKey);

      meta.appendChild(price);

      if (item.qty === 0) {
        const oos = document.createElement("span");
        oos.className = "oos-label";
        oos.textContent = window.I18N.t("outOfStock");
        meta.appendChild(oos);
      } else {
        const qty = document.createElement("span");
        qty.className = "item-qty";
        qty.textContent = item.qty + " " + window.I18N.t("qtyLabel");
        meta.appendChild(qty);
      }

      body.appendChild(name);
      body.appendChild(meta);
      card.appendChild(img);
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  function showError(message) {
    grid.removeAttribute("aria-busy");
    grid.innerHTML = "";
    const p = document.createElement("p");
    p.className = "menu-error";
    p.textContent = message;
    grid.appendChild(p);
  }

  function loadItems() {
    showSkeletons();
    const controller = new AbortController();
    const timeout = setTimeout(function () {
      controller.abort();
    }, 5000);

    fetch("data/items.json", { signal: controller.signal, cache: "no-cache" })
      .then(function (res) {
        clearTimeout(timeout);
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (raw) {
        cachedItems = validateItems(raw);
        showSpecial();
        renderItems(getFilteredItems());
      })
      .catch(function (err) {
        clearTimeout(timeout);
        const msg =
          err.name === "AbortError"
            ? window.I18N.t("loadTimeout")
            : window.I18N.t("loadError") + " " + err.message;
        showError(msg);
      });
  }

  // --- Category filter ---
  let activeFilter = "all";

  function getFilteredItems() {
    if (!cachedItems) return [];
    if (activeFilter === "all") return cachedItems;
    return cachedItems.filter(function (item) {
      return item.category === activeFilter;
    });
  }

  const filterBar = document.getElementById("filterBar");
  if (filterBar) {
    filterBar.addEventListener("click", function (e) {
      const btn = e.target.closest(".filter-btn");
      if (!btn) return;
      activeFilter = btn.getAttribute("data-filter");
      filterBar.querySelectorAll(".filter-btn").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      if (cachedItems) {
        renderItems(getFilteredItems());
      }
    });
  }

  // Language switch: re-render from cache, no re-fetch.
  // Everything i18n-dependent must be refreshed here: card text,
  // the special banner, and the shop-info block.
  document.addEventListener("langchange", function () {
    if (cachedItems) {
      showSpecial();
      renderItems(getFilteredItems());
    } else {
      loadItems();
    }
    applyShopInfo();
  });

  // --- Shop info (hours, address, WhatsApp, testimonials) ---
  let cachedShop = null;

  function applyShopInfo() {
    if (!cachedShop) return;
    const shop = cachedShop;
    const isHi = window.I18N.getLang() === "hi";

    // Shop name (prefer shop.json over the i18n default)
    const titleEl = document.querySelector(".shop-title");
    if (titleEl) {
      const name = isHi ? shop.nameHi || shop.name : shop.name;
      if (name) titleEl.textContent = name;
    }

    // Hours — hide the line entirely when not configured
    const hoursEl = document.getElementById("shopHours");
    if (hoursEl) {
      const h = shop.hours || {};
      if (h.open && h.close) {
        hoursEl.hidden = false;
        hoursEl.textContent =
          window.I18N.t("openHours") +
          ": " +
          h.open +
          " – " +
          h.close +
          (h.days ? " (" + h.days + ")" : "");
      } else if (h.days) {
        hoursEl.hidden = false;
        hoursEl.textContent = h.days;
      } else {
        hoursEl.hidden = true;
        hoursEl.textContent = "";
      }
    }

    // Address
    const addrEl = document.getElementById("shopAddress");
    if (addrEl) {
      addrEl.hidden = !shop.address;
      addrEl.textContent = shop.address || "";
    }

    // Directions — hide when no URL is configured
    const dirLink = document.getElementById("directionsLink");
    if (dirLink) {
      dirLink.hidden = !shop.mapsUrl;
      if (shop.mapsUrl) dirLink.href = shop.mapsUrl;
    }
  }

  function loadShopInfo() {
    fetch("data/shop.json", { cache: "no-cache" })
      .then(function (r) {
        return r.json();
      })
      .then(function (shop) {
        cachedShop = shop;
        applyShopInfo();

        // WhatsApp FAB — hide entirely if no number is configured
        const fab = document.getElementById("whatsappFab");
        if (fab) {
          if (shop.whatsapp) {
            fab.hidden = false;
            fab.href =
              "https://wa.me/" +
              shop.whatsapp +
              "?text=" +
              encodeURIComponent("Hi! I'd like to order from " + (shop.name || "your shop") + ".");
          } else {
            fab.hidden = true;
          }
        }

        // Testimonials
        const tSection = document.getElementById("testimonialsSection");
        const tList = document.getElementById("testimonialsList");
        if (tSection && tList) {
          const list = shop.testimonials || [];
          if (list.length > 0) {
            tSection.hidden = false;
            tList.innerHTML = "";
            list.forEach(function (t) {
              const block = document.createElement("blockquote");
              block.className = "testimonial";
              const quote = document.createElement("p");
              quote.className = "testimonial-text";
              quote.textContent = '"' + t.text + '"';
              const cite = document.createElement("cite");
              cite.className = "testimonial-name";
              cite.textContent = "— " + t.name;
              block.appendChild(quote);
              block.appendChild(cite);
              tList.appendChild(block);
            });
          } else {
            tSection.hidden = true;
          }
        }
      })
      .catch(function () {
        // shop.json is optional enhancement; fail silently
      });
  }

  // --- Special banner (i18n-aware; re-runs on language change) ---
  function showSpecial() {
    const banner = document.getElementById("specialBanner");
    const nameEl = document.getElementById("specialName");
    if (!banner || !nameEl || !cachedItems) return;
    const special = cachedItems.find(function (i) {
      return i.isSpecial && i.qty > 0;
    });
    if (special) {
      const unitKey =
        special.unit === "kg" ? "unitKg" : special.unit === "plate" ? "unitPlate" : "unitPc";
      banner.hidden = false;
      nameEl.textContent =
        (window.I18N.getLang() === "hi" ? special.nameHi : special.name) +
        " — " +
        window.I18N.t("pricePrefix") +
        special.price +
        "/" +
        window.I18N.t(unitKey);
    } else {
      banner.hidden = true;
    }
  }

  // Share button
  const btnShare = document.getElementById("btnShare");
  if (btnShare) {
    btnShare.addEventListener("click", function () {
      const shopName = (cachedShop && cachedShop.name) || "our shop";
      if (navigator.share) {
        navigator
          .share({
            title: shopName,
            text: "Check out the menu at " + shopName + "!",
            url: window.location.href
          })
          .catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(window.location.href).then(function () {
          const original = window.I18N.t("shareMenu");
          btnShare.textContent = "Copied!";
          setTimeout(function () {
            btnShare.textContent = original;
          }, 2000);
        });
      }
    });
  }

  // Register service worker for offline support
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {
        // SW is progressive enhancement; failure is silent
      });
    });
  }

  loadItems();
  loadShopInfo();
})();
