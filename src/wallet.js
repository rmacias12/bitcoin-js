// Core wallet logic: BIP39 mnemonic -> BIP32 seed -> HD keys -> the four
// mainstream Bitcoin address families.
import * as bip39 from "bip39";
import bitcoin from "bitcoinjs-lib";
import { ECPair, bip32, ecc } from "./ecc.js";

// BIP purpose number per address family (the first segment of the path).
export const PURPOSES = {
  legacy: 44, // P2PKH        1...
  nestedSegwit: 49, // P2SH-P2WPKH  3...
  nativeSegwit: 84, // P2WPKH       bc1q...
  taproot: 86, // P2TR         bc1p...
};

const PURPOSE_TO_TYPE = Object.fromEntries(
  Object.entries(PURPOSES).map(([type, purpose]) => [purpose, type])
);

export function getNetwork(name = "bitcoin") {
  const network = bitcoin.networks[name];
  if (!network) {
    throw new Error(`Unknown network "${name}" (expected "bitcoin" or "testnet")`);
  }
  return network;
}

export function networkName(network) {
  return network === bitcoin.networks.testnet ? "testnet" : "bitcoin";
}

// BIP44 coin type: 0 for mainnet, 1 for testnet.
export function coinType(network) {
  return network === bitcoin.networks.testnet ? 1 : 0;
}

// Standard path for one receive key: m/purpose'/coin'/account'/change/index
export function pathFor(type, { coin = 0, account = 0, change = 0, index = 0 } = {}) {
  const purpose = PURPOSES[type];
  if (!purpose) throw new Error(`Unknown address type "${type}"`);
  return `m/${purpose}'/${coin}'/${account}'/${change}/${index}`;
}

export function typeForPath(path) {
  const purpose = Number.parseInt(path.split("/")[1], 10);
  const type = PURPOSE_TO_TYPE[purpose];
  if (!type) throw new Error(`Unsupported purpose ${purpose} in path "${path}"`);
  return type;
}

// Build the payment (and thus the address) for an address family.
export function paymentForType(type, publicKey, network) {
  const pubkey = Buffer.from(publicKey);
  switch (type) {
    case "legacy":
      return bitcoin.payments.p2pkh({ pubkey, network });
    case "nestedSegwit":
      return bitcoin.payments.p2sh({
        redeem: bitcoin.payments.p2wpkh({ pubkey, network }),
        network,
      });
    case "nativeSegwit":
      return bitcoin.payments.p2wpkh({ pubkey, network });
    case "taproot": {
      // BIP86: the address commits to the *tweaked* output key, and
      // bitcoinjs-lib expects that final key — so apply the BIP341 tweak
      // ourselves: output = internal + int(TaggedHash("TapTweak", internal))·G
      const xOnly = pubkey.subarray(1, 33); // drop the parity prefix
      const tweaked = ecc.xOnlyPointAddTweak(
        xOnly,
        bitcoin.crypto.taggedHash("TapTweak", xOnly)
      );
      if (!tweaked) throw new Error("Taproot tweak failed (invalid internal key)");
      return bitcoin.payments.p2tr({ pubkey: Buffer.from(tweaked.xOnlyPubkey), network });
    }
    default:
      throw new Error(`Unknown address type "${type}"`);
  }
}

// Derive the address for any supported path straight from a mnemonic.
export function addressAt(mnemonic, path, { network = "bitcoin" } = {}) {
  const net = getNetwork(network);
  const root = bip32.fromSeed(bip39.mnemonicToSeedSync(mnemonic), net);
  const child = root.derivePath(path);
  return paymentForType(typeForPath(path), child.publicKey, net).address;
}

export function restoreWallet(mnemonic, { network = "bitcoin" } = {}) {
  const words = String(mnemonic).trim().toLowerCase().split(/\s+/);
  const normalized = words.join(" ");
  if (!bip39.validateMnemonic(normalized)) {
    throw new Error("Invalid mnemonic: wrong words, wrong length, or bad checksum");
  }

  const net = getNetwork(network);
  const coin = coinType(net);
  const root = bip32.fromSeed(bip39.mnemonicToSeedSync(normalized), net);

  const addresses = {};
  for (const type of Object.keys(PURPOSES)) {
    const path = pathFor(type, { coin });
    const { publicKey } = root.derivePath(path);
    addresses[type] = { path, address: paymentForType(type, publicKey, net).address };
  }

  // The WIF we surface is the native SegWit key — what modern wallets sweep.
  const segwitKey = ECPair.fromPrivateKey(
    root.derivePath(pathFor("nativeSegwit", { coin })).privateKey,
    { network: net }
  );

  return {
    mnemonic: normalized,
    network: networkName(net),
    wordCount: words.length,
    addresses,
    wif: segwitKey.toWIF(),
    publicKey: Buffer.from(segwitKey.publicKey).toString("hex"),
  };
}

export function createWallet({ words = 12, network = "bitcoin" } = {}) {
  if (words !== 12 && words !== 24) throw new Error("Word count must be 12 or 24");
  return restoreWallet(bip39.generateMnemonic(words === 24 ? 256 : 128), { network });
}
