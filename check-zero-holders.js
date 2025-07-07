import {
  Connection,
  PublicKey,
  clusterApiUrl
} from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID
} from "@solana/spl-token";
import fetch from "node-fetch";
import fs from "fs";

// Setup
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Replace with your actual mints
const SOULBOUND_MINT = new PublicKey("BGZPPAY2jJ1rgFNhRkHKjPVmxx1VFUisZSo569Pi71Pc");
const NFT_MINTS = [
  new PublicKey("GXsBcsscLxMRKLgwWWnKkUzuXdEXwr74NiSqJrBs21Mz"), // 10GB
  new PublicKey("HDtzBt6nvoHLhiV8KLrovhnP4pYesguq89J2vZZbn6kA"), // 25GB
  new PublicKey("C6is6ajmWgySMA4WpDfccadLf5JweXVufdXexWNrLKKD")  // 50GB
];

// Replace with your Telegram bot details
const TELEGRAM_BOT_TOKEN = "7953684294:AAHbmjyEfURQiNqktYKLUaU-gP7bAZ0L7-0";
const TELEGRAM_CHAT_ID = "5263626913";

// Load list of known soulbound holders (e.g., from DB or snapshot)
const holders = JSON.parse(fs.readFileSync("soulbound_holders.json", "utf8"));

// Helper: Check if user holds any normal NFTs
async function hasValidNFTs(wallet) {
  for (const mint of NFT_MINTS) {
    try {
      const ata = await getAssociatedTokenAddress(mint, wallet, false, TOKEN_2022_PROGRAM_ID);
      const account = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
      if (Number(account.amount) > 0) return true;
    } catch (_) {}
  }
  return false;
}

// Helper: Send Telegram alert
async function sendTelegramAlert(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message
    })
  });
}

(async () => {
  console.log("🔍 Checking soulbound holders...");
  for (const walletStr of holders) {
    const wallet = new PublicKey(walletStr);
    const isValid = await hasValidNFTs(wallet);
    if (!isValid) {
      console.log(`⚠️ Wallet ${walletStr} has 0 valid NFTs`);
      await sendTelegramAlert(`⚠️ Wallet ${walletStr} owns a soulbound NFT but has 0 valid plan NFTs. Review & burn if needed.`);
    }
  }
  console.log("✅ Done.");
})();
