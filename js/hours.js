// hours.js — open/closed status for the shop.
//
// WHY THE SHOP'S TIMEZONE MATTERS
// The shop is in India. The customer may be anywhere. If we used the
// visitor's clock, a customer in Dubai or London would see the shop
// "open" at 3am their time while it is actually closed in Delhi. The shop's
// hours are a property of the shop, so they are always evaluated in the
// shop's timezone.
//
// The default timezone is Asia/Kolkata. It can be overridden per shop via
// data/shop.json -> timezone, so this template also works for a shop
// outside India.
(function () {
  "use strict";

  const DEFAULT_TZ = "Asia/Kolkata";

  const DAY_NAMES = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6
  };

  // "Mon–Sun" / "Mon-Sun" / "Mon,Sat,Sun" / "Daily" / "All days"
  // Returns the set of weekday indices (0=Sun) the shop is open, or null
  // when the days string means "every day".
  function parseDays(days) {
    if (!days || typeof days !== "string") return null;
    const s = days.trim().toLowerCase();
    if (!s) return null;
    if (s === "daily" || s === "all days" || s === "every day" || s === "all") return null;

    // A dash between two day names is a RANGE (Mon–Fri). This has to be
    // checked BEFORE the split, otherwise "mon-fri" splits into two parts
    // and reads as "Monday and Friday" instead of the whole week range.
    const range = s.match(/([a-z]{3,9})\s*[\u2013\u2014-]\s*([a-z]{3,9})/);
    if (range) {
      const from = DAY_NAMES[range[1]];
      const to = DAY_NAMES[range[2]];
      if (from != null && to != null) {
        const set = new Set();
        let d = from;
        for (let i = 0; i < 7; i++) {
          set.add(d);
          if (d === to) break;
          d = (d + 1) % 7;
        }
        return set;
      }
    }

    const found = new Set();
    let matched = false;
    s.split(/[,\u2013\u2014\/\s]+/).forEach(function (part) {
      const key = part.trim();
      if (!key) return;
      if (Object.prototype.hasOwnProperty.call(DAY_NAMES, key)) {
        found.add(DAY_NAMES[key]);
        matched = true;
      }
    });
    return matched ? found : null;
  }

  // "09:00" -> 540 minutes
  function parseTime(value) {
    if (typeof value !== "string") return null;
    const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  // Wall-clock time in the shop's timezone, as Y/M/D/H/M.
  function zonedParts(date, tz) {
    const opts = {
      timeZone: tz,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      // h23 keeps midnight at 00. With plain hour12:false some engines
      // return 24, which would make 00:00 look like the end of the day.
      hourCycle: "h23"
    };
    let fmt;
    try {
      fmt = new Intl.DateTimeFormat("en-US", opts);
    } catch (e) {
      // Unknown timezone — fall back to UTC rather than throwing.
      const fallback = Object.assign({}, opts);
      delete fallback.hourCycle;
      fallback.timeZone = "UTC";
      fmt = new Intl.DateTimeFormat("en-US", fallback);
    }
    const parts = {};
    fmt.formatToParts(date).forEach(function (p) {
      parts[p.type] = p.value;
    });
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    let hour = parseInt(parts.hour, 10);
    if (hour === 24) hour = 0;
    return {
      weekday: weekdayMap[parts.weekday] != null ? weekdayMap[parts.weekday] : 0,
      minutes: hour * 60 + parseInt(parts.minute, 10),
      dateKey: parts.year + "-" + parts.month + "-" + parts.day
    };
  }

  // Weekday name in the active language.
  function weekdayName(index, t) {
    const tr =
      t ||
      function (key) {
        return key;
      };
    return tr("day" + index);
  }

  // When does the shop next open? "09:00" today, "tomorrow 09:00", or
  // "on Monday 09:00" for a later day in the week.
  function formatNextOpen(nextOpen, nextOpenDay, todayWeekday, t) {
    if (nextOpen == null) return null;
    const tr =
      t ||
      function (key) {
        return key;
      };
    if (nextOpenDay == null) return nextOpen;
    const diff = (nextOpenDay - todayWeekday + 7) % 7;
    if (diff === 0) return nextOpen;
    if (diff === 1) return tr("opensTomorrow") + " " + nextOpen;
    return tr("opensOn") + " " + weekdayName(nextOpenDay, tr) + " " + nextOpen;
  }

  // Returns a status object describing the shop right now.
  //
  // {
  //   state: "open" | "closed" | "unknown",
  //   label: <translated string>,
  //   open: "09:00", close: "21:00",  // raw shop-config values
  //   nextOpen: "09:00" | null,         // raw time
  //   nextOpenText: "tomorrow 09:00" | null,
  //   todayWeekday: 0..6
  // }
  function status(hours, opts) {
    const o = opts || {};
    const tz = o.timezone || DEFAULT_TZ;
    const t =
      o.t ||
      function (key) {
        return key;
      };

    const unknown = {
      state: "unknown",
      label: "",
      open: null,
      close: null,
      nextOpen: null,
      nextOpenText: null,
      nextOpenDay: null,
      todayWeekday: null
    };

    if (!hours || !hours.open || !hours.close) return unknown;

    const openMin = parseTime(hours.open);
    const closeMin = parseTime(hours.close);
    if (openMin == null || closeMin == null) return unknown;

    const openDays = parseDays(hours.days);
    const now = zonedParts(o.now || new Date(), tz);
    const todayOpen = !openDays || openDays.has(now.weekday);

    // Overnight shops (open 18:00, close 02:00) — the "still open" window
    // belongs to the PREVIOUS day's session.
    const overnight = closeMin <= openMin;

    let isOpen = false;
    if (overnight) {
      const prevWeekday = (now.weekday + 6) % 7;
      const yesterdayOpen = !openDays || openDays.has(prevWeekday);
      if (yesterdayOpen && now.minutes < closeMin) isOpen = true;
      if (todayOpen && now.minutes >= openMin) isOpen = true;
    } else {
      isOpen = todayOpen && now.minutes >= openMin && now.minutes < closeMin;
    }

    if (isOpen) {
      return {
        state: "open",
        label: t("openNow"),
        open: hours.open,
        close: hours.close,
        nextOpen: null,
        nextOpenText: null,
        nextOpenDay: null,
        todayWeekday: now.weekday
      };
    }

    // Closed. When does it next open?
    let nextOpen = null;
    let nextOpenDay = null;
    if (!overnight) {
      if (todayOpen && now.minutes < openMin) {
        nextOpen = hours.open;
        nextOpenDay = now.weekday;
      } else {
        // Look ahead for the next open day, up to a week.
        for (let i = 1; i <= 7; i++) {
          const wd = (now.weekday + i) % 7;
          if (!openDays || openDays.has(wd)) {
            nextOpen = hours.open;
            nextOpenDay = wd;
            break;
          }
        }
      }
    } else {
      for (let i = 0; i <= 7; i++) {
        const wd = (now.weekday + i) % 7;
        if (!openDays || openDays.has(wd)) {
          nextOpen = hours.open;
          nextOpenDay = wd;
          break;
        }
      }
    }

    return {
      state: "closed",
      label: t("closedNow"),
      open: hours.open,
      close: hours.close,
      nextOpen: nextOpen,
      nextOpenText: formatNextOpen(nextOpen, nextOpenDay, now.weekday, t),
      nextOpenDay: nextOpenDay,
      todayWeekday: now.weekday
    };
  }

  window.Hours = {
    status: status,
    parseDays: parseDays,
    parseTime: parseTime,
    zonedParts: zonedParts,
    formatNextOpen: formatNextOpen,
    weekdayName: weekdayName,
    DEFAULT_TZ: DEFAULT_TZ
  };
})();
