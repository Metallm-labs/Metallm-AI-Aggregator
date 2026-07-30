// ============================================================
// QBitcoin (QBC) Payment Integration
// Falcon-512 post-quantum cryptography via Rust native addon
// ============================================================
import crypto from "crypto";
import { createRequire } from "module";
import { resolve } from "path";
import { db } from "../../db";
import { users, qbcWallets, qbcDeposits, creditTransactions } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import * as logger from "../../logger";
import { sendEmail } from "../auth/email";

// ============================================================
// Native Rust addon bootstrap (inline — avoids ESM/CJS boundary issues)
// ============================================================
const _require = createRequire(resolve(process.cwd(), "server/native/__stub__"));

interface WalletResult { address: string; publicKey: string; secretKey: string; }
interface TxParams { master_addr: string; secret_key: string; public_key: string; recipient: string; amount: number; fee: number; nonce: number; }
interface TransferEntry { addr_to: string; amount: number; }
interface TxResult { error?: string; master_addr: string; public_key: string; signature: string; transaction_hash: string; fee: number; nonce: number; transfers: TransferEntry[]; }
interface NativeAddon { generateWallet(): string; createTransaction(p: string): string; }

let _addon: NativeAddon | null = null;
function loadAddon(): NativeAddon {
  if (_addon) return _addon;
  const platform = process.platform;
  const arch = process.arch;
  const map: Record<string, string> = {
    "darwin-x64":   "qbc-falcon-addon.darwin-x64.node",
    "darwin-arm64": "qbc-falcon-addon.darwin-arm64.node",
    "linux-x64":    "qbc-falcon-addon.linux-x64-gnu.node",
    "linux-arm64":  "qbc-falcon-addon.linux-arm64-gnu.node",
  };
  const file = map[`${platform}-${arch}`];
  if (!file) throw new Error(`No prebuilt qbc-falcon-addon binary for ${platform}-${arch}`);
  _addon = _require(resolve(process.cwd(), "server/native", file)) as NativeAddon;
  return _addon;
}

// ============================================================
// Correct QBC address derivation (must match QBC node validation)
//
// Algorithm:
//   1. SHA-256(pk)                         → 32 bytes
//   2. RIPEMD-160(step1)                   → 20 bytes
//   3. versioned = [0x01] + step2          → 21 bytes
//   4. checksum = SHA256(SHA256(step3))[:4] → 4 bytes
//   5. address = "Q" + hex(step3 + step4)  → 25 bytes / 50 hex chars
//
// NOTE: The prebuilt Rust addon uses a different algorithm (double SHA-256).
// This Node.js implementation is the authoritative version — it overrides
// whatever address the Rust addon returns.
// ============================================================
function deriveQbcAddress(pkHex: string): string {
  const pk = Buffer.from(pkHex, "hex");
  const sha256Hash = crypto.createHash("sha256").update(pk).digest();
  const ripemd160Hash = crypto.createHash("ripemd160").update(sha256Hash).digest();
  const versioned = Buffer.concat([Buffer.from([0x01]), ripemd160Hash]); // 21 bytes
  const checksum = crypto
    .createHash("sha256")
    .update(crypto.createHash("sha256").update(versioned).digest())
    .digest()
    .subarray(0, 4);
  return "Q" + Buffer.concat([versioned, checksum]).toString("hex");
}

function generateWallet(): WalletResult {
  const result = JSON.parse(loadAddon().generateWallet()) as WalletResult;
  // Override the address: Rust addon uses the old double-SHA256 algorithm.
  // Always recompute using the correct RIPEMD-160 algorithm so the QBC node
  // validates the address-to-public-key relationship correctly.
  result.address = deriveQbcAddress(result.publicKey);
  return result;
}
function createTransaction(params: TxParams): TxResult { return JSON.parse(loadAddon().createTransaction(JSON.stringify(params))); }

// ============================================================
// Configuration
// ============================================================
const QBC_NODE_URL = (process.env.QBC_NODE_URL || "").replace(/\/$/, "");
const MAIN_WALLET = process.env.MAIN_WALLET_ADDRESS;
const ENCRYPTION_KEY = process.env.QBC_WALLET_ENCRYPTION_KEY; // must be 64 hex chars (32 bytes)

if (!MAIN_WALLET) {
  logger.warn("qbitcoin", "MAIN_WALLET_ADDRESS env variable is not set — forwarding disabled");
}
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  logger.warn("qbitcoin", "QBC_WALLET_ENCRYPTION_KEY must be 64 hex chars — wallet operations disabled");
}

// 1 QBC = 1,000,000,000 shor (like Quantum Resistant Ledger)
export const SHOR_PER_QBC = 1_000_000_000;
// Default network fee per transaction
export const FEE_SHOR = 1_000_000; // 0.001 QBC
// Minimum deposit in USD
export const MIN_DEPOSIT_USD = 15;
// Required confirmations before crediting
export const REQUIRED_CONFIRMATIONS = 3;
// 1 USD = 1 credit
const CREDIT_RATIO = 1;

// ============================================================
// Encryption helpers (AES-256-GCM)
// ============================================================
function encryptSecretKey(hexKey: string): string {
  if (!ENCRYPTION_KEY) throw new Error("QBC_WALLET_ENCRYPTION_KEY is not configured");
  const keyBuf = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf, iv);
  const encrypted = Buffer.concat([cipher.update(hexKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv(24 hex) + tag(32 hex) + ciphertext
  return iv.toString("hex") + tag.toString("hex") + encrypted.toString("hex");
}

function decryptSecretKey(stored: string): string {
  if (!ENCRYPTION_KEY) throw new Error("QBC_WALLET_ENCRYPTION_KEY is not configured");
  const keyBuf = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = Buffer.from(stored.slice(0, 24), "hex");
  const tag = Buffer.from(stored.slice(24, 56), "hex");
  const ciphertext = Buffer.from(stored.slice(56), "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

// ============================================================
// Price feed — Fixed QBC/USD price
// (Exbitron live feed commented out below)
// ============================================================
// Fixed price: 1 QBC = $0.0001 USD
const FIXED_QBC_USD_PRICE = 0.0001;

export async function getQbcUsdPrice(): Promise<number> {
  logger.info("qbitcoin", `QBC price (fixed): $${FIXED_QBC_USD_PRICE}`);
  return FIXED_QBC_USD_PRICE;
}

// ============================================================
// [COMMENTED OUT] Exbitron live price feed — re-enable when needed
// ============================================================
// let _cachedPrice: { price: number; fetchedAt: number } | null = null;
// const PRICE_TTL_MS = 60_000; // 1 minute cache
//
// export async function getQbcUsdPrice(): Promise<number> {
//   const now = Date.now();
//   if (_cachedPrice && now - _cachedPrice.fetchedAt < PRICE_TTL_MS) {
//     return _cachedPrice.price;
//   }
//   try {
//     const res = await fetch("https://api.exbitron.com/api/v1/cg/tickers", {
//       signal: AbortSignal.timeout(8000),
//     });
//     if (!res.ok) throw new Error(`Exbitron HTTP ${res.status}`);
//     const tickers: Array<{ ticker_id: string; last_price: string }> = await res.json();
//     const qbc = tickers.find((t) => t.ticker_id === "QBC-USDT");
//     if (!qbc || !qbc.last_price) throw new Error("QBC-USDT ticker not found");
//     const price = parseFloat(qbc.last_price);
//     if (!isFinite(price) || price <= 0) throw new Error(`Bad QBC price: ${qbc.last_price}`);
//     _cachedPrice = { price, fetchedAt: now };
//     logger.info("qbitcoin", `QBC price: $${price}`);
//     return price;
//   } catch (err) {
//     logger.error("qbitcoin", "Failed to fetch QBC price from Exbitron", err);
//     if (_cachedPrice) return _cachedPrice.price;
//     // NOTE: no fallback — remove comment block and use this function to re-enable live pricing
//   }
// }

// ============================================================
// QBC Node API helpers
// ============================================================
async function qbcGet<T>(path: string): Promise<T> {
  const url = `${QBC_NODE_URL}/api/${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`QBC node error: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export interface QbcBalanceResponse {
  balance?: number | string;
  error?: string;
}

export async function getQbcBalance(address: string): Promise<bigint> {
  try {
    const data = await qbcGet<QbcBalanceResponse>(`GetBalance?address=${encodeURIComponent(address)}`);
    if (data.error) throw new Error(data.error);
    // balance is in shor
    return BigInt(data.balance ?? 0);
  } catch (err) {
    logger.error("qbitcoin", `getQbcBalance(${address}) failed`, String(err));
    return 0n;
  }
}

export interface QbcTx {
  tx_hash: string;
  master_addr?: string;
  confirmations?: number;
  transfers?: Array<{ addr_to: string; amount: number }>;
  block?: number;
}

export async function getAddressTransactions(address: string): Promise<QbcTx[]> {
  // Try with the full address first, then without leading "Q" prefix
  const variants = [address, address.replace(/^Q/i, "")];
  for (const addr of variants) {
    try {
      const raw = await qbcGet<any>(
        `GetTransactionsByAddress?address=${encodeURIComponent(addr)}&item_per_page=20&page_number=1`
      );
      if (raw?.error) continue;

      // The QBC node returns "transactionsDetail" (not "transactions").
      // Addresses inside are base64-encoded binary — convert to hex for consistent comparison.
      const rawDetails: any[] =
        raw?.transactionsDetail ?? raw?.transactions ?? raw?.data ?? (Array.isArray(raw) ? raw : []);

      if (rawDetails.length > 0) {
        const txs: QbcTx[] = rawDetails.map((entry: any) => {
          const addrsTo: string[] = entry.tx?.transfer?.addrsTo ?? [];
          const amounts: string[]  = entry.tx?.transfer?.amounts ?? [];
          const txHashB64: string  = entry.tx?.transactionHash ?? "";
          // masterAddr is base64 in the API response — decode to hex for comparison
          const masterAddrB64: string = entry.tx?.masterAddr ?? "";
          return {
            tx_hash: txHashB64
              ? Buffer.from(txHashB64, "base64").toString("hex")
              : `unknown_${Date.now()}`,
            master_addr: masterAddrB64
              ? Buffer.from(masterAddrB64, "base64").toString("hex")
              : undefined,
            confirmations: parseInt(entry.confirmations ?? "0", 10),
            block:         parseInt(entry.blockNumber    ?? "0", 10),
            transfers: addrsTo.map((b64Addr: string, i: number) => ({
              addr_to: Buffer.from(b64Addr, "base64").toString("hex"),
              amount:  parseInt(amounts[i] ?? "0", 10),
            })),
          };
        });
        logger.info("qbitcoin", `getAddressTransactions(${addr}) → ${txs.length} tx(s), first conf: ${txs[0]?.confirmations}`);
        return txs;
      }
    } catch (err) {
      logger.error("qbitcoin", `getAddressTransactions(${addr}) failed`, String(err));
    }
  }
  return [];
}

export async function getBlockHeight(): Promise<number> {
  try {
    const data = await qbcGet<any>("GetHeight");
    logger.info("qbitcoin", `GetHeight raw: ${JSON.stringify(data)}`);
    return data?.height ?? data?.block_height ?? data?.result ?? 0;
  } catch {
    return 0;
  }
}

export async function getAddressState(address: string): Promise<{ balance?: number | string; last_tx_block?: number; nonce?: number } | null> {
  const variants = [address, address.replace(/^Q/i, "")];
  for (const addr of variants) {
    try {
      const raw = await qbcGet<any>(`GetAddressState?address=${encodeURIComponent(addr)}`);
      logger.info("qbitcoin", `GetAddressState(${addr}) raw: ${JSON.stringify(raw)}`);
      if (!raw?.error) return raw;
    } catch { /* try next */ }
  }
  return null;
}

// Count confirmed outgoing transactions from a wallet to determine the correct nonce
// for the next transaction (QBC uses a sequential nonce per sender address).
async function getWalletOutgoingNonce(walletAddress: string): Promise<number> {
  const txs = await getAddressTransactions(walletAddress);
  const addrNorm = normalizeAddr(walletAddress);
  const outgoing = txs.filter(
    (tx) => tx.master_addr !== undefined && normalizeAddr(tx.master_addr) === addrNorm
  );
  logger.info("qbitcoin", `Outgoing nonce for ${walletAddress}: ${outgoing.length}`);
  return outgoing.length;
}

export async function pushTransaction(signedTx: string): Promise<{ success: boolean; error?: string }> {
  const path = `PushTransaction?transaction_signed=${encodeURIComponent(signedTx)}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const url = `${QBC_NODE_URL}/api/${path}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        const body = await res.text();
        logger.warn("qbitcoin", `PushTransaction attempt ${attempt} HTTP ${res.status}: ${body.slice(0, 300)}`);
        if (attempt < 3) { await new Promise(r => setTimeout(r, 4000 * attempt)); continue; }
        return { success: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
      }
      const data: { error?: string; result?: string } = await res.json();
      if (data.error) return { success: false, error: data.error };
      logger.info("qbitcoin", `PushTransaction OK (attempt ${attempt})`);
      return { success: true };
    } catch (err: any) {
      logger.warn("qbitcoin", `PushTransaction attempt ${attempt} exception: ${err.message}`);
      if (attempt < 3) { await new Promise(r => setTimeout(r, 4000 * attempt)); continue; }
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: "All retry attempts failed" };
}

// ============================================================
// Address helpers
// ============================================================
// QBC addresses can be returned by the node with different capitalisation
// or without the leading "Q" prefix — normalise before comparing.
function normalizeAddr(addr: string): string {
  return addr.toLowerCase().replace(/^q/, "");
}
function addrEq(a: string, b: string): boolean {
  return normalizeAddr(a) === normalizeAddr(b);
}

// ============================================================
// Wallet management
// ============================================================
export async function getOrCreateDepositWallet(userId: string): Promise<{ address: string }> {
  // Check if we already have a wallet for this user
  const [existing] = await db
    .select({ address: qbcWallets.address })
    .from(qbcWallets)
    .where(eq(qbcWallets.userId, userId));

  if (existing) return { address: existing.address };

  // Generate new Falcon-512 wallet via Rust addon
  const wallet = generateWallet();
  const encryptedSk = encryptSecretKey(wallet.secretKey);

  await db.insert(qbcWallets).values({
    userId,
    address: wallet.address,
    publicKey: wallet.publicKey,
    encryptedSecretKey: encryptedSk,
  });

  logger.info("qbitcoin", `Created deposit wallet for user ${userId}: ${wallet.address}`);
  return { address: wallet.address };
}

// ============================================================
// Deposit processing
// ============================================================
export interface DepositStatus {
  address: string;
  qbcPrice: number;
  minQbc: number;      // minimum in QBC units
  balanceShor: string; // current balance in shor
  balanceQbc: number;  // current balance in QBC
  confirmations: number;
  creditsAdded: number;
  status: "waiting" | "confirming" | "confirmed" | "error";
}

export async function checkAndProcessDeposit(userId: string): Promise<DepositStatus> {
  const [walletRow] = await db
    .select()
    .from(qbcWallets)
    .where(eq(qbcWallets.userId, userId));

  if (!walletRow) throw new Error("No QBC wallet found for user");

  const qbcPrice = await getQbcUsdPrice();
  const minQbc = MIN_DEPOSIT_USD / qbcPrice;
  const minShor = BigInt(Math.ceil(minQbc * SHOR_PER_QBC));

  const balanceShor = await getQbcBalance(walletRow.address);
  const balanceQbc = Number(balanceShor) / SHOR_PER_QBC;

  // No minimum during testing — any balance triggers the deposit flow
  if (balanceShor === 0n) {
    return {
      address: walletRow.address,
      qbcPrice,
      minQbc,
      balanceShor: balanceShor.toString(),
      balanceQbc,
      confirmations: 0,
      creditsAdded: 0,
      status: "waiting",
    };
  }

  // Enough balance received — check confirmations via transactions
  const txs = await getAddressTransactions(walletRow.address);
  const currentHeight = await getBlockHeight();

  // Find deposit transactions (incoming to our address)
  logger.info("qbitcoin", `Raw txs for ${walletRow.address}: ${JSON.stringify(txs)}`);
  let incomingTxs = txs.filter((tx) =>
    tx.transfers?.some((t) => addrEq(t.addr_to, walletRow.address))
  );

  // Fallback: if node returns no txs but balance exists, synthesize a pseudo-tx
  // using GetAddressState to derive a block number for confirmation counting.
  if (incomingTxs.length === 0 && balanceShor > 0n) {
    const state = await getAddressState(walletRow.address);
    const fundedAtBlock = state?.last_tx_block ?? state?.nonce ?? null;
    const syntheticConf = fundedAtBlock && currentHeight > 0
      ? Math.max(0, currentHeight - (fundedAtBlock as number))
      : 0;
    logger.info("qbitcoin", `Fallback synthetic confirmations: ${syntheticConf} (fundedAtBlock: ${fundedAtBlock}, height: ${currentHeight})`);
    // Treat it like a single untracked incoming tx so credits can be added
    incomingTxs = [{
      tx_hash: `synthetic_${walletRow.address}_${balanceShor}`,
      confirmations: syntheticConf,
      transfers: [{ addr_to: walletRow.address, amount: Number(balanceShor) }],
    }];
  }

  logger.info("qbitcoin", `incomingTxs count: ${incomingTxs.length}, currentHeight: ${currentHeight}`);

  let maxConfirmations = 0;
  // pendingConf tracks the confirmations of the latest UNPROCESSED tx for the UI progress bar.
  // This resets the bar when a new deposit arrives (even if an older one is already confirmed).
  let pendingConf: number | null = null;
  let totalDepositShor = 0n;
  const unprocessedTxHashes: string[] = [];

  for (const tx of incomingTxs) {
    // Prefer confirmations field from API; fall back to height diff
    const txConfirmations = (tx.confirmations != null && tx.confirmations > 0)
      ? tx.confirmations
      : (tx.block && currentHeight > 0
          ? Math.max(0, currentHeight - tx.block)
          : 0);
    logger.info("qbitcoin", `tx ${tx.tx_hash}: confirmations=${txConfirmations} (raw: ${tx.confirmations}, block: ${tx.block}, height: ${currentHeight})`);

    const confirmed = txConfirmations >= REQUIRED_CONFIRMATIONS;

    // Check if we already processed this tx
    const [existing] = await db
      .select({ id: qbcDeposits.id, status: qbcDeposits.status })
      .from(qbcDeposits)
      .where(eq(qbcDeposits.txHash, tx.tx_hash));

    const alreadyProcessed = existing && (existing.status === "confirmed" || existing.status === "forwarded");

    if (!alreadyProcessed) {
      // Track min confirmations across all pending txs so the UI bar shows the newest tx's progress
      pendingConf = pendingConf === null ? txConfirmations : Math.min(pendingConf, txConfirmations);
      if (!existing && confirmed) {
        unprocessedTxHashes.push(tx.tx_hash);
      }
    }

    const amountForAddr = BigInt(
      tx.transfers?.reduce((acc, t) =>
        addrEq(t.addr_to, walletRow.address) ? acc + t.amount : acc, 0) ?? 0
    );
    totalDepositShor += amountForAddr;
    maxConfirmations = Math.max(maxConfirmations, txConfirmations);
  }

  let totalCreditsAdded = 0;
  if (unprocessedTxHashes.length > 0) {
    // Credit the user per confirmed transaction
    for (const txHash of unprocessedTxHashes) {
      const tx = incomingTxs.find((t) => t.tx_hash === txHash)!;
      const amountShor = BigInt(
        tx.transfers?.reduce((acc, t) =>
          addrEq(t.addr_to, walletRow.address) ? acc + t.amount : acc, 0) ?? 0
      );
      const amountQbc = Number(amountShor) / SHOR_PER_QBC;
      const amountUsd = amountQbc * qbcPrice;
      // Keep up to 6 decimal places — do NOT Math.floor or small deposits become 0 credits
      const creditsToAdd = parseFloat((amountUsd * CREDIT_RATIO).toFixed(6));

      // Add credits (atomic increment + ledger entry)
      await addCredits(
        userId,
        creditsToAdd,
        `QBitcoin deposit: ${amountQbc.toFixed(4)} QBC ($${amountUsd.toFixed(2)})`,
        { txHash, paymentMethod: "qbitcoin", amountQbc, amountUsd, qbcPrice }
      );

      // Record deposit row
      await db.insert(qbcDeposits).values({
        userId,
        txHash,
        amountShor: amountShor.toString(),
        amountQbc: amountQbc.toFixed(6),
        amountUsd: amountUsd.toFixed(4),
        creditsAdded: creditsToAdd.toString(),
        confirmations: REQUIRED_CONFIRMATIONS,
        status: "confirmed",
      });

      totalCreditsAdded += creditsToAdd;
      logger.info("qbitcoin", `Credited ${creditsToAdd} credits to user ${userId} for tx ${txHash}`);

      // Notify admin of successful QBC deposit
      const notifyEmail = process.env.WELCOME_EMAIL || "welcome@metallm.tech";
      const [userRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
      sendEmail({
        to: notifyEmail,
        subject: `New QBitcoin Deposit — ${amountQbc.toFixed(4)} QBC ($${amountUsd.toFixed(2)})`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#333;">
            <h2 style="margin-bottom:8px;">₿ New QBitcoin Deposit Confirmed</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;color:#666;">User</td><td style="padding:6px 0;">${userRow?.email ?? userId}</td></tr>
              <tr><td style="padding:6px 0;color:#666;">Amount (QBC)</td><td style="padding:6px 0;font-weight:bold;">${amountQbc.toFixed(4)} QBC</td></tr>
              <tr><td style="padding:6px 0;color:#666;">Amount (USD)</td><td style="padding:6px 0;font-weight:bold;">$${amountUsd.toFixed(2)} USD</td></tr>
              <tr><td style="padding:6px 0;color:#666;">Credits Added</td><td style="padding:6px 0;">${creditsToAdd}</td></tr>
              <tr><td style="padding:6px 0;color:#666;">QBC Price</td><td style="padding:6px 0;">$${qbcPrice.toFixed(6)}</td></tr>
              <tr><td style="padding:6px 0;color:#666;">Transaction Hash</td><td style="padding:6px 0;font-family:monospace;word-break:break-all;">${txHash}</td></tr>
              <tr><td style="padding:6px 0;color:#666;">Payment Method</td><td style="padding:6px 0;">QBitcoin (QBC)</td></tr>
            </table>
          </div>`,
        text: `New QBC deposit from ${userRow?.email ?? userId}: ${amountQbc.toFixed(4)} QBC ($${amountUsd.toFixed(2)}) | Credits: ${creditsToAdd} | TX: ${txHash}`,
      }).catch((e) => logger.error("qbitcoin", `Notification email failed: ${e.message}`));

      // Forward QBC to main wallet after crediting
      if (MAIN_WALLET) {
        await forwardToMainWallet(userId, walletRow.address).catch((err) =>
          logger.error("qbitcoin", `Forward failed for user ${userId}`, err)
        );
      }
    }
  }

  // Fetch total credits added for this user from DB
  const allDeposits = await db
    .select({ creditsAdded: qbcDeposits.creditsAdded })
    .from(qbcDeposits)
    .where(and(eq(qbcDeposits.userId, userId), eq(qbcDeposits.status, "confirmed")));

  const totalCredited = allDeposits.reduce((sum, d) => sum + parseInt(d.creditsAdded ?? "0"), 0);

  return {
    address: walletRow.address,
    qbcPrice,
    minQbc,
    balanceShor: balanceShor.toString(),
    balanceQbc,
    creditsAdded: totalCredited,
    // For the UI progress bar: show pending tx's confirmations; fall back to max if all processed
    confirmations: pendingConf !== null ? pendingConf : maxConfirmations,
    status: (pendingConf !== null ? pendingConf : maxConfirmations) >= REQUIRED_CONFIRMATIONS ? "confirmed" : "confirming",
  };
}

// ============================================================
// Forward funds to main wallet (sweep)
// ============================================================
export async function forwardToMainWallet(userId: string, fromAddress: string): Promise<void> {
  if (!MAIN_WALLET) throw new Error("MAIN_WALLET_ADDRESS not set");

  const [walletRow] = await db
    .select()
    .from(qbcWallets)
    .where(eq(qbcWallets.userId, userId));

  if (!walletRow) throw new Error("Wallet not found");

  const balanceShor = await getQbcBalance(fromAddress);
  const sendable = balanceShor - BigInt(FEE_SHOR);
  if (sendable <= 0n) {
    logger.warn("qbitcoin", `Not enough balance to forward from ${fromAddress}`);
    return;
  }

  const secretKey = decryptSecretKey(walletRow.encryptedSecretKey);

  // Determine the correct nonce from the number of confirmed outgoing transactions
  // from this wallet. Reusing nonce=0 always causes "Public key and address doesn't match"
  // at block inclusion time because the node rejects duplicate/stale nonces.
  const nonce = await getWalletOutgoingNonce(fromAddress);

  const txResult = createTransaction({
    master_addr: fromAddress,
    secret_key: secretKey,
    public_key: walletRow.publicKey,
    recipient: MAIN_WALLET,
    amount: Number(sendable),
    fee: FEE_SHOR,
    nonce,
  });

  if (txResult.error) throw new Error(`createTransaction error: ${txResult.error}`);

  const signedTx = buildSignedTxHex(txResult);
  logger.info("qbitcoin", `Submitting forward tx: from=${fromAddress} to=${MAIN_WALLET} amount=${Number(sendable)} fee=${FEE_SHOR} nonce=${nonce} sigBytes=${Buffer.from(signedTx, "base64").length}`);
  const result = await pushTransaction(signedTx);

  if (!result.success) {
    throw new Error(`PushTransaction failed: ${result.error}`);
  }

  // Update deposit records to 'forwarded'
  await db
    .update(qbcDeposits)
    .set({ status: "forwarded", forwardTxHash: txResult.transaction_hash, updatedAt: new Date() })
    .where(and(eq(qbcDeposits.userId, userId), eq(qbcDeposits.status, "confirmed")));

  logger.info("qbitcoin", `Forwarded ${Number(sendable) / SHOR_PER_QBC} QBC from ${fromAddress} to ${MAIN_WALLET}, tx: ${txResult.transaction_hash}`);
}

// ============================================================
// Build signed transaction (protobuf, base64-encoded)
// QBC node's PushTransaction endpoint requires base64, NOT hex.
// Mirrors TransactionBuilder.buildTransactionFromRust() in the QBC wallet source
// ============================================================
function buildSignedTxHex(tx: ReturnType<typeof createTransaction>): string {
  // All fields in the QBC protobuf:
  // Field 1: master_addr (bytes)
  // Field 2: fee (uint64 varint)
  // Field 3: public_key (bytes)
  // Field 4: signature (bytes)
  // Field 5: nonce (uint64 varint)
  // Field 6: transaction_hash (bytes)
  // Field 7+: Transfer {addr_to (bytes), amount (uint64)}

  // QBC addresses are hex strings, optionally prefixed with 'Q'.
  // Buffer.from() stops at the first non-hex character, so we MUST strip the Q prefix.
  const addrHex = (a: string) => Buffer.from(a.replace(/^Q/i, ""), "hex");

  const parts: Buffer[] = [];

  parts.push(protoField(1, "bytes", addrHex(tx.master_addr)));
  parts.push(protoField(2, "varint", BigInt(tx.fee)));
  parts.push(protoField(3, "bytes", Buffer.from(tx.public_key, "hex")));
  parts.push(protoField(4, "bytes", Buffer.from(tx.signature, "hex")));
  parts.push(protoField(5, "varint", BigInt(tx.nonce)));
  parts.push(protoField(6, "bytes", Buffer.from(tx.transaction_hash, "hex")));

  for (const transfer of tx.transfers) {
    const transferParts: Buffer[] = [];
    transferParts.push(protoField(1, "bytes", addrHex(transfer.addr_to)));
    transferParts.push(protoField(2, "varint", BigInt(transfer.amount)));
    const transferBuf = Buffer.concat(transferParts);
    parts.push(protoField(7, "bytes", transferBuf)); // embedded message = length-delimited bytes
  }

  // QBC node's grpcProxy.py decodes the value with bytes.fromhex() — must be hex, NOT base64.
  return Buffer.concat(parts).toString("hex");
}

// Minimal protobuf encoding helpers
function protoVarint(value: bigint): Buffer {
  const bytes: number[] = [];
  let v = value;
  while (v > 127n) {
    bytes.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  bytes.push(Number(v));
  return Buffer.from(bytes);
}

function protoField(fieldNum: number, type: "bytes" | "varint", value: Buffer | bigint): Buffer {
  if (type === "varint") {
    const tag = protoVarint(BigInt((fieldNum << 3) | 0)); // wire type 0
    return Buffer.concat([tag, protoVarint(value as bigint)]);
  } else {
    const valueBuf = value as Buffer;
    const tag = protoVarint(BigInt((fieldNum << 3) | 2)); // wire type 2
    const len = protoVarint(BigInt(valueBuf.length));
    return Buffer.concat([tag, len, valueBuf]);
  }
}

// ============================================================
// Credit helpers
// ============================================================
export async function getUserCredits(userId: string): Promise<number> {
  const [user] = await db.select({ credits: users.credits }).from(users).where(eq(users.id, userId));
  return user ? parseFloat(user.credits) : 0;
}

async function addCredits(
  userId: string,
  amount: number,
  description: string,
  metadata?: any
): Promise<number> {
  const [updated] = await db
    .update(users)
    .set({
      credits: sql`${users.credits}::numeric + ${amount.toString()}::numeric`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({ credits: users.credits });

  const newBalance = parseFloat(updated.credits);

  await db.insert(creditTransactions).values({
    userId,
    type: "purchase",
    amount: amount.toFixed(6),
    balanceAfter: newBalance.toFixed(4),
    description,
    metadata,
  });

  return newBalance;
}
