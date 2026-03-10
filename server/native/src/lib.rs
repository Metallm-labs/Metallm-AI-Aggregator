// ============================================================
// QBitcoin Falcon-512 Native Addon (pqcrypto)
// Provides: wallet generation + transaction signing for QBC
// ============================================================

#![deny(clippy::all)]

use napi_derive::napi;
use pqcrypto_falcon::falcon512;
use pqcrypto_traits::sign::{DetachedSignature, PublicKey, SecretKey};
use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/// Derive QBC address from a Falcon-512 public key.
/// Format: "Q" + "01" (1-byte descriptor for Falcon-512) + first 24 bytes of SHA256(SHA256(pk)) as hex
fn derive_address(pk_bytes: &[u8]) -> String {
    let first = Sha256::digest(pk_bytes);
    let second = Sha256::digest(&first);
    // descriptor byte 0x01 = Falcon-512
    let descriptor: [u8; 1] = [0x01];
    let addr_payload = [&descriptor[..], &second[..24]].concat();
    format!("Q{}", hex::encode(&addr_payload))
}

/// Parse a Q-address (strip leading "Q") to raw bytes
fn parse_qaddr(addr: &str) -> Result<Vec<u8>, String> {
    let hex_part = if addr.starts_with('Q') { &addr[1..] } else { addr };
    hex::decode(hex_part).map_err(|e| format!("Invalid Q-address: {}", e))
}

/// Encode a u64 as 8-byte big-endian
fn u64_to_be(n: u64) -> [u8; 8] {
    n.to_be_bytes()
}

// ──────────────────────────────────────────────
// Exported types
// ──────────────────────────────────────────────

#[derive(Serialize)]
struct WalletResult {
    address: String,
    #[serde(rename = "publicKey")]
    public_key: String,
    #[serde(rename = "secretKey")]
    secret_key: String,
}

#[derive(Deserialize)]
struct TxParams {
    master_addr: String,
    secret_key: String,   // hex
    public_key: String,   // hex
    recipient: String,
    amount: u64,          // in shor
    fee: u64,             // in shor
    nonce: u64,
}

#[derive(Serialize)]
struct TransferEntry {
    addr_to: String,   // hex (no Q prefix)
    amount: u64,
}

#[derive(Serialize)]
struct TxResult {
    master_addr: String,   // hex (no Q prefix)
    public_key: String,    // hex
    signature: String,     // hex
    transaction_hash: String, // hex
    fee: u64,
    nonce: u64,
    transfers: Vec<TransferEntry>,
}

// ──────────────────────────────────────────────
// Exported NAPI functions
// ──────────────────────────────────────────────

/// Generate a Falcon-512 keypair and derive a QBC wallet address.
/// Returns JSON string: { address, publicKey, secretKey }
#[napi]
pub fn generate_wallet() -> String {
    let (pk, sk) = falcon512::keypair();
    let result = WalletResult {
        address: derive_address(pk.as_bytes()),
        public_key: hex::encode(pk.as_bytes()),
        secret_key: hex::encode(sk.as_bytes()),
    };
    serde_json::to_string(&result).unwrap()
}

/// Create and sign a QBC transfer transaction.
/// params_json: JSON string matching TxParams struct
/// Returns JSON string matching TxResult struct (or error JSON)
#[napi]
pub fn create_transaction(params_json: String) -> String {
    let params: TxParams = match serde_json::from_str(&params_json) {
        Ok(p) => p,
        Err(e) => return serde_json::json!({ "error": format!("Invalid params: {}", e) }).to_string(),
    };

    // Parse addresses
    let master_bytes = match parse_qaddr(&params.master_addr) {
        Ok(b) => b,
        Err(e) => return serde_json::json!({ "error": e }).to_string(),
    };
    let recipient_bytes = match parse_qaddr(&params.recipient) {
        Ok(b) => b,
        Err(e) => return serde_json::json!({ "error": e }).to_string(),
    };

    // Parse keys
    let pk_bytes = match hex::decode(&params.public_key) {
        Ok(b) => b,
        Err(e) => return serde_json::json!({ "error": format!("Invalid public key: {}", e) }).to_string(),
    };
    let sk_bytes = match hex::decode(&params.secret_key) {
        Ok(b) => b,
        Err(e) => return serde_json::json!({ "error": format!("Invalid secret key: {}", e) }).to_string(),
    };

    // Build signing data: master_addr + fee_be8 + recipient_addr + amount_be8
    let fee_bytes = u64_to_be(params.fee);
    let amount_bytes = u64_to_be(params.amount);
    let original_data: Vec<u8> = [
        master_bytes.as_slice(),
        &fee_bytes,
        // message_data is empty for simple transfers
        recipient_bytes.as_slice(),
        &amount_bytes,
    ]
    .concat();

    // Hash the signing data
    let signing_hash = Sha256::digest(&original_data);

    // Sign the hash with Falcon-512
    let sk = match falcon512::SecretKey::from_bytes(&sk_bytes) {
        Ok(k) => k,
        Err(e) => return serde_json::json!({ "error": format!("Invalid secret key bytes: {}", e) }).to_string(),
    };

    let sig = falcon512::detached_sign(signing_hash.as_slice(), &sk);
    let sig_hex = hex::encode(sig.as_bytes());

    // Transaction hash = SHA256(original_data + signature)
    let tx_hash_input: Vec<u8> = [original_data.as_slice(), sig.as_bytes()].concat();
    let tx_hash = hex::encode(Sha256::digest(&tx_hash_input));

    let result = TxResult {
        master_addr: hex::encode(&master_bytes),
        public_key: hex::encode(&pk_bytes),
        signature: sig_hex,
        transaction_hash: tx_hash,
        fee: params.fee,
        nonce: params.nonce,
        transfers: vec![TransferEntry {
            addr_to: hex::encode(&recipient_bytes),
            amount: params.amount,
        }],
    };

    serde_json::to_string(&result).unwrap()
}
