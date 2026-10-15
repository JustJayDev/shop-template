// i18n.js — English / Hindi toggle for the shop template.
// Shop-specific strings (name, address, hours) come from data/shop.json;
// everything else lives here.
(function () {
  "use strict";

  const strings = {
    en: {
      shopName: "Demo Sweet Shop",
      browseOnly: "Browse only — no online ordering.",
      outOfStock: "Out of stock",
      qtyLabel: "left",
      pricePrefix: "₹",
      loadError: "Failed to load menu:",
      loadTimeout: "Menu took too long to load. Check your connection.",
      filterAll: "All",
      filterSweet: "Sweets",
      filterSnack: "Snacks",
      menuUpdated: "Menu updated",
      todaySpecial: "Today's Special",
      whatsappOrder: "Order on WhatsApp",
      shareMenu: "Share Menu",
      getDirections: "Get Directions",
      openHours: "Open",
      closed: "Closed",
      testimonialsTitle: "What customers say",
      unitPc: "pc",
      unitKg: "kg",
      unitPlate: "plate"
    },
    hi: {
      shopName: "डेमो मिठाई दुकान",
      browseOnly: "केवल देखें — ऑनलाइन ऑर्डर उपलब्ध नहीं।",
      outOfStock: "स्टॉक खत्म",
      qtyLabel: "बचे",
      pricePrefix: "₹",
      loadError: "मेनू लोड नहीं हो सका:",
      loadTimeout: "मेनू लोड होने में बहुत समय लग रहा है। कृपया कनेक्शन जांचें।",
      filterAll: "सभी",
      filterSweet: "मिठाई",
      filterSnack: "नमकीन",
      menuUpdated: "मेनू अपडेट",
      todaySpecial: "आज का विशेष",
      whatsappOrder: "WhatsApp पर ऑर्डर करें",
      shareMenu: "मेनू शेयर करें",
      getDirections: "रास्ता देखें",
      openHours: "खुला",
      closed: "बंद",
      testimonialsTitle: "ग्राहक क्या कहते हैं",
      unitPc: "पीस",
      unitKg: "किलो",
      unitPlate: "प्लेट"
    }
  };

  let currentLang = "en";

  function t(key) {
    return strings[currentLang][key] || strings.en[key] || key;
  }

  function setLang(lang) {
    currentLang = lang === "hi" ? "hi" : "en";
    document.documentElement.lang = currentLang;

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      const key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });

    const btn = document.getElementById("langToggle");
    if (btn) btn.textContent = currentLang === "en" ? "हिंदी" : "English";

    document.dispatchEvent(new CustomEvent("langchange", { detail: { lang: currentLang } }));
  }

  function getLang() {
    return currentLang;
  }

  window.I18N = { t: t, setLang: setLang, getLang: getLang };

  const btn = document.getElementById("langToggle");
  if (btn) {
    btn.addEventListener("click", function () {
      setLang(currentLang === "en" ? "hi" : "en");
    });
  }
})();
