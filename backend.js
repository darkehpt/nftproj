// backend.js
import express from "express";
import cors from "cors";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  createMintToInstruction,
  createBurnInstruction,
  createApproveInstruction,
  getAccount,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Log all request bodies for debugging
app.use((req, res, next) => {
  console.log("📩 Incoming request:", req.method, req.path);
  console.log("📦 Body:", req.body);
  next();
});

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// ✅ Load backend wallet from environment variable as JSON array
const secretRaw = process.env.MINT_AUTHORITY_SECRET;
if (!secretRaw) {
  throw new Error("MINT_AUTHORITY_SECRET not found in environment");
}

let secretArray;
try {
  secretArray = JSON.parse(secretRaw);
  if (!Array.isArray(secretArray)) throw new Error();
} catch {
  throw new Error("MINT_AUTHORITY_SECRET must be a valid JSON array string (e.g. [123, 34, ...])");
}

const mintAuthority = Keypair.fromSecretKey(Uint8Array.from(secretArray));
console.log("✅ Backend authority pubkey:", mintAuthority.publicKey.toBase58());

/**
 * ✅ Mint a Token-2022 NFT to user
 */
app.post("/mint-nft", async (req, res) => {
  try {
    const { userPubkey: user } = req.body;
    if (!user) throw new Error("Missing 'user' in request body");

    const userPublicKey = new PublicKey(user);

    const mint = await createMint(
      connection,
      mintAuthority,
      mintAuthority.publicKey,
      mintAuthority.publicKey,
      0,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    console.log("✅ Mint created:", mint.toBase58());

    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      mintAuthority,
      mint,
      userPublicKey,
      true,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    const tx = new Transaction();

    tx.add(
      createMintToInstruction(
        mint,
        ata.address,
        mintAuthority.publicKey,
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    tx.add(
      createApproveInstruction(
        ata.address,
        mintAuthority.publicKey, // delegate
        mintAuthority.publicKey, // authority (us)
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [mintAuthority]);

    console.log("✅ Minted + delegate approved in tx:", sig);

    return res.json({
      mint: mint.toBase58(),
      ata: ata.address.toBase58(),
      sig,
    });
  } catch (err) {
    console.error("❌ Mint error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 🔥 Burn NFT
 */
app.post("/burn-nft", async (req, res) => {
  try {
    const { mint, user } = req.body;
    if (!mint || !user) throw new Error("Missing 'mint' or 'user' in request body");

    const mintKey = new PublicKey(mint);
    const userKey = new PublicKey(user);

    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      mintAuthority,
      mintKey,
      userKey,
      true,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    const tokenAccount = await getAccount(
      connection,
      ata.address,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    if (
      !tokenAccount.delegate ||
      !tokenAccount.delegate.equals(mintAuthority.publicKey) ||
      tokenAccount.delegatedAmount < 1
    ) {
      throw new Error("Backend is not delegate or has no allowance to burn");
    }

    const tx = new Transaction().add(
      createBurnInstruction(
        ata.address,
        mintKey,
        mintAuthority.publicKey,
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [mintAuthority]);

    console.log("🔥 Burned NFT in tx:", sig);
    return res.json({ sig });
  } catch (err) {
    console.error("❌ Burn error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// 🚀 Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
