// TypeScript wrapper for the qbc-falcon-addon native Rust module.
// The .node binary is platform-specific; we load it at runtime.
import { createRequire } from "module";
import { resolve } from "path";

const _require = createRequire(resolve(process.cwd(), "server/native/__stub__"));

// Determine the correct binary name for the current platform/arch
function getBinaryPath(): string {
  const platform = process.platform;
  const arch = process.arch;

  const map: Record<string, string> = {
    "darwin-x64": "qbc-falcon-addon.darwin-x64.node",
    "darwin-arm64": "qbc-falcon-addon.darwin-arm64.node",
    "linux-x64": "qbc-falcon-addon.linux-x64-gnu.node",
    "linux-arm64": "qbc-falcon-addon.linux-arm64-gnu.node",
  };

  const key = `${platform}-${arch}`;
  const file = map[key];
  if (!file) throw new Error(`No prebuilt qbc-falcon-addon binary for ${key}`);
  return resolve(process.cwd(), "server/native", file);
}

interface WalletResult {
  address: string;
  publicKey: string;
  secretKey: string;
}

interface TxParams {
  master_addr: string;
  secret_key: string;
  public_key: string;
  recipient: string;
  amount: number;
  fee: number;
  nonce: number;
}

interface TransferEntry {
  addr_to: string;
  amount: number;
}

interface TxResult {
  error?: string;
  master_addr: string;
  public_key: string;
  signature: string;
  transaction_hash: string;
  fee: number;
  nonce: number;
  transfers: TransferEntry[];
}

interface NativeAddon {
  generateWallet(): string;
  createTransaction(paramsJson: string): string;
}

let _addon: NativeAddon | null = null;

function loadAddon(): NativeAddon {
  if (_addon) return _addon;
  _addon = _require(getBinaryPath()) as NativeAddon;
  return _addon;
}

export function generateWallet(): WalletResult {
  const raw = loadAddon().generateWallet();
  return JSON.parse(raw) as WalletResult;
}

export function createTransaction(params: TxParams): TxResult {
  const raw = loadAddon().createTransaction(JSON.stringify(params));
  return JSON.parse(raw) as TxResult;
}
