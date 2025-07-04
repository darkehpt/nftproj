import express from "express";
import cors from "cors";
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
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

// 🔧 Express app setup
const app = express();
app.use(cors());
app.use(express.json());

// 🕸️ Solana connection (devnet)
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// ⚠️ Load backend wallet from secret key stored as JSON array string in .env
const secretString = process.env.MINT_AUTHORITY_SECRET;
if (!secretString) throw new Error("Missing MINT_AUTHORITY_SECRET in .env");
const secret = JSON.parse(secretString);
const BACKEND_WALLET = Keypair.fromSecretKey(Uint8Array.from(secret));
const BACKEND_AUTHORITY = BACKEND_WALLET.publicKey;

console.log("✅ Backend wallet loaded:", BACKEND_AUTHORITY.toBase58());

// Your predefined NFT mints for plans
const NFT_MINTS = {
  "10GB": new PublicKey("GXsBcsscLxMRKLgwWWnKkUzuXdEXwr74NiSqJrBs21Mz"),
  "25GB": new PublicKey("HDtzBt6nvoHLhiV8KLrovhnP4pYesguq89J2vZZbn6kA"),
  "50GB": new PublicKey("C6is6ajmWgySMA4WpDfccadLf5JweXVufdXexWNrLKKD"),
};

app.post("/mint-nft", async (req, res) => {
  try {
    const { userPubkey, plan, oldMintAddress } = req.body;

    if (!userPubkey) {
      return res.status(400).json({ success: false, error: "Missing userPubkey" });
    }
    if (!plan || !NFT_MINTS[plan]) {
      return res.status(400).json({ success: false, error: "Invalid or missing plan" });
    }

    const user = new PublicKey(userPubkey);
    const mint = NFT_MINTS[plan];

    // Burn old NFT if provided
    if (oldMintAddress) {
      const oldMint = new PublicKey(oldMintAddress);

      // Get or create user's ATA for old mint
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

      // Check token account balance
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

    // Get or create user's ATA for the mint
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

    // Mint 1 token to user ATA
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

    console.log(`✅ Minted 1 token from plan ${plan} mint:`, sig);

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
