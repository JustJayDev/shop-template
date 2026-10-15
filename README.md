# Demo Sweet Shop — Template

Browse-only food shop template. English / Hindi. No cart, no ordering.

## Structure
- `index.html` — public menu page
- `404.html` — styled not-found page
- `manifest.json` — PWA manifest (installable)
- `robots.txt` / `sitemap.xml` — SEO; blocks `/admin/`, `/data/`, `/scripts/`
- `css/style.css` — design system (custom properties, asymmetric grid, dark mode, print)
- `js/i18n.js` — language toggle (en/hi)
- `js/menu.js` — fetches `data/*.json`, renders cards, filters, shop info, SW registration
- `sw.js` — offline cache (bump `CACHE` on file changes)
- `admin/` — localStorage admin panel (PIN `1234`, CRUD, export, history log)
- `data/items.json` — item data
- `data/shop.json` — shop name, WhatsApp, address, maps URL, hours, testimonials
- `data/history.json` — change history (empty array)
- `assets/` — SVG placeholder images (replace with real photos)
- `scripts/optimize-image.sh` — photo → 640×480 WebP pipeline
- `scripts/check.sh` — full project check (JS, JSON, Stylelint, Prettier, anti-slop, DOM tests)
- `tests/dom.test.js` — 33 headless interaction tests (needs jsdom)

## Data schema

### `items.json`

`id`, `shopId`, `name`, `nameHi`, `image`, `price` (number, INR), `unit`
(`pc` | `kg` | `plate`), `qty` (number), `category` (`sweet` | `snack`),
`tags` (array), `aiGenerated` (bool), `updatedAt` (ISO 8601).
Optional: `isSpecial: true` → shows in the "Today's Special" banner.

**`aiGenerated` rule**

- `false` → image is a real photograph of the actual dish.
- `true` → image was produced by an AI model.

This flag must always reflect the image source, never guessed.
All current values are placeholders until real assets are supplied.

### `shop.json`

`name`, `whatsapp` (digits only, country code first), `address`,
`mapsUrl`, `hours` (`open`, `close`, `days`), `testimonials`
(array of `{ name, text }`).

## Public page features

- Category filters (All / Sweets / Snacks), translated
- EN ↔ HI toggle for names, labels, units, and filters
- Out-of-stock items stay visible, dimmed with a label
- "Today's Special" banner (`isSpecial` + `qty > 0`)
- Customer testimonials
- Footer: shop hours, address, directions link, last-updated date, share button
- Floating WhatsApp order button (`wa.me` deep link with prefilled text)
- Skeleton loading, offline caching, dark mode, print stylesheet

## Customising for a real shop

1. Edit `data/items.json` (or use the admin panel and export).
2. Edit `data/shop.json` — replace the placeholder WhatsApp number, address,
   maps URL, hours, and testimonials.
3. Replace `assets/*.svg` placeholders with real photos
   (`bash scripts/optimize-image.sh <photo> <name>`).
4. Update `sitemap.xml` `<loc>` to the real domain.
5. Update the `og:image` meta tag in `index.html` if you add a real share image.
6. Change the admin PIN in `admin/js/admin.js` (`const PIN`).

## Admin panel

Open `admin/index.html`, enter PIN `1234`. Edits are saved to `localStorage`;
click **Export items.json** and commit the downloaded file to publish.
Every change is appended to the in-panel history log.

> **Note:** the admin panel is a client-side demo — there is no server auth.
> Do not use it for anything sensitive without adding real authentication.

## Conventions

- No inline `style` attributes (except the self-contained `404.html`).
- Items with `qty: 0` stay visible with an "Out of stock" label.
- Customers browse only — never add cart/order UI to the public page
  (the WhatsApp button is a contact link, not a checkout).
- `.env` and `backups/` are gitignored.

## Checks

```bash
bash scripts/check.sh     # everything
node tests/dom.test.js    # interaction tests only
```