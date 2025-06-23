import express from "express";
import cors from "cors";
import fs from "fs";
import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

// Load mint authority keypair from local JSON (replace with your path)
const mintAuthoritySecret = JSON.parse(fs.readFileSync("./mint-authority.json"));
const mintAuthority = Keypair.fromSecretKey(new Uint8Array(mintAuthoritySecret));

// Solana devnet connection
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Your NFT Token-2022 mint addresses by plan
const NFT_MINTS = {
  "10GB": new PublicKey("GXsBcsscLxMRKLgwWWnKkUzuXdEXwr74NiSqJrBs21Mz"),
  "25GB": new PublicKey("HDtzBt6nvoHLhiV8KLrovhnP4pYesguq89J2vZZbn6kA"),
  "50GB": new PublicKey("C6is6ajmWgySMA4WpDfccadLf5JweXVufdXexWNrLKKD"),
};

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("✅ Mint backend running");
});

// This function now sends the transaction immediately if ATA doesn't exist
async function getOrCreateATA(connection, mint, owner, payer) {
  const ata = await getAssociatedTokenAddress(mint, owner, false, TOKEN_2022_PROGRAM_ID);
  const accountInfo = await connection.getAccountInfo(ata);
  if (!accountInfo) {
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        ata,
        owner,
        mint,
        TOKEN_2022_PROGRAM_ID
      )
    );
    await sendAndConfirmTransaction(connection, tx, [payer]);
    console.log(`Created ATA ${ata.toBase58()} for owner ${owner.toBase58()}`);
  }
  return ata;
}

app.post("/mint-nft", async (req, res) => {
  try {
    const { userPubkey, plan } = req.body;

    if (!userPubkey || !plan || !NFT_MINTS[plan]) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    const userPublicKey = new PublicKey(userPubkey);
    const mint = NFT_MINTS[plan];

    // Ensure ATA exists on-chain before minting
    const ata = await getOrCreateATA(connection, mint, userPublicKey, mintAuthority);

    // Create mint transaction separately
    const tx = new Transaction();
    const latestBlockhash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;
    tx.feePayer = mintAuthority.publicKey;

    tx.add(
      createMintToInstruction(
        mint,
        ata,
        mintAuthority.publicKey,
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const txid = await sendAndConfirmTransaction(connection, tx, [mintAuthority]);

    console.log(`✅ NFT minted to ${userPubkey} for plan ${plan}: ${txid}`);

    res.json({ success: true, txid });
  } catch (error) {
    console.error("❌ Mint error:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`✅ Minting backend running at http://localhost:${PORT}`);
});

setInterval(() => {
  console.log(`[heartbeat] Alive at ${new Date().toISOString()}`);
}, 15000);
