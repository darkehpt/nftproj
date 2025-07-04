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

app.use(
  cors({
    origin: "https://nftproj-frans-projects-d13b4cab.vercel.app",
    methods: ["POST"],
    allowedHeaders: ["Content-Type"],
  })
);
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

// 🔐 Soulbound NFT mint address
const SOULBOUND_MINT = new PublicKey("4AxWE45GUvgWj7c6F2JGvMQNMqkGAduxBBDPcJ2YsbwA");

// Helper: Check if user owns any plan NFT
async function userOwnsPlanNFT(userPubkey) {
  for (const mint of Object.values(NFT_MINTS)) {
    try {
      const ata = await getAssociatedTokenAddress(mint, userPubkey, false, TOKEN_2022_PROGRAM_ID);
      const accountInfo = await connection.getAccountInfo(ata);
      if (accountInfo) {
        // Parse token amount from account data (Token-2022)
        // To get amount, use spl-token's getAccount method for proper parsing
        // But getAccount requires connection, so:
        const tokenAccount = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
        if (tokenAccount.amount > 0n) return true;
      }
    } catch {
      // No token account or error, ignore and check next
    }
  }
  return false;
}

// 🚀 Mint plan NFT to user
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
    console.log("Attempting to transfer from:", sourceTokenAccount.address.toBase58());
    console.log("Balance in source:", sourceTokenAccount.amount.toString());
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
        userAta,
        mint,
        BACKEND_AUTHORITY,
        1,
        0,
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

// 🔒 Mint soulbound NFT to user
app.post("/mint-soulbound", async (req, res) => {
  try {
    const { userPubkey } = req.body;
    if (!userPubkey) {
      return res.status(400).json({ success: false, error: "Missing userPubkey" });
    }

    const user = new PublicKey(userPubkey);

    // Check if user already owns soulbound NFT
    const soulboundAta = await getAssociatedTokenAddress(SOULBOUND_MINT, user, false, TOKEN_2022_PROGRAM_ID);
    const soulboundAccountInfo = await connection.getAccountInfo(soulboundAta);
    if (soulboundAccountInfo) {
      // Get token amount from account info:
      const soulboundTokenAccount = await getAccount(connection, soulboundAta, "confirmed", TOKEN_2022_PROGRAM_ID);
      if (soulboundTokenAccount.amount > 0n) {
        return res.status(400).json({ success: false, error: "Soulbound NFT already owned" });
      }
    }

    // Check if user owns at least one plan NFT
    const ownsPlan = await userOwnsPlanNFT(user);
    if (!ownsPlan) {
      return res.status(400).json({ success: false, error: "You must own a plan NFT to claim the soulbound NFT" });
    }

    const backendAta = await getAssociatedTokenAddress(SOULBOUND_MINT, BACKEND_AUTHORITY, false, TOKEN_2022_PROGRAM_ID);
    const userAta = await getAssociatedTokenAddress(SOULBOUND_MINT, user, false, TOKEN_2022_PROGRAM_ID);
    const userAtaInfo = await connection.getAccountInfo(userAta);

    const tx = new Transaction();

    if (!userAtaInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          BACKEND_AUTHORITY,
          userAta,
          user,
          SOULBOUND_MINT,
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
    console.error("❌ Soulbound mint error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
