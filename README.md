# bitcoin-js

**Roll your own Bitcoin wallets.** A small, readable toolkit for generating Bitcoin keys and addresses yourself — no hosted service, no app quietly holding your funds "for" you. You see the entropy, you see the derivation, you keep the keys.

It also mines **vanity addresses**: grind HD indexes until you get a `bc1q…` address ending in a word of your choice.

> **⚠️ Educational software.** Whoever holds the 12/24 words holds the funds — there is no support desk and no reset button. Generate anything meaningful offline, never photograph or upload your mnemonic, and prefer a hardware wallet for real amounts. Nothing here is audited.

## One seed, four address families

A single BIP39 mnemonic deterministically expands (BIP32) into an entire tree of keys. This toolkit derives the first receive address of every mainstream family from it:

| Family                        | Path (mainnet)    | Looks like |
| ----------------------------- | ----------------- | ---------- |
| Legacy (P2PKH)                | `m/44'/0'/0'/0/0` | `1…`       |
| Nested SegWit (P2SH-P2WPKH)   | `m/49'/0'/0'/0/0` | `3…`       |
| Native SegWit (P2WPKH)        | `m/84'/0'/0'/0/0` | `bc1q…`    |
| Taproot (P2TR)                | `m/86'/0'/0'/0/0` | `bc1p…`    |

On testnet the coin type flips to `1'` and addresses become `m…`/`2…`/`tb1…`.

## Install

Requires Node.js 18+.

```bash
npm install
```

## Usage

### Create a wallet

```bash
node index.js create                 # 12-word mnemonic, mainnet
node index.js create --words 24      # more entropy
node index.js create --network testnet
node index.js create --save          # also write to wallets/ (gitignored, mode 600)
```

Prints the numbered mnemonic, all four addresses with their derivation paths, the WIF private key for the SegWit key, and the public key.

### Restore from a mnemonic

```bash
node index.js restore "word1 word2 ... word12"
```

Same output — proof that the words alone fully recreate the wallet.

### Mine a vanity address

```bash
node index.js vanity cat                 # address ending in "cat"
node index.js vanity whale --no-save     # print only
node index.js vanity bc1qca --prefix     # match from the start
node index.js vanity zz --max-attempts 100000
```

```
Grinding keys ending in "cat" — expected ~1 in 32,768 keys
        41,216 keys tried (19,438/s)
Found after 41,217 keys (2.1s):

  Address   bc1q…3kcat
  Path      m/84'/0'/0'/0/41216
  ...
Saved to wallets/bc1q…3kcat.json (mode 600; wallets/ is gitignored)
```

**How the grind works (and why it's fast).** The naive approach — new mnemonic per attempt — pays a PBKDF2 cost every try (~20 keys/s). Instead this tool generates **one** mnemonic and walks the non-hardened receive chain `m/84'/0'/0'/0/i`: each candidate is one cheap HMAC plus an elliptic-curve point add — thousands of keys per second on a laptop, ~200× the naive rate — and the winner is still 100% recoverable from the saved mnemonic + index.

**Why some words are impossible.** bech32 addresses use a 32-character alphabet that deliberately omits `1`, `b`, `i`, and `o` (they're too easy to mistype for `l`, `6`, `1`, `0`). A term like `dog` could **never** match — the tool now refuses impossible terms up front instead of grinding forever. Each extra character multiplies the expected work by 32: `cat` ≈ 1 in 32,768; `whale` ≈ 1 in 33.5 million.

## Tests

```bash
npm test
```

Uses the built-in `node:test` runner. Correctness is anchored to the official BIP44 and BIP84 test vectors for the canonical `abandon … about` mnemonic, plus end-to-end vanity and storage tests.

## Project structure

```
bitcoin-js/
├── index.js            # CLI: create | restore | vanity
├── src/
│   ├── ecc.js          # shared secp256k1 / ECPair / BIP32 singletons
│   ├── wallet.js       # BIP39 -> BIP32 -> the four address families
│   ├── vanity.js       # index grinding, bech32 term validation, stats
│   └── storage.js      # wallets/ dir, 0600 JSON files
├── test/
│   ├── wallet.test.js  # official BIP44/BIP84 vectors, testnet, errors
│   └── vanity.test.js  # charset validation, e2e grind, storage perms
└── wallets/            # generated vanity wallets (gitignored, never committed)
```

## How the pieces fit

```
random entropy ──BIP39──▶ 12/24-word mnemonic ──PBKDF2──▶ 512-bit seed
seed ──BIP32──▶ HD key tree ──derive(path)──▶ private key ──secp256k1──▶ public key
public key ──hash160 / x-only + bech32──▶ address
```

Everything is deterministic after the entropy: same words, same wallets, forever. That's the whole trick of self-custody — and the whole responsibility.

## Security notes

- `wallets/` is gitignored; saved files are chmod `600` inside a `700` directory.
- The CLI prints secrets to the terminal on purpose (that's the point of DIY), so be aware of screen sharing, shell history, and scrollback.
- Dependencies: `bitcoinjs-lib`, `bip32`, `bip39`, `ecpair`, `tiny-secp256k1` — the standard, widely reviewed JavaScript Bitcoin stack.

## License

MIT — see [LICENSE](LICENSE).
