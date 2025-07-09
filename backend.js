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
  getAccount,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import dotenv from "dotenv";
dotenv.config();
import nacl from "tweetnacl";

function verifyWalletSignature({ wallet, message, signature }) {
  try {
    const pubkey = new PublicKey(wallet);
    const encodedMsg = new TextEncoder().encode(message);
    const sigBytes = Buffer.from(signature, "base64");

    return nacl.sign.detached.verify(encodedMsg, sigBytes, pubkey.toBytes());
  } catch (err) {
    return false;
  }
}

// 📜 JSON logger
function logEventJSON(entry) {
  let existing = [];
  try {
    if (fs.existsSync("mint-log.json")) {
      const content = fs.readFileSync("mint-log.json", "utf-8");
      existing = content ? JSON.parse(content) : [];
    }
  } catch (err) {
    console.warn("⚠️ Failed to read or parse mint-log.json. Overwriting log file.");
  }

  existing.push({ ...entry, timestamp: new Date().toISOString() });

  try {
    fs.writeFileSync("mint-log.json", JSON.stringify(existing, null, 2));
  } catch (err) {
    console.error("❌ Failed to write mint-log.json:", err);
  }
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
    const { userPubkey, plan, message, signature } = req.body;
  if (!userPubkey || !plan || !NFT_MINTS[plan] || !message || !signature) {
    return res.status(400).json({ success: false, error: "Invalid request" });
  }

  // ✅ Check that message and signature are valid
  if (!verifyWalletSignature({ wallet: userPubkey, message, signature })) {
    return res.status(401).json({ success: false, error: "Invalid signature" });
  }

    const user = new PublicKey(userPubkey);
    const mint = NFT_MINTS[plan];

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

    const mintSig = await mintTo(
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

    const mintLog = {
      type: "normal-nft-mint",
      wallet: userPubkey,
      plan,
      mint: mint.toBase58(),
      tx: mintSig,
    };
    console.log(`✅ Minted ${plan} NFT to ${userPubkey}: ${mintSig}`);
    logEventJSON(mintLog);

    res.json({ success: true, txid: mintSig, mint: mint.toBase58() });
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

    // ✅ Check user owns at least one valid plan NFT
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

    const sbLog = {
      type: "soulbound-mint",
      wallet: userPubkey,
      mint: SOULBOUND_MINT.toBase58(),
      tx: sig,
    };
    console.log(`🔒 Soulbound NFT minted to ${userPubkey}: ${sig}`);
    logEventJSON(sbLog);

    res.json({ success: true, txid: sig });
  } catch (err) {
    console.error("❌ Soulbound mint error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
// 🔥 Log frontend-confirmed burn
app.post("/log-burn", async (req, res) => {
  try {
    const { userPubkey, mint, txid } = req.body;
    if (!userPubkey || !mint || !txid) {
      return res.status(400).json({ success: false, error: "Missing fields in burn log" });
    }

    const burnLog = {
      type: "user-initiated-burn",
      wallet: userPubkey,
      mint,
      tx: txid,
    };

    console.log(`🧾 Received frontend burn log from ${userPubkey}: ${txid}`);
    logEventJSON(burnLog);

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Burn log error:", err);
    res.status(500).json({ success: false, error: "Failed to log burn" });
  }
});
// 🌐 Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
app.use((err, req, res, next) => {
  console.error("❗ Uncaught backend error:", err);
  res.status(500).json({ success: false, error: "Unexpected server error" });
});
