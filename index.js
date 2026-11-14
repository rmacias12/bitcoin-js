#!/usr/bin/env node
// bitcoin-js — roll your own Bitcoin wallets.
// Commands: create | restore | vanity
import { createWallet, restoreWallet } from "./src/wallet.js";
import { generateVanityWallet, expectedAttempts, validateSearchTerm } from "./src/vanity.js";
import { saveWallet } from "./src/storage.js";

const USAGE = `bitcoin-js — roll your own Bitcoin wallets

Usage:
  node index.js create  [--words 12|24] [--network bitcoin|testnet] [--save]
  node index.js restore "<12 or 24 words>" [--network bitcoin|testnet]
  node index.js vanity  <term> [--prefix] [--network bitcoin|testnet]
                        [--max-attempts N] [--no-save]

Commands:
  create   Generate a fresh BIP39 mnemonic and derive all four address families
  restore  Re-derive every address from an existing mnemonic
  vanity   Grind BIP84 receive indexes until an address matches <term>
           (suffix by default; --prefix matches from the start)

Flags:
  --words          Mnemonic length for create (12 or 24, default 12)
  --network        bitcoin (default) or testnet
  --save           Also write the wallet into the gitignored wallets/ dir (0600)
  --no-save        For vanity: print only, don't write a file
  --prefix         Match the start of the address instead of the end
  --max-attempts   Give up the vanity grind after N keys (default: no limit)

Warning: anything printed here can spend funds if the mnemonic leaks.
Generate real wallets offline. See README.md.
`;

const ADDRESS_ORDER = [
  ["legacy", "Legacy (P2PKH)"],
  ["nestedSegwit", "Nested SegWit"],
  ["nativeSegwit", "Native SegWit"],
  ["taproot", "Taproot"],
];

function parseFlags(args) {
  const flags = { positional: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      flags.positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return flags;
}

function networkOf(flags) {
  return typeof flags.network === "string" ? flags.network : "bitcoin";
}

function printMnemonic(mnemonic) {
  const words = mnemonic.split(" ");
  console.log(`\n  Mnemonic (${words.length} words) — the ONLY backup you ever need.`);
  console.log("  Write it down in order. Anyone with these words owns the funds.\n");
  for (let i = 0; i < words.length; i += 4) {
    const cols = words
      .slice(i, i + 4)
      .map((w, j) => `${String(i + j + 1).padStart(2)}. ${w.padEnd(10)}`)
      .join("");
    console.log(`    ${cols}`);
  }
}

function printAddresses(wallet) {
  console.log("\n  Every address below comes from that one seed:\n");
  for (const [type, label] of ADDRESS_ORDER) {
    const { path, address } = wallet.addresses[type];
    console.log(`    ${label.padEnd(16)} ${path.padEnd(15)} ${address}`);
  }
  console.log(`\n    WIF (SegWit key) ${wallet.wif}`);
  console.log(`    Public key       ${wallet.publicKey}`);
  console.log(`    Network          ${wallet.network}\n`);
}

function cmdCreate(flags) {
  const words = flags.words ? Number(flags.words) : 12;
  const wallet = createWallet({ words, network: networkOf(flags) });
  printMnemonic(wallet.mnemonic);
  printAddresses(wallet);
  if (flags.save) {
    const file = saveWallet({
      address: wallet.addresses.nativeSegwit.address,
      network: wallet.network,
      mnemonic: wallet.mnemonic,
      wif: wallet.wif,
      publicKey: wallet.publicKey,
      addresses: wallet.addresses,
    });
    console.log(`  Saved to ${file} (mode 600; wallets/ is gitignored)\n`);
  }
}

function cmdRestore(flags) {
  const mnemonic = flags.positional.join(" ");
  if (!mnemonic) {
    throw new Error('Pass the mnemonic in quotes: node index.js restore "word1 word2 ..."');
  }
  const wallet = restoreWallet(mnemonic, { network: networkOf(flags) });
  printMnemonic(wallet.mnemonic);
  printAddresses(wallet);
}

function cmdVanity(flags) {
  const term = flags.positional[0];
  if (!term) throw new Error("Pass a search term: node index.js vanity cat");
  const prefix = Boolean(flags.prefix);
  const network = networkOf(flags);
  const maxAttempts = flags["max-attempts"] ? Number(flags["max-attempts"]) : 0;

  const target = validateSearchTerm(term, { prefix, network });
  const expected = expectedAttempts(target);
  console.log(
    `\n  Grinding keys ${prefix ? "starting with" : "ending in"} "${target}"` +
      ` — expected ~1 in ${expected.toLocaleString("en-US")} keys`
  );
  if (expected > 1e9) {
    console.log("  Heads up: at that odds level this can run for hours or days.");
  }

  const wallet = generateVanityWallet(term, {
    prefix,
    network,
    maxAttempts,
    onProgress: ({ attempts, perSecond }) => {
      process.stderr.write(
        `\r  ${attempts.toLocaleString("en-US").padStart(14)} keys tried (${perSecond.toLocaleString("en-US")}/s)`
      );
    },
  });
  process.stderr.write(`\r${" ".repeat(64)}\r`);

  console.log(
    `  Found after ${wallet.attempts.toLocaleString("en-US")} keys ` +
      `(${(wallet.elapsedMs / 1000).toFixed(1)}s):\n`
  );
  console.log(`    Address   ${wallet.address}`);
  console.log(`    Path      ${wallet.path}`);
  console.log(`    WIF       ${wallet.wif}`);
  console.log(`    Network   ${wallet.network}`);
  printMnemonic(wallet.mnemonic);
  console.log();

  if (!flags["no-save"]) {
    const file = saveWallet(wallet);
    console.log(`  Saved to ${file} (mode 600; wallets/ is gitignored)\n`);
  }
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  try {
    switch (command) {
      case "create":
        return cmdCreate(flags);
      case "restore":
        return cmdRestore(flags);
      case "vanity":
        return cmdVanity(flags);
      case undefined:
      case "help":
      case "--help":
      case "-h":
        console.log(USAGE);
        return;
      default:
        console.error(`Unknown command "${command}".\n`);
        console.log(USAGE);
        process.exitCode = 1;
    }
  } catch (err) {
    console.error(`\n  Error: ${err.message}\n`);
    process.exitCode = 1;
  }
}

main();
