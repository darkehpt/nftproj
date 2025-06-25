import express from "express";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";
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
  createBurnInstruction,
  createCloseAccountInstruction,
  setAuthority,
  AuthorityType,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

dotenv.config();

// Load mint authority from secret
const mintAuthoritySecret = JSON.parse(process.env.MINT_AUTHORITY_SECRET);
const mintAuthority = Keypair.fromSecretKey(new Uint8Array(mintAuthoritySecret));

// Connection
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

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

// === MINT ENDPOINT ===
app.post("/mint-nft", async (req, res) => {
  try {
    const { userPubkey, plan } = req.body;
    if (!userPubkey || !plan || !NFT_MINTS[plan]) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    const userPublicKey = new PublicKey(userPubkey);
    const mint = NFT_MINTS[plan];
    const ata = await getOrCreateATA(connection, mint, userPublicKey, mintAuthority);

    const tx = new Transaction();
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
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

    // Set your wallet as the permanent delegate & mint close authority (only once per mint)
    // Only set authority the first time for each mint
  const mintInfo = await connection.getAccountInfo(mint);
  if (mintInfo && mintInfo.data) {
    const decoded = mintInfo.data.toString("base64");

    // Optional: check if authority is already set
    // If not, set your authority as permanent delegate and mint close authority
    tx.add(
      setAuthority(
        mint,
        mintAuthority.publicKey,
        AuthorityType.FreezeAccount, // permanent delegate capability
        mintAuthority.publicKey,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
    tx.add(
      setAuthority(
        mint,
        mintAuthority.publicKey,
        AuthorityType.CloseMint,
        mintAuthority.publicKey,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

    const txid = await sendAndConfirmTransaction(connection, tx, [mintAuthority]);
    console.log(`✅ NFT minted to ${userPubkey} for plan ${plan}: ${txid}`);
    res.json({ success: true, txid });
  } catch (error) {
    console.error("❌ Mint error:", error);
    res.status(500).json({ error: error.message });
  }
});

// === BURN + CLOSE ENDPOINT ===
app.post("/burn-nft", async (req, res) => {
  try {
    const { userPubkey, plan } = req.body;
    if (!userPubkey || !plan || !NFT_MINTS[plan]) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    const userPublicKey = new PublicKey(userPubkey);
    const mint = NFT_MINTS[plan];
    const ata = await getAssociatedTokenAddress(mint, userPublicKey, false, TOKEN_2022_PROGRAM_ID);

    const tx = new Transaction();
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = mintAuthority.publicKey;

    tx.add(
      createBurnInstruction(
        ata,
        mint,
        userPublicKey,
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    tx.add(
      createCloseAccountInstruction(
        ata,
        userPublicKey,
        userPublicKey,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const txid = await sendAndConfirmTransaction(connection, tx, []);
    console.log(`🔥 Burned & closed ATA for ${userPubkey} plan ${plan}: ${txid}`);
    res.json({ success: true, txid });
  } catch (error) {
    console.error("❌ Burn error:", error);
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
