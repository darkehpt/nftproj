import express from "express";
import cors from "cors";
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  burn,
  getAccount,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import dotenv from "dotenv";
import bs58 from "bs58";

dotenv.config();

// 🔧 Config
const app = express();
app.use(cors());
app.use(express.json());

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// ⚠️ Load backend wallet from secret key (store safely!)
const secret = process.env.BACKEND_SECRET_KEY;
if (!secret) throw new Error("Missing BACKEND_SECRET_KEY in .env");
const BACKEND_WALLET = Keypair.fromSecretKey(bs58.decode(secret));
const BACKEND_AUTHORITY = BACKEND_WALLET.publicKey;

console.log("✅ Backend wallet:", BACKEND_AUTHORITY.toBase58());

// 🧿 Mint Soulbound NFT (burn old one if provided)
app.post("/mint-nft", async (req, res) => {
  try {
    const { userPubkey, oldMintAddress } = req.body;
    if (!userPubkey) {
      return res.status(400).json({ success: false, error: "Missing userPubkey" });
    }

    const user = new PublicKey(userPubkey);

    // 🧨 Burn old NFT
    if (oldMintAddress) {
      const oldMint = new PublicKey(oldMintAddress);
      const oldTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        BACKEND_WALLET,
        oldMint,
        user,
        false,
        "confirmed",
        undefined,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const tokenAccountInfo = await getAccount(
        connection,
        oldTokenAccount.address,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );

      if (Number(tokenAccountInfo.amount) > 0) {
        const burnSig = await burn(
          connection,
          BACKEND_WALLET,
          oldTokenAccount.address,
          oldMint,
          BACKEND_AUTHORITY,
          1,
          [],
          undefined,
          TOKEN_2022_PROGRAM_ID
        );
        console.log("🔥 Burned old NFT:", burnSig);
      } else {
        console.log("ℹ️ Old NFT already burned or not found.");
      }
    }

    // 🪙 Create new mint (soulbound = no freeze authority)
    const mint = await createMint(
      connection,
      BACKEND_WALLET,
      BACKEND_AUTHORITY,
      null,
      0,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    console.log("✅ New mint:", mint.toBase58());

    const userAta = await getOrCreateAssociatedTokenAccount(
      connection,
      BACKEND_WALLET,
      mint,
      user,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const sig = await mintTo(
      connection,
      BACKEND_WALLET,
      mint,
      userAta.address,
      BACKEND_AUTHORITY,
      1,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    res.json({ success: true, txid: sig, mint: mint.toBase58() });
  } catch (err) {
    console.error("❌ Mint error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🟢 Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
