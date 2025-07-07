// backend.js
import fs from "fs";
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

dotenv.config();

// 📜 JSON logger
function logEventJSON(entry) {
  const existing = fs.existsSync("mint-log.json")
    ? JSON.parse(fs.readFileSync("mint-log.json", "utf-8"))
    : [];
  existing.push({ ...entry, timestamp: new Date().toISOString() });
  fs.writeFileSync("mint-log.json", JSON.stringify(existing, null, 2));
}

const app = express();
app.use(cors());
app.use(express.json());

// 🔌 Solana devnet connection
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// 🔐 Load backend mint authority wallet
const secretString = process.env.MINT_AUTHORITY_SECRET;
if (!secretString) throw new Error("Missing MINT_AUTHORITY_SECRET in .env");
const secret = JSON.parse(secretString);
const BACKEND_WALLET = Keypair.fromSecretKey(Uint8Array.from(secret));
const BACKEND_AUTHORITY = BACKEND_WALLET.publicKey;

console.log("✅ Backend wallet loaded:", BACKEND_AUTHORITY.toBase58());

// 🎫 NFT plan mint addresses
const NFT_MINTS = {
  "10GB": new PublicKey("GXsBcsscLxMRKLgwWWnKkUzuXdEXwr74NiSqJrBs21Mz"),
  "25GB": new PublicKey("HDtzBt6nvoHLhiV8KLrovhnP4pYesguq89J2vZZbn6kA"),
  "50GB": new PublicKey("C6is6ajmWgySMA4WpDfccadLf5JweXVufdXexWNrLKKD"),
};

// 🔒 Soulbound NFT mint address
const SOULBOUND_MINT = new PublicKey("BGZPPAY2jJ1rgFNhRkHKjPVmxx1VFUisZSo569Pi71Pc");

// 🪙 Mint data plan NFT
app.post("/mint-nft", async (req, res) => {
  try {
    const { userPubkey, plan, oldMintAddress } = req.body;
    if (!userPubkey || !plan || !NFT_MINTS[plan]) {
      return res.status(400).json({ success: false, error: "Invalid request" });
    }

    const user = new PublicKey(userPubkey);
    const mint = NFT_MINTS[plan];

    // 🔥 Optional: burn old NFT if provided
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
        console.log(`🔥 Burned old NFT (${oldMintAddress}) for ${userPubkey}: ${burnSig}`);
        logEventJSON({ type: "burn", wallet: userPubkey, mint: oldMintAddress, tx: burnSig });
      }
    }

    // 🎯 Mint new NFT
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

    console.log(`✅ Minted ${plan} NFT to ${userPubkey}: ${sig}`);
    logEventJSON({ type: "normal-nft-mint", wallet: userPubkey, plan, mint: mint.toBase58(), tx: sig });

    res.json({ success: true, txid: sig, mint: mint.toBase58() });
  } catch (err) {
    console.error("❌ Mint error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🎁 Claim soulbound NFT
app.post("/mint-soulbound", async (req, res) => {
  try {
    const { userPubkey } = req.body;
    if (!userPubkey) return res.status(400).json({ success: false, error: "Missing userPubkey" });

    const user = new PublicKey(userPubkey);

    const soulboundAta = await getOrCreateAssociatedTokenAccount(
      connection,
      BACKEND_WALLET,
      SOULBOUND_MINT,
      user,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const soulboundAccount = await getAccount(
      connection,
      soulboundAta.address,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    ).catch(() => null);

    if (soulboundAccount && Number(soulboundAccount.amount) > 0) {
      return res.status(400).json({ success: false, error: "Already owns soulbound NFT" });
    }

    let hasValidNFT = false;
    for (const mint of Object.values(NFT_MINTS)) {
      try {
        const ata = await getOrCreateAssociatedTokenAccount(
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

        const account = await getAccount(
          connection,
          ata.address,
          "confirmed",
          TOKEN_2022_PROGRAM_ID
        );

        if (Number(account.amount) > 0) {
          hasValidNFT = true;
          break;
        }
      } catch (_) {}
    }

    if (!hasValidNFT) {
      return res.status(400).json({ success: false, error: "User does not own any valid NFT plan" });
    }

    const sig = await mintTo(
      connection,
      BACKEND_WALLET,
      SOULBOUND_MINT,
      soulboundAta.address,
      BACKEND_AUTHORITY,
      1,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    console.log(`🔒 Soulbound NFT minted to ${userPubkey}: ${sig}`);
    logEventJSON({ type: "soulbound-mint", wallet: userPubkey, mint: SOULBOUND_MINT.toBase58(), tx: sig });

    res.json({ success: true, txid: sig });
  } catch (err) {
    console.error("❌ Soulbound mint error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🌐 Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
