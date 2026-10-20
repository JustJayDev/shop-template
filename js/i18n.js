// i18n.js — English / Hindi strings for the shop app.
//
// Shop-specific data (name, address, hours) comes from data/shop.json.
// Everything the UI chrome says lives here. Every key must exist in BOTH
// languages — a missing Hindi key falls back to English and shows up as a
// half-translated page.
//
// ATTRIBUTE TRANSLATION
//   data-i18n             -> textContent
//   data-i18n-html        -> innerHTML (only for trusted, in-repo strings)
//   data-i18n-placeholder  -> placeholder attribute
//   data-i18n-aria        -> aria-label attribute
//   data-i18n-title       -> title attribute
(function () {
  "use strict";

  const strings = {
    en: {
      shopName: "Demo Sweet Shop",
      langSwitchTo: "Switch language to Hindi",
      menuTab: "Menu",
      cartTab: "Cart",
      visitTab: "Visit",
      moreTab: "More",
      searchPlaceholder: "Search sweets, snacks",
      searchLabel: "Search the menu",
      clearSearch: "Clear search",
      filterNavLabel: "Filter by category",
      mainNavLabel: "Main navigation",
      noResults: "Nothing matched",
      noResultsHint: "Try a different word, or pick another category.",
      filterAll: "All",
      filterSweet: "Sweets",
      filterSnack: "Snacks",
      todaySpecial: "Today's Special",
      addToCart: "Add to cart",
      addedToCart: "Added to cart",
      outOfStock: "Out of stock",
      pricePrefix: "₹",
      qtyLeft: "left",
      unitPc: "pc",
      unitKg: "kg",
      unitPlate: "plate",
      itemDetails: "Item details",
      viewDetails: "View details",
      close: "Close",
      increaseQty: "Increase quantity",
      decreaseQty: "Decrease quantity",
      removedFromCart: "Removed from cart",
      yourCart: "Your cart",
      cartEmpty: "Your cart is empty",
      cartEmptyHint: "Add something sweet from the menu and it will show up here.",
      browseMenu: "Browse the menu",
      total: "Total",
      itemsLabel: "items",
      orderOnWhatsapp: "Send order on WhatsApp",
      orderNote: "Opens WhatsApp with your order written out. We never take payment here.",
      orderReady: "Your order is ready to send in WhatsApp.",
      whatsappEnquiry: "Are you open today? This is",
      whatsappEnquiryLabel: "WhatsApp the shop",
      callShop: "Call the shop",
      visitTitle: "Visit us",
      openNow: "Open now",
      closedNow: "Closed",
      opensAt: "Opens",
      closesAt: "Closes",
      opensTomorrow: "tomorrow",
      opensOn: "on",
      address: "Address",
      getDirections: "Get directions",
      copyAddress: "Copy address",
      addressCopied: "Address copied",
      shareShop: "Share",
      shareCopied: "Link copied",
      menuUpdated: "Menu updated",
      testimonialsTitle: "What customers say",
      howItWorks: "How ordering works",
      howStep1Title: "Pick what you like",
      howStep1Body: "Browse the menu and add items to your cart.",
      howStep2Title: "Send the order",
      howStep2Body: "One tap sends your order to the shop on WhatsApp.",
      howStep3Title: "Pick it up",
      howStep3Body: "The shop confirms what is fresh and when it will be ready.",
      installApp: "Install the app",
      installHint: "Add it to your home screen for a full-screen, faster experience.",
      installed: "App installed",
      installUnavailable: "Already installed, or not supported in this browser.",
      loadError: "Could not load the menu",
      loadTimeout: "The menu took too long to load. Check your connection.",
      offline: "You are offline. Showing the last saved menu.",
      online: "Back online.",
      aiBadge: "AI",
      aiImageAlt: "AI-generated image",
      vegLabel: "Vegetarian",
      nonVegLabel: "Non-vegetarian",
      day0: "Sunday",
      day1: "Monday",
      day2: "Tuesday",
      day3: "Wednesday",
      day4: "Thursday",
      day5: "Friday",
      day6: "Saturday"
    },
    hi: {
      shopName: "डेमो मिठाई दुकान",
      langSwitchTo: "भाषा अंग्रेज़ी में बदलें",
      menuTab: "मेनू",
      cartTab: "कार्ट",
      visitTab: "दुकान",
      moreTab: "और",
      searchPlaceholder: "मिठाई, नमकीन खोजें",
      searchLabel: "मेनू में खोजें",
      clearSearch: "खोज मिटाएँ",
      filterNavLabel: "श्रेणी से छाँटें",
      mainNavLabel: "मुख्य नेविगेशन",
      noResults: "कुछ नहीं मिला",
      noResultsHint: "कोई दूसरा शब्द आज़माएँ, या दूसरी श्रेणी चुनें।",
      filterAll: "सभी",
      filterSweet: "मिठाई",
      filterSnack: "नमकीन",
      todaySpecial: "आज का विशेष",
      addToCart: "कार्ट में डालें",
      addedToCart: "कार्ट में जुड़ गया",
      outOfStock: "स्टॉक खत्म",
      pricePrefix: "₹",
      qtyLeft: "बचे हैं",
      unitPc: "पीस",
      unitKg: "किलो",
      unitPlate: "प्लेट",
      itemDetails: "विवरण",
      viewDetails: "विवरण देखें",
      close: "बंद करें",
      increaseQty: "मात्रा बढ़ाएँ",
      decreaseQty: "मात्रा घटाएँ",
      removedFromCart: "कार्ट से हटा दिया",
      yourCart: "आपका कार्ट",
      cartEmpty: "आपका कार्ट खाली है",
      cartEmptyHint: "मेनू से कुछ मीठा जोड़ें, वह यहाँ दिखेगा।",
      browseMenu: "मेनू देखें",
      total: "कुल",
      itemsLabel: "चीज़ें",
      orderOnWhatsapp: "WhatsApp पर ऑर्डर भेजें",
      orderNote: "WhatsApp खुलेगा और ऑर्डर लिखा हुआ रहेगा। यहाँ पेमेंट नहीं लिया जाता।",
      orderReady: "ऑर्डर तैयार है — WhatsApp में भेजने के लिए टैप करें।",
      whatsappEnquiry: "क्या आज दुकान खुली है? यह है",
      whatsappEnquiryLabel: "WhatsApp पर संपर्क करें",
      callShop: "दुकान को कॉल करें",
      visitTitle: "हमारी दुकान",
      openNow: "अभी खुली है",
      closedNow: "अभी बंद है",
      opensAt: "खुलता है",
      closesAt: "बंद होता है",
      opensTomorrow: "कल",
      opensOn: "को",
      address: "पता",
      getDirections: "रास्ता देखें",
      copyAddress: "पता कॉपी करें",
      addressCopied: "पता कॉपी हो गया",
      shareShop: "शेयर",
      shareCopied: "लिंक कॉपी हो गया",
      menuUpdated: "मेनू अपडेट",
      testimonialsTitle: "ग्राहक क्या कहते हैं",
      howItWorks: "ऑर्डर कैसे करें",
      howStep1Title: "जो पसंद करें चुनें",
      howStep1Body: "मेनू देखें और चीज़ें कार्ट में डालें।",
      howStep2Title: "ऑर्डर भेजें",
      howStep2Body: "एक टैप में ऑर्डर WhatsApp पर दुकान तक पहुँच जाता है।",
      howStep3Title: "साथ ले जाएँ",
      howStep3Body: "दुकान बताएगी क्या ताज़ा है और कब तैयार होगा।",
      installApp: "ऐप इंस्टॉल करें",
      installHint: "होम स्क्रीन पर लगाएँ — पूरी स्क्रीन, तेज़।",
      installed: "ऐप इंस्टॉल है",
      installUnavailable: "पहले से इंस्टॉल है, या इस ब्राउज़र में समर्थित नहीं।",
      loadError: "मेनू लोड नहीं हुआ",
      loadTimeout: "मेनू लोड होने में बहुत समय लगा। कनेक्शन जाँचें।",
      offline: "आप ऑफ़लाइन हैं। पिछला सेव किया मेनू दिख रहा है।",
      online: "दोबारा ऑनलाइन।",
      aiBadge: "AI",
      aiImageAlt: "AI से बनाया गया चित्र",
      vegLabel: "शाकाहारी",
      nonVegLabel: "मांसाहारी",
      day0: "रविवार",
      day1: "सोमवार",
      day2: "मंगलवार",
      day3: "बुधवार",
      day4: "गुरुवार",
      day5: "शुक्रवार",
      day6: "शनिवार"
    }
  };

  let currentLang = "en";

  // Translate a key. Falls back to English, then to the key itself, so a
  // missing string is visible rather than silently blank.
  function t(key) {
    const s = strings[currentLang];
    if (s && s[key] != null) return s[key];
    if (strings.en[key] != null) return strings.en[key];
    return key;
  }

  function isHindi() {
    return currentLang === "hi";
  }

  // Every translated attribute goes through one helper, so adding an
  // attribute is a one-line change rather than a new querySelectorAll.
  const ATTRIBUTE_MAP = [
    ["data-i18n-placeholder", "placeholder"],
    ["data-i18n-aria", "aria-label"],
    ["data-i18n-title", "title"]
  ];

  function apply() {
    document.documentElement.lang = currentLang;

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });

    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });

    ATTRIBUTE_MAP.forEach(function (pair) {
      const attr = pair[0];
      const target = pair[1];
      document.querySelectorAll("[" + attr + "]").forEach(function (el) {
        el.setAttribute(target, t(el.getAttribute(attr)));
      });
    });

    document.querySelectorAll("[data-lang-toggle]").forEach(function (btn) {
      btn.textContent = currentLang === "en" ? "हिंदी" : "English";
      btn.setAttribute("aria-label", t("langSwitchTo"));
      btn.setAttribute("aria-pressed", currentLang === "hi" ? "true" : "false");
    });
  }

  function setLang(lang) {
    currentLang = lang === "hi" ? "hi" : "en";
    try {
      localStorage.setItem("shop_lang", currentLang);
    } catch (e) {
      // Private mode / storage disabled — language still switches for this visit.
    }
    apply();
    document.dispatchEvent(new CustomEvent("langchange", { detail: { lang: currentLang } }));
  }

  function getLang() {
    return currentLang;
  }

  function initLang() {
    let saved = null;
    try {
      saved = localStorage.getItem("shop_lang");
    } catch (e) {
      saved = null;
    }
    currentLang = saved === "hi" ? "hi" : "en";
    apply();
  }

  window.I18N = {
    t: t,
    setLang: setLang,
    getLang: getLang,
    isHindi: isHindi,
    initLang: initLang,
    // Exposed so the parity test can compare the two dictionaries directly
    // instead of re-parsing this file. Read-only by convention.
    strings: strings
  };

  document.addEventListener("DOMContentLoaded", initLang);
})();
