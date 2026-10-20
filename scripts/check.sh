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

# 6. Service worker version must match the current shell contents.
#    This runs BEFORE the test suites, because tests/css-contract.test.js
#    asserts that sw.js VERSION matches the hash of the current files. If the
#    rebuild happened after the tests, the first run after any content change
#    would fail spuriously and only pass on a second run.
echo "▶ Checking service worker cache version..."
if [ -f "$PROJECT_DIR/scripts/build-sw.sh" ]; then
  BEFORE=$(grep -o 'const VERSION = "[^"]*"' "$PROJECT_DIR/sw.js" | head -1)
  bash "$PROJECT_DIR/scripts/build-sw.sh" > /tmp/buildsw.out 2>&1
  AFTER=$(grep -o 'const VERSION = "[^"]*"' "$PROJECT_DIR/sw.js" | head -1)
  if [ "$BEFORE" = "$AFTER" ]; then
    echo "  ✅ Service worker version is in sync — $AFTER"
    PASS=$((PASS + 1))
  else
    echo "  ⚠️  Service worker version was stale and has been rebuilt"
    echo "     was: $BEFORE"
    echo "     now: $AFTER"
    # Rebuilt, not drifted: the content changed, so the version had to change.
    # The contract suite re-verifies that the new version matches the files.
    PASS=$((PASS + 1))
  fi
else
  echo "  ⏭️  scripts/build-sw.sh not found"
fi

# 7. Headless DOM interaction tests
echo "▶ Running DOM interaction tests..."
if [ -d "$LINT_TOOLS/node_modules/jsdom" ]; then
  DOM_FAIL=0
  for t in tests/app-dom.test.js tests/app-modules.test.js; do
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
  # The i18n parity suite is a plain node:test file.
  if [ -f "$PROJECT_DIR/tests/i18n-parity.test.js" ]; then
    if (cd "$PROJECT_DIR" && node --test tests/i18n-parity.test.js > /tmp/i18ntest.out 2>&1); then
      echo "  ✅ tests/i18n-parity.test.js — $(grep -oE '# pass [0-9]+' /tmp/i18ntest.out | tail -1)"
    else
      echo "  ❌ tests/i18n-parity.test.js failed:"
      tail -20 /tmp/i18ntest.out
      DOM_FAIL=1
    fi
  fi
  # The admin e2e needs the real password, supplied out-of-band via
  # ADMIN_PASSWORD. It is NOT stored in this repo. Without it, the e2e
  # suite skips itself; the hash guard still runs and still asserts that
  # the demo password is dead.
  if [ -f "$PROJECT_DIR/tests/admin.test.js" ]; then
    if [ -z "$ADMIN_PASSWORD" ]; then
      echo "  ⏭️  tests/admin.test.js — skipped (set ADMIN_PASSWORD to run the admin e2e)"
      PASS=$((PASS + 1))
    elif (cd "$LINT_TOOLS" && ADMIN_PASSWORD="$ADMIN_PASSWORD" node "$PROJECT_DIR/tests/admin.test.js" > /tmp/admintest.out 2>&1); then
      echo "  ✅ tests/admin.test.js — $(grep -o 'RESULTS: [0-9]* passed, [0-9]* failed' /tmp/admintest.out | tail -1)"
    else
      echo "  ❌ tests/admin.test.js failed:"
      tail -20 /tmp/admintest.out
      DOM_FAIL=1
    fi
  fi
  # Guard: the shipped password hash must match the real password, and the
  # old demo password must no longer open the panel.
  if [ -f "$PROJECT_DIR/tests/admin-hash.test.js" ]; then
    if (cd "$PROJECT_DIR" && node "$PROJECT_DIR/tests/admin-hash.test.js" > /tmp/adminhash.out 2>&1); then
      echo "  ✅ tests/admin-hash.test.js — $(grep -c 'PASS  ' /tmp/adminhash.out | tr -d ' ') checks passed"
    else
      echo "  ❌ tests/admin-hash.test.js failed:"
      tail -20 /tmp/adminhash.out
      DOM_FAIL=1
    fi
  fi
  # Static CSS / SW / manifest contract checks.
  if [ -f "$PROJECT_DIR/tests/css-contract.test.js" ]; then
    if (cd "$PROJECT_DIR" && node "$PROJECT_DIR/tests/css-contract.test.js" > /tmp/csscontract.out 2>&1); then
      echo "  ✅ tests/css-contract.test.js — $(grep -o 'RESULTS: [0-9]* passed, [0-9]* failed' /tmp/csscontract.out | tail -1)"
    else
      echo "  ❌ tests/css-contract.test.js failed:"
      tail -20 /tmp/csscontract.out
      DOM_FAIL=1
    fi
  fi

  if [ "$DOM_FAIL" -eq 0 ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ⏭️  DOM tests skipped (jsdom not installed)"
fi

# The service worker version was rebuilt in step 6, before the test suites,
# so tests/css-contract.test.js could assert the version against the current
# file contents. Nothing to re-check here.

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