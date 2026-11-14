// Wallet files ARE private keys — keep the directory user-only and files 0600.
// wallets/ is gitignored so results never reach version control.
import fs from "node:fs";
import path from "node:path";

export function saveWallet(wallet, { dir = "wallets" } = {}) {
  if (!wallet?.address) throw new Error("Wallet must have an address to be saved");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${wallet.address}.json`);
  const payload = { savedAt: new Date().toISOString(), ...wallet };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  return file;
}
