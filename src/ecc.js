// Shared crypto primitives — initialize the secp256k1 backend exactly once.
import { ECPairFactory } from "ecpair";
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";
import bitcoin from "bitcoinjs-lib";

// Required by bitcoinjs-lib for Taproot (p2tr) key tweaking.
bitcoin.initEccLib(ecc);

export const ECPair = ECPairFactory(ecc);
export const bip32 = BIP32Factory(ecc);
export { ecc };
