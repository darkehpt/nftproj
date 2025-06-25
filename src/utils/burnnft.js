import fs from "fs";
import {
  Connection,
  clusterApiUrl,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import {
  getAssociatedTokenAddress,
  createBurnInstruction,
  createCloseAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

async function main() {
  console.log("Starting burn test...");

  // Load mint authority secret key from JSON file (no import assert)
  const secret = JSON.parse(fs.readFileSync("./mint-authority.json", "utf8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secret));
  console.log("Loaded payer:", payer.publicKey.toBase58());

  // Connect to Solana devnet
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  console.log("Connected to Solana devnet");

  // NFT mint address and user public key
  const mint = new PublicKey("GXsBcsscLxMRKLgwWWnKkUzuXdEXwr74NiSqJrBs21Mz"); // 10GB NFT mint
  const user = new PublicKey("6WCrvPVzPcn6oWsiCgg4PWvgu3X9ytTJqNL39JwHhX8v");

  console.log("Mint:", mint.toBase58());
  console.log("User:", user.toBase58());

  // Get user's associated token account
  const ata = await getAssociatedTokenAddress(mint, user, false, TOKEN_2022_PROGRAM_ID);
  console.log("User's ATA:", ata.toBase58());

  // Build transaction to burn 1 token and close ATA
  const tx = new Transaction().add(
    createBurnInstruction(ata, mint, payer.publicKey, 1, [], TOKEN_2022_PROGRAM_ID),
    createCloseAccountInstruction(ata, user, payer.publicKey, [], TOKEN_2022_PROGRAM_ID)
  );

  // Send transaction
  const signature = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log("✅ Burn complete! Signature:", signature);
}

main().catch(console.error);
