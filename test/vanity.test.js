import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  generateVanityWallet,
  validateSearchTerm,
  expectedAttempts,
} from "../src/vanity.js";
import { addressAt } from "../src/wallet.js";
import { saveWallet } from "../src/storage.js";

test("validateSearchTerm rejects characters bech32 cannot encode", () => {
  // 1, b, i, o never appear in bech32 data — the old default term "dog"
  // could never match and would grind forever.
  for (const bad of ["dog", "bit", "1ove", "moon"]) {
    assert.throws(() => validateSearchTerm(bad), /Invalid bech32 character/);
  }
  assert.throws(() => validateSearchTerm(""), /must not be empty/);
});

test("validateSearchTerm accepts encodable terms and normalizes case", () => {
  assert.equal(validateSearchTerm("CAT"), "cat");
  assert.equal(validateSearchTerm("whale"), "whale");
});

test("prefix terms must start with the human-readable part", () => {
  assert.throws(() => validateSearchTerm("cat", { prefix: true }), /must start with "bc1"/);
  assert.equal(validateSearchTerm("bc1qca", { prefix: true }), "bc1qca");
  assert.equal(
    validateSearchTerm("tb1qca", { prefix: true, network: "testnet" }),
    "tb1qca"
  );
});

test("expectedAttempts grows as 32^len", () => {
  assert.equal(expectedAttempts("a"), 32);
  assert.equal(expectedAttempts("cat"), 32 ** 3);
});

test("generateVanityWallet finds a matching, fully recoverable wallet", () => {
  const wallet = generateVanityWallet("a", { maxAttempts: 5000 }); // 1-in-32 odds
  assert.match(wallet.address, /^bc1q/);
  assert.ok(wallet.address.endsWith("a"));
  assert.ok(wallet.attempts >= 1 && wallet.attempts <= 5000);
  // The recorded mnemonic + path must reproduce the exact winning address.
  assert.equal(addressAt(wallet.mnemonic, wallet.path), wallet.address);
});

test("generateVanityWallet respects maxAttempts", () => {
  // 6 chars = ~1 in a billion; 500 attempts must give up cleanly.
  assert.throws(
    () => generateVanityWallet("zzzzzz", { maxAttempts: 500 }),
    /No address ending with "zzzzzz" found in 500 attempts/
  );
});

test("saveWallet writes a 0600 JSON file that round-trips", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bitcoin-js-"));
  const file = saveWallet({ address: "bc1qtest", mnemonic: "m", wif: "w" }, { dir });
  assert.equal(file, path.join(dir, "bc1qtest.json"));
  const loaded = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(loaded.address, "bc1qtest");
  assert.ok(loaded.savedAt);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test("saveWallet refuses anonymous wallets", () => {
  assert.throws(() => saveWallet({}), /must have an address/);
});
