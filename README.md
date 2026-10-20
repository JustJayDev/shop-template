# Demo Sweet Shop — Template

Installable bilingual food-shop app. English / Hindi. Local cart, WhatsApp
order handoff.

> **What this is.** A PWA shell with a menu, a persistent local cart, and an
> order handoff that opens WhatsApp with a prefilled message. The customer
> sends the message and the shop confirms.
>
> **What this is not.** There is no payment gateway, no server-side order
> database, no account system, and no stock reservation. The cart lives in the
> visitor's own browser and dies when they clear it. Say "Send order on
> WhatsApp" in your copy — never "checkout".

## Structure

- `index.html` — the app shell (four hash routes: menu / cart / visit / more)
- `404.html` — styled not-found page
- `manifest.json` — PWA manifest (standalone, installable, shortcuts)
- `robots.txt` / `sitemap.xml` — SEO; blocks `/admin/`, `/data/`, `/scripts/`
- `css/style.css` — design system (custom properties, dark mode, motion tokens)
- `js/app.js` — routing, rendering, item sheet, toasts, install prompt
- `js/i18n.js` — language toggle (en/hi) and the translation dictionary
- `js/cart.js` — cart storage, quantity rules, WhatsApp message builder
- `js/hours.js` — open/closed logic in the shop's own timezone
- `sw.js` — offline cache (version is injected by `scripts/build-sw.sh`)
- `admin/` — localStorage admin panel (SHA-256 gate, CRUD, export, history)
- `data/items.json` — item data
- `data/shop.json` — shop name, WhatsApp, address, maps URL, hours, timezone
- `data/history.json` — change history (empty array)
- `assets/` — SVG placeholder images + generated PWA icons (replace the SVG art)
- `scripts/optimize-image.sh` — photo → 640×480 WebP pipeline
- `scripts/build-sw.sh` — injects a content hash into `sw.js`
- `scripts/check.sh` — full project check (JS, JSON, Stylelint, Prettier,
  anti-slop, DOM tests, service-worker drift)
- `tests/app-dom.test.js` — 131 headless interaction assertions
- `tests/app-modules.test.js` — 120 headless module assertions
- `tests/i18n-parity.test.js` — EN/HI dictionary parity
- `tests/admin.test.js` — admin e2e (needs `ADMIN_PASSWORD`)
- `tests/admin-hash.test.js` — the admin gate hash matches the real password,
  and the demo password is dead
- `tests/css-contract.test.js` — static CSS contract (tap targets, motion tokens,
  image sizing, shell alignment, heading levels, deploy URLs, service-worker drift)

## Data schema

### `items.json`

`id`, `shopId`, `name`, `nameHi`, `image`, `price` (number, INR), `unit`
(`pc` | `kg` | `plate`), `qty` (number), `category` (`sweet` | `snack`),
`tags` (array), `aiGenerated` (bool), `updatedAt` (ISO 8601).

Optional:

- `isSpecial: true` → shows in the "Today's Special" banner.
- `veg: true` → green veg marker. `veg: false` → red non-veg marker.
  Omit the key entirely for "not marked". The admin editor writes the key
  only when a diet is explicitly chosen, so "Not marked" removes it.

**`aiGenerated` rule**

- `false` → image is a real photograph of the actual dish.
- `true` → image was produced by an AI model.

This flag must always reflect the image source, never guessed.
All current values are placeholders until real assets are supplied.

**`veg` rule**

Only mark a dish when its vegetarian status is certain. `samosa` alone does
not tell you whether it is the potato or the keema variety, so an unmarked
item is safer than a wrong label. The bundled demo items mark only the
dishes whose composition is unambiguous.

### `shop.json`

`name`, `nameHi`, `whatsapp` (digits only, country code first), `address`,
`mapsUrl`, `timezone` (IANA name, e.g. `Asia/Kolkata`), `hours` (`open`,
`close`, `days`), `testimonials` (array of `{ name, text }`).

`timezone` decides when "Open now" is true. The shop's hours are evaluated in
the shop's own timezone, not the visitor's — a customer in Dubai looking at a
Delhi sweet shop still sees Delhi's opening hours. The admin panel validates
the value and refuses a bad zone name.

## App features

### Menu view

- Search across names in both languages
- Category filters (All / Sweets / Snacks)
- Out-of-stock items stay visible, dimmed with a label
- "Today's Special" banner (`isSpecial` + `qty > 0`)
- Optional veg / non-veg marker per the Indian convention
- Tap a card for a detail sheet with quantity stepper

### Cart view

- Persists across reloads and app restarts (`localStorage`, key `shop_cart_v1`)
- Stores **item IDs and quantities only** — never prices. Prices are
  recalculated from the current menu on every render, so a stale cart can
  never charge an old price.
- Quantity is capped at the item's live stock, and at 99
- "Send order on WhatsApp" builds a prefilled, language-aware message
  asking the shop to confirm availability and readiness

### Visit view

- Shop hours with the live open/closed state
- Address, directions link, copy address
- Click-to-call and WhatsApp the shop (both use the WhatsApp number)
- Share button

### More view

- How ordering works, customer testimonials, install prompt, offline status

The language toggle lives in the app header, not the More view — it has to be
reachable from every tab without switching views first.

### Cross-cutting

- EN ↔ HI toggle for names, labels, units, filters, and the cart
- Toast feedback and haptics on add-to-cart
- Offline caching with a content-derived cache version
- Dark mode, reduced-motion support, 44px minimum tap targets

## Customising for a real shop

1. Edit `data/items.json` (or use the admin panel and export).
2. Edit `data/shop.json` — replace the placeholder WhatsApp number, address,
   maps URL, hours, timezone, and testimonials.
3. Replace `assets/*.svg` placeholders with real photos
   (`bash scripts/optimize-image.sh <photo> <name>`).
4. Update `sitemap.xml` `<loc>` to the real domain.
5. Update the `og:image` meta tag in `index.html` if you add a real share image.
6. Update the manifest `"id"` and `start_url` if you deploy under a subpath.
7. Change the admin password in `admin/js/admin.js` (`const PASS_HASH`) —
   see the comment there for the one-liner that generates the hash.
8. Re-run `bash scripts/build-sw.sh` after changing any precached file.

## Admin panel

Open `admin/index.html` and enter the admin password. The password is stored
as a SHA-256 hash in `admin/js/admin.js` (`const PASS_HASH`) — the plaintext is
**not** in this repository, and it is not written here either. Keep it in your
password manager.

To rotate the password, generate a new hash and paste it in:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('YOUR_NEW_PASSWORD','utf8').digest('hex'))"
```

Then run the guard with the new password so the suite verifies it:

```bash
ADMIN_PASSWORD='YOUR_NEW_PASSWORD' node tests/admin-hash.test.js
```

`tests/admin-hash.test.js` asserts three things: your password opens the
panel, the old demo password no longer does, and the plaintext has not
leaked into any tracked file.

Edits are saved to `localStorage`; click **Export items.json** and commit the
downloaded file to publish.

> **Note:** the admin panel is a client-side demo — the gate is a local hash
> check, not server authentication, and the data lives in the browser of the
> person who edits it. Do not use it for anything sensitive without adding
> real authentication and a real backend.

## Conventions

- No inline `style` attributes (except the self-contained `404.html`).
- Items with `qty: 0` stay visible with an "Out of stock" label.
- The cart is local-only and the handoff is a WhatsApp message. Do not
  describe it as a checkout, a payment flow, or a reservation system.
- `.env` and `backups/` are gitignored.

## Checks

```bash
bash scripts/check.sh              # everything
node tests/app-dom.test.js         # app interaction tests
node tests/app-modules.test.js     # cart / hours / whatsapp module tests
node --test tests/i18n-parity.test.js
ADMIN_PASSWORD=yourpass node tests/admin.test.js
node tests/admin-hash.test.js      # admin gate hash matches the real password
node tests/css-contract.test.js    # static CSS contract
```

`scripts/check.sh` also rebuilds the service-worker version and fails if it
had drifted, so a stale cache never ships silently.

## Deploying

The site is a static bundle — any static host works. For GitHub Pages:

```bash
# 1. point the deploy config at the real domain (rewrites sitemap.xml,
#    robots.txt and the absolute URLs in index.html)
bash scripts/deploy-config.sh https://your-domain.com

# 2. rebuild the service-worker cache name for the new content
bash scripts/build-sw.sh

# 3. run the full check — it must be green before you publish
ADMIN_PASSWORD='your password' bash scripts/check.sh

# 4. publish
git add -A && git commit -m "deploy: update site" && git push origin master
```

`scripts/deploy-config.sh` also writes `.deploy.env`, which holds the
`SITE_URL` used by the deploy-URL contract checks. It is tracked on purpose —
it contains no secrets, only the public domain.