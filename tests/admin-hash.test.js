// Guard: the admin password hash must match the real owner password.
//
// The owner's password is NOT in this repository. It is supplied to the test
// through the ADMIN_PASSWORD environment variable, the same channel the
// admin e2e suite uses. What this test protects:
//
//   1. If ADMIN_PASSWORD is set, it must open the admin panel. A mismatch
//      means the owner typed the right password and was still locked out.
//   2. The old demo password must NOT open the panel any more. If it does,
//      the "real" password was never applied and anyone can open the admin.
//   3. The plaintext password must not be written into README.md or any
//      other tracked file.
//
// Usage:
//   ADMIN_PASSWORD='your password' node tests/admin-hash.test.js

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const adminJs = fs.readFileSync(path.join(ROOT, "admin/js/admin.js"), "utf8");
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

// The demo password this template shipped with. It must be dead.
const DEMO_PASSWORD = "1234";
const DEMO_HASH = crypto.createHash("sha256").update(DEMO_PASSWORD, "utf8").digest("hex");

const hashMatch = adminJs.match(/const PASS_HASH = "([0-9a-f]{64})"/);
if (!hashMatch) {
  console.error("FAIL: could not find a 64-hex PASS_HASH in admin/js/admin.js");
  process.exit(1);
}
const storedHash = hashMatch[1];

let failed = false;
let passed = 0;

function check(name, cond, extra) {
  if (cond) {
    console.log("  PASS  " + name);
    passed++;
  } else {
    console.log("  FAIL  " + name + (extra ? " -> " + extra : ""));
    failed = true;
  }
}

console.log("=== ADMIN PASSWORD HASH SYNC ===");

// 1. The real password must open the panel.
const password = process.env.ADMIN_PASSWORD;
if (password) {
  const expectedHash = crypto.createHash("sha256").update(password, "utf8").digest("hex");
  check(
    "ADMIN_PASSWORD opens the admin panel",
    storedHash === expectedHash,
    "stored=" + storedHash.slice(0, 16) + " expected=" + expectedHash.slice(0, 16)
  );
} else {
  console.log(
    "  SKIP  ADMIN_PASSWORD not set — cannot verify the real password. " +
      "Run: ADMIN_PASSWORD='...' node tests/admin-hash.test.js"
  );
}

// 2. The demo password must be dead. This is checked unconditionally, so
//    the guard still holds on a machine that has no ADMIN_PASSWORD set.
check(
  "the old demo password no longer opens the admin panel",
  storedHash !== DEMO_HASH,
  "stored hash still matches the demo password"
);

// 3. The plaintext must not be sitting in a tracked file.
const tracked = ["README.md", "admin/index.html", "index.html", "data/shop.json"];
const leaked = tracked.filter((f) => {
  const full = path.join(ROOT, f);
  if (!fs.existsSync(full)) return false;
  return fs.readFileSync(full, "utf8").includes(password || "\u0000NEVER_MATCH\u0000");
});
check(
  "the admin password is not written in any tracked file",
  leaked.length === 0,
  "found in: " + leaked.join(", ")
);

// 4. The README must still point the owner at PASS_HASH for rotation.
check("README points at PASS_HASH for password rotation", readme.includes("PASS_HASH"));

// 5. The README must not advertise a numeric PIN any more.
const readmePin = readme.match(/`(\d{4})`/);
check(
  "README advertises no numeric PIN",
  readmePin === null,
  readmePin ? "README still names " + readmePin[1] : ""
);

console.log("");
console.log(failed ? "RESULT: FAILED" : "RESULT: PASSED (" + passed + " checks)");
process.exit(failed ? 1 : 0);
