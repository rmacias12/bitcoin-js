import test from "node:test";
import assert from "node:assert/strict";
import { createWallet, restoreWallet, addressAt } from "../src/wallet.js";

// The canonical BIP39 test mnemonic ("abandon" x11 + "about").
const VECTOR_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

test("restoreWallet reproduces the official BIP44 vector address", () => {
  const wallet = restoreWallet(VECTOR_MNEMONIC);
  assert.equal(wallet.addresses.legacy.path, "m/44'/0'/0'/0/0");
  assert.equal(wallet.addresses.legacy.address, "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA");
});

test("restoreWallet reproduces the official BIP84 vector address", () => {
  const wallet = restoreWallet(VECTOR_MNEMONIC);
  assert.equal(
    wallet.addresses.nativeSegwit.address,
    "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"
  );
});

test("restoreWallet reproduces the official BIP49 and BIP86 vector addresses", () => {
  const wallet = restoreWallet(VECTOR_MNEMONIC);
  assert.equal(wallet.addresses.nestedSegwit.address, "37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf");
  assert.equal(
    wallet.addresses.taproot.address,
    "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr"
  );
});

test("createWallet makes valid 12- and 24-word wallets that restore cleanly", () => {
  const w12 = createWallet();
  const w24 = createWallet({ words: 24 });
  assert.equal(w12.mnemonic.split(" ").length, 12);
  assert.equal(w24.mnemonic.split(" ").length, 24);
  assert.deepEqual(restoreWallet(w12.mnemonic).addresses, w12.addresses);
});

test("testnet wallets use testnet encodings", () => {
  const wallet = createWallet({ network: "testnet" });
  assert.equal(wallet.network, "testnet");
  assert.match(wallet.addresses.nativeSegwit.address, /^tb1q/);
  assert.match(wallet.addresses.legacy.address, /^[mn]/);
  assert.match(wallet.wif, /^c/); // compressed testnet WIF
});

test("restoreWallet rejects invalid mnemonics", () => {
  assert.throws(() => restoreWallet("not a real mnemonic phrase at all nope"), /Invalid mnemonic/);
  assert.throws(() => restoreWallet(""), /Invalid mnemonic/);
});

test("createWallet rejects silly word counts", () => {
  assert.throws(() => createWallet({ words: 13 }), /12 or 24/);
});

test("addressAt derives any supported path, and rejects unknown purposes", () => {
  assert.equal(
    addressAt(VECTOR_MNEMONIC, "m/84'/0'/0'/0/0"),
    "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"
  );
  assert.notEqual(
    addressAt(VECTOR_MNEMONIC, "m/84'/0'/0'/0/0"),
    addressAt(VECTOR_MNEMONIC, "m/84'/0'/0'/0/1")
  );
  assert.throws(() => addressAt(VECTOR_MNEMONIC, "m/45'/0'/0'/0/0"), /Unsupported purpose/);
});
