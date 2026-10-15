#!/bin/bash
# Image optimization pipeline for Demo Sweet Shop.
# Converts a source photo to WebP at 640x480, drops it into assets/.
# Usage: bash scripts/optimize-image.sh <input_image> [output_name]
# Requires: cwebp (apt install webp) and ImageMagick (apt install imagemagick)

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <input_image> [output_name]"
  echo "Example: $0 photos/rasgulla.jpg rasgulla"
  exit 1
fi

INPUT="$1"
BASENAME=$(basename "$INPUT")
NAME="${2:-${BASENAME%.*}}"
OUTPUT="assets/${NAME}.webp"

if ! command -v cwebp &>/dev/null; then
  echo "ERROR: cwebp not found. Install with: apt install webp"
  exit 1
fi

if ! command -v convert &>/dev/null; then
  echo "ERROR: ImageMagick not found. Install with: apt install imagemagick"
  exit 1
fi

if [ ! -f "$INPUT" ]; then
  echo "ERROR: File not found: $INPUT"
  exit 1
fi

echo "Processing: $INPUT → $OUTPUT"

# Resize to 640x480 (cover), then convert to WebP quality 80
convert "$INPUT" -resize 640x480^ -gravity center -extent 640x480 -strip "/tmp/${NAME}_resized.jpg"
cwebp -q 80 "/tmp/${NAME}_resized.jpg" -o "$OUTPUT"
rm -f "/tmp/${NAME}_resized.jpg"

SIZE=$(stat -c%s "$OUTPUT" 2>/dev/null || stat -f%z "$OUTPUT")
echo "✅ Done: $OUTPUT (${SIZE} bytes)"
echo "   Update data/items.json → \"image\": \"$OUTPUT\""