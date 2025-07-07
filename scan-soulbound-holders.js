import fs from "fs";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

// Setup connection
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Soulbound NFT Mint Address
const SOULBOUND_MINT = new PublicKey("BGZPPAY2jJ1rgFNhRkHKjPVmxx1VFUisZSo569Pi71Pc");

// Holders will be stored here
const holders = new Set();

async function scanHolders() {
  console.log("🔍 Scanning for soulbound NFT holders...");

  const parsedAccounts = await connection.getParsedTokenAccountsByMint(
    SOULBOUND_MINT,
    { programId: TOKEN_2022_PROGRAM_ID }
  );

  for (const { account } of parsedAccounts.value) {
    const amount = BigInt(account.data.parsed.info.tokenAmount.amount);
    const owner = account.data.parsed.info.owner;

    if (amount > 0n) {
      holders.add(owner);
    }
  }

  const array = Array.from(holders);
  fs.writeFileSync("soulbound_holders.json", JSON.stringify(array, null, 2));

  console.log(`✅ Found ${array.length} wallet(s). Saved to soulbound_holders.json`);
}

scanHolders().catch(console.error);
