import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";

import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createBurnCheckedInstruction,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ CORS + JSON parsing
app.use(cors({
  origin: "https://nftproj-frans-projects-d13b4cab.vercel.app",
  methods: ["POST"],
  allowedHeaders: ["Content-Type"],
}));
app.use(express.json());

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// 🔐 Load backend wallet
const SECRET_KEY = JSON.parse(process.env.MINT_AUTHORITY_SECRET);
const BACKEND_WALLET = Keypair.fromSecretKey(Uint8Array.from(SECRET_KEY));
const BACKEND_AUTHORITY = BACKEND_WALLET.publicKey;

console.log("✅ Backend wallet:", BACKEND_AUTHORITY.toBase58());

// 🎯 Predefined NFT mint addresses
const NFT_MINTS = {
  "10GB": new PublicKey("GXsBcsscLxMRKLgwWWnKkUzuXdEXwr74NiSqJrBs21Mz"),
  "25GB": new PublicKey("HDtzBt6nvoHLhiV8KLrovhnP4pYesguq89J2vZZbn6kA"),
  "50GB": new PublicKey("C6is6ajmWgySMA4WpDfccadLf5JweXVufdXexWNrLKKD"),
};

// 🚀 Mint NFT to user
app.post("/mint-nft", async (req, res) => {
  try {
    const { userPubkey, plan } = req.body;
    if (!userPubkey || !plan || !NFT_MINTS[plan]) {
      return res.status(400).json({ success: false, error: "Invalid input" });
    }

    const user = new PublicKey(userPubkey);
    const mint = NFT_MINTS[plan];

    const backendAta = await getAssociatedTokenAddress(mint, BACKEND_AUTHORITY, false, TOKEN_2022_PROGRAM_ID);
    const userAta = await getAssociatedTokenAddress(mint, user, false, TOKEN_2022_PROGRAM_ID);
    const userAtaInfo = await connection.getAccountInfo(userAta);

    const tx = new Transaction();

    if (!userAtaInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          BACKEND_AUTHORITY,
          userAta,
          user,
          mint,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    tx.add(
      createTransferInstruction(
        backendAta,
        userAta,
        BACKEND_AUTHORITY,
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [BACKEND_WALLET]);
    res.json({ success: true, txid: sig });
  } catch (err) {
    console.error("❌ Mint error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🔥 Burn NFT from user account (as delegate)
app.post("/burn-nft", async (req, res) => {
  try {
    const { userPubkey, plan } = req.body;
    if (!userPubkey || !plan || !NFT_MINTS[plan]) {
      return res.status(400).json({ success: false, error: "Invalid input" });
    }

    const user = new PublicKey(userPubkey);
    const mint = NFT_MINTS[plan];

    const userAta = await getAssociatedTokenAddress(mint, user, false, TOKEN_2022_PROGRAM_ID);

    const tx = new Transaction().add(
      createBurnCheckedInstruction(
        userAta,           // source (user's token account)
        mint,              // NFT mint
        BACKEND_AUTHORITY, // delegate (your backend wallet)
        1,                 // amount
        0,                 // decimals (NFT = 0)
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [BACKEND_WALLET]);
    res.json({ success: true, txid: sig });
  } catch (err) {
    console.error("❌ Burn error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
