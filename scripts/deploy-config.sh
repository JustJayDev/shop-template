#!/bin/bash
# Regenerate sitemap.xml and robots.txt from .deploy.env SITE_URL.
# Usage: bash scripts/deploy-config.sh [https://your-domain.com]
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# CLI arg wins; otherwise read from .deploy.env
if [ -n "$1" ]; then
  SITE_URL="$1"
else
  # shellcheck disable=SC1091
  . ./.deploy.env
fi

if [ -z "$SITE_URL" ] || [ "$SITE_URL" = "https://example.com" ]; then
  echo "WARNING: SITE_URL is still the placeholder (https://example.com)."
  echo "         Pass a real domain: bash scripts/deploy-config.sh https://myshop.in"
  echo ""
fi

# strip trailing slash
SITE_URL="${SITE_URL%/}"
TODAY=$(date +%F)

cat > sitemap.xml <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
EOF

cat > robots.txt <<EOF
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /data/
Disallow: /scripts/
Disallow: /tests/

Sitemap: ${SITE_URL}/sitemap.xml
EOF

# keep .deploy.env in sync
printf '# Demo Sweet Shop — deployment config.\n# Edit this, then run: bash scripts/deploy-config.sh\n# It rewrites the domain in sitemap.xml and robots.txt.\nSITE_URL=%s\n' "$SITE_URL" > .deploy.env

# The absolute URLs in index.html must match the deployed domain, or a
# shared link renders without a preview image. Rewrite them in place.
if [ -f "$PROJECT_DIR/index.html" ]; then
  sed -i \
    -e "s|https://[A-Za-z0-9._-]*/shop-template/assets/share.png|${SITE_URL}/assets/share.png|g" \
    -e "s|https://[A-Za-z0-9._-]*/shop-template/assets/share.png|${SITE_URL}/assets/share.png|g" \
    -e "s|https://[A-Za-z0-9._-]*/shop-template/|${SITE_URL}/|g" \
    "$PROJECT_DIR/index.html"
fi

echo "✅ sitemap.xml and robots.txt updated for: $SITE_URL"
echo "   index.html absolute URLs (og:image, og:url, canonical) rewritten too."