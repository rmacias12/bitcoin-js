// Vanity address mining.
//
// Instead of generating a new mnemonic per attempt (one slow PBKDF2 each),
// we generate ONE mnemonic and grind the non-hardened BIP84 receive indexes
// m/84'/coin'/0'/0/i. Each try is a cheap HMAC + EC point add — thousands of
// keys per second — and the winning wallet is still fully recoverable from
// the mnemonic plus the index recorded in the result.
import * as bip39 from "bip39";
import bitcoin from "bitcoinjs-lib";
import { ECPair, bip32 } from "./ecc.js";
import { getNetwork, networkName, coinType } from "./wallet.js";

// bech32 data alphabet (BIP173): 32 chars, deliberately missing 1, b, i, o.
export const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const NEVER_ENCODED = ["1", "b", "i", "o"];

function assertEncodable(chars, original) {
  const bad = [...new Set([...chars].filter((c) => !BECH32_CHARSET.includes(c)))];
  if (bad.length) {
    throw new Error(
      `Invalid bech32 character${bad.length > 1 ? "s" : ""} in "${original}": ${bad.join(", ")}. ` +
        `bech32 addresses only use "${BECH32_CHARSET}" — never ${NEVER_ENCODED.join(", ")}.`
    );
  }
}

// Validate (and normalize) a search term before wasting any CPU on it.
// A term containing 1/b/i/o can NEVER match a bech32 address — the old
// default term "dog" would have grinded until heat death.
export function validateSearchTerm(term, { prefix = false, network = "bitcoin" } = {}) {
  const target = String(term ?? "").toLowerCase();
  if (!target) throw new Error("Search term must not be empty");

  const net = getNetwork(network);
  const hrp = net === bitcoin.networks.testnet ? "tb1" : "bc1";

  if (prefix) {
    if (!target.startsWith(hrp)) {
      throw new Error(
        `A prefix search must start with "${hrp}" (the ${networkName(net)} human-readable part)`
      );
    }
    assertEncodable(target.slice(hrp.length), target);
  } else {
    assertEncodable(target, target);
  }
  return target;
}

// Each bech32 character is 1 of 32, so every extra character multiplies the
// expected work by 32.
export function expectedAttempts(term) {
  return BECH32_CHARSET.length ** term.length;
}

export function generateVanityWallet(term, options = {}) {
  const {
    prefix = false,
    network = "bitcoin",
    maxAttempts = 0, // 0 = grind until found
    onProgress = null, // ({attempts, perSecond, expected}) called ~1x/second
  } = options;

  const target = validateSearchTerm(term, { prefix, network });
  const net = getNetwork(network);
  const coin = coinType(net);

  const mnemonic = bip39.generateMnemonic();
  const account = bip32
    .fromSeed(bip39.mnemonicToSeedSync(mnemonic), net)
    .derivePath(`m/84'/${coin}'/0'`);
  const chain = account.derive(0); // external receive chain

  const matches = prefix
    ? (address) => address.startsWith(target)
    : (address) => address.endsWith(target);

  const startedAt = Date.now();
  let nextProgressAt = startedAt + 1000;

  for (let index = 0; maxAttempts === 0 || index < maxAttempts; index++) {
    const child = chain.derive(index);
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(child.publicKey),
      network: net,
    });

    if (matches(address)) {
      const keyPair = ECPair.fromPrivateKey(child.privateKey, { network: net });
      return {
        address,
        mnemonic,
        network: networkName(net),
        path: `m/84'/${coin}'/0'/0/${index}`,
        index,
        attempts: index + 1,
        wif: keyPair.toWIF(),
        publicKey: Buffer.from(keyPair.publicKey).toString("hex"),
        elapsedMs: Date.now() - startedAt,
      };
    }

    const now = Date.now();
    if (onProgress && now >= nextProgressAt) {
      nextProgressAt = now + 1000;
      onProgress({
        attempts: index + 1,
        perSecond: Math.max(1, Math.round((index + 1) / ((now - startedAt) / 1000))),
        expected: expectedAttempts(target),
      });
    }
  }

  throw new Error(
    `No address ${prefix ? "starting" : "ending"} with "${target}" found in ${maxAttempts} attempts`
  );
}
