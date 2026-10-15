#!/bin/bash
# Full project check — run before every commit.
# Usage: bash scripts/check.sh
set -e

LINT_TOOLS="/root/lint-tools"
STYLELINT="$LINT_TOOLS/node_modules/.bin/stylelint"
PRETTIER="$LINT_TOOLS/node_modules/.bin/prettier"
STYLELINT_CONFIG="$LINT_TOOLS/.stylelintrc.json"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$PROJECT_DIR"
PASS=0
FAIL=0

echo "╔══════════════════════════════════════╗"
echo "║   PROJECT CHECK                      ║"
echo "╚══════════════════════════════════════╝"

# 1. JS syntax
echo "▶ Checking JS syntax..."
for f in js/*.js sw.js admin/js/*.js; do
  if node --check "$f" 2>/dev/null; then
    echo "  ✅ $f"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $f — syntax error"
    FAIL=$((FAIL + 1))
  fi
done

# 2. JSON validity
echo "▶ Checking JSON files..."
for f in data/*.json manifest.json; do
  if python3 -c "import json; json.load(open('$f'))" 2>/dev/null; then
    echo "  ✅ $f"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $f — invalid JSON"
    FAIL=$((FAIL + 1))
  fi
done

# 3. Stylelint
echo "▶ Running Stylelint..."
if [ -f "$STYLELINT" ]; then
  if "$STYLELINT" "$PROJECT_DIR/**/*.css" --config "$STYLELINT_CONFIG" 2>&1; then
    echo "  ✅ Stylelint passed"
    PASS=$((PASS + 1))
  else
    echo "  ❌ Stylelint errors found"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ⏭️  Stylelint not found at $STYLELINT"
fi

# 4. Prettier
echo "▶ Running Prettier check..."
if [ -f "$PRETTIER" ]; then
  if "$PRETTIER" --check "$PROJECT_DIR/**/*.css" "$PROJECT_DIR/**/*.html" "$PROJECT_DIR/js/*.js" 2>&1; then
    echo "  ✅ Prettier passed"
    PASS=$((PASS + 1))
  else
    echo "  ⚠️  Prettier formatting issues (run: $PRETTIER --write)"
  fi
else
  echo "  ⏭️  Prettier not found at $PRETTIER"
fi

# 5. Anti-slop grep checks
echo "▶ Anti-slop pattern checks..."
BANNED=$(grep -rn --include="*.css" --include="*.html" --include="*.js" \
  -E '(#667eea|#764ba2|#7F00FF|#E100FF)' "$PROJECT_DIR" 2>/dev/null || true)
if [ -n "$BANNED" ]; then
  echo "  ❌ Banned gradient found"
  FAIL=$((FAIL + 1))
else
  echo "  ✅ No banned gradients"
  PASS=$((PASS + 1))
fi

INLINE=$(grep -rn --include="*.html" 'style="' "$PROJECT_DIR" 2>/dev/null | grep -v '404.html' | wc -l)
if [ "$INLINE" -gt 0 ]; then
  echo "  ❌ $INLINE inline style attributes found"
  FAIL=$((FAIL + 1))
else
  echo "  ✅ No inline styles"
  PASS=$((PASS + 1))
fi

# 6. Headless DOM interaction tests
echo "▶ Running DOM interaction tests..."
if [ -d "$LINT_TOOLS/node_modules/jsdom" ]; then
  DOM_FAIL=0
  for t in tests/dom.test.js tests/regression.test.js; do
    if [ -f "$PROJECT_DIR/$t" ]; then
      if (cd "$LINT_TOOLS" && node "$PROJECT_DIR/$t" > /tmp/domtest.out 2>&1); then
        echo "  ✅ $t — $(grep -o 'RESULTS: [0-9]* passed, [0-9]* failed' /tmp/domtest.out | tail -1)"
      else
        echo "  ❌ $t failed:"
        tail -20 /tmp/domtest.out
        DOM_FAIL=1
      fi
    fi
  done

  # Admin e2e needs the real password, supplied out-of-band.
  if [ -f "$PROJECT_DIR/tests/admin.test.js" ] && [ -n "$ADMIN_PASSWORD" ]; then
    if (cd "$LINT_TOOLS" && ADMIN_PASSWORD="$ADMIN_PASSWORD" node "$PROJECT_DIR/tests/admin.test.js" > /tmp/admintest.out 2>&1); then
      echo "  ✅ tests/admin.test.js — $(grep -o 'RESULTS: [0-9]* passed, [0-9]* failed' /tmp/admintest.out | tail -1)"
    else
      echo "  ❌ tests/admin.test.js failed:"
      tail -20 /tmp/admintest.out
      DOM_FAIL=1
    fi
  else
    echo "  ⏭️  tests/admin.test.js skipped (set ADMIN_PASSWORD to run)"
  fi

  if [ "$DOM_FAIL" -eq 0 ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ⏭️  DOM tests skipped (jsdom not installed)"
fi

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   RESULTS: $PASS passed, $FAIL failed"
echo "╚══════════════════════════════════════╝"

if [ "$FAIL" -gt 0 ]; then
  echo "🚫 DO NOT COMMIT."
  exit 1
else
  echo "✅ All checks passed. Ship it."
  exit 0
fi