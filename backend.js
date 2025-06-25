// backend.js

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
  Keypair,
} from "@solana/web3.js";

import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createBurnInstruction,
  createCloseAccountInstruction,
  // createSetAuthorityInstruction,
  // AuthorityType,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

dotenv.config();

const mintAuthoritySecret = JSON.parse(process.env.MINT_AUTHORITY_SECRET);
const mintAuthority = Keypair.fromSecretKey(new Uint8Array(mintAuthoritySecret));

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

const NFT_MINTS = {
  "10GB": new PublicKey("GXsBcsscLxMRKLgwWWnKkUzuXdEXwr74NiSqJrBs21Mz"),
  "25GB": new PublicKey("HDtzBt6nvoHLhiV8KLrovhnP4pYesguq89J2vZZbn6kA"),
  "50GB": new PublicKey("C6is6ajmWgySMA4WpDfccadLf5JweXVufdXexWNrLKKD"),
};

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("✅ Mint backend running");
});

async function getOrCreateATA(connection, mint, owner, payer) {
  const ata = await getAssociatedTokenAddress(mint, owner, false, TOKEN_2022_PROGRAM_ID);
  const info = await connection.getAccountInfo(ata);
  if (!info) {
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        ata,
        owner,
        mint,
        TOKEN_2022_PROGRAM_ID
      )
    );
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer.publicKey;
    tx.sign(payer);
    const rawTx = tx.serialize();
    await connection.sendRawTransaction(rawTx);
    console.log(`Created ATA for ${owner.toBase58()}`);
  }
  return ata;
}

// === MINT ===
app.post("/mint-nft", async (req, res) => {
  try {
    const { userPubkey, plan } = req.body;
    if (!userPubkey || !plan || !NFT_MINTS[plan]) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const userPublicKey = new PublicKey(userPubkey);
    const mint = NFT_MINTS[plan];
    const ata = await getOrCreateATA(connection, mint, userPublicKey, mintAuthority);

    const tx = new Transaction();

    // Mint 1 token to user's ATA
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

    // NOTE: Setting mint authorities (mint, burn, freeze) is usually done once by the mint creator,
    // not on every mint call. So it's commented out here.
    // If you want to set authorities, do it separately, carefully.

    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = mintAuthority.publicKey;
    tx.sign(mintAuthority);

    const rawTx = tx.serialize();
    const signature = await connection.sendRawTransaction(rawTx);
    await connection.confirmTransaction(signature, "confirmed");

    console.log(`✅ Minted ${plan} NFT to ${userPubkey}: ${signature}`);
    res.json({ success: true, txid: signature });
  } catch (err) {
    console.error("❌ Mint error:", err);
    res.status(500).json({ error: err.message });
  }
});

// === ADMIN BURN ===
// Use backend's mintAuthority as delegate to burn user's NFT without user signature
app.post("/burn-nft", async (req, res) => {
  try {
    const { userPubkey, plan } = req.body;
    if (!userPubkey || !plan || !NFT_MINTS[plan]) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const userPublicKey = new PublicKey(userPubkey);
    const mint = NFT_MINTS[plan];
    const ata = await getAssociatedTokenAddress(mint, userPublicKey, false, TOKEN_2022_PROGRAM_ID);

    const tx = new Transaction();

    // Burn 1 token from user's ATA (as delegated authority)
    tx.add(
      createBurnInstruction(
        ata,
        mint,
        mintAuthority.publicKey,
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    // Close the ATA (returns SOL to user)
    tx.add(
      createCloseAccountInstruction(
        ata,
        userPublicKey,
        mintAuthority.publicKey,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = mintAuthority.publicKey;
    tx.sign(mintAuthority);

    const rawTx = tx.serialize();
    const signature = await connection.sendRawTransaction(rawTx);
    await connection.confirmTransaction(signature, "confirmed");

    console.log(`🔥 Admin burned NFT for ${userPubkey} [${plan}]: ${signature}`);
    res.json({ success: true, txid: signature });
  } catch (err) {
    console.error("❌ Burn error:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`✅ Backend listening at http://localhost:${PORT}`);
});

setInterval(() => {
  console.log(`[heartbeat] Alive at ${new Date().toISOString()}`);
}, 15000);
