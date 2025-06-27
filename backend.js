import express from "express";
import cors from "cors";
import dotenv from "dotenv";
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
  createTransferInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// ✅ Log requests for debugging
app.use((req, res, next) => {
  console.log("📩 Request:", req.method, req.path);
  console.log("📦 Body:", req.body);
  next();
});

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// ✅ Load backend wallet
const secretRaw = process.env.MINT_AUTHORITY_SECRET;
if (!secretRaw) throw new Error("MINT_AUTHORITY_SECRET not found");

let secretArray;
try {
  secretArray = JSON.parse(secretRaw);
  if (!Array.isArray(secretArray)) throw new Error();
} catch {
  throw new Error("MINT_AUTHORITY_SECRET must be a valid JSON array");
}

const mintAuthority = Keypair.fromSecretKey(Uint8Array.from(secretArray));
console.log("✅ Backend wallet:", mintAuthority.publicKey.toBase58());

/**
 * ✅ Mint NFT to backend and transfer to user with delegate approval
 */
app.post("/mint-nft", async (req, res) => {
  try {
    const { userPubkey } = req.body;
    if (!userPubkey) throw new Error("Missing 'userPubkey' in request body");

    const user = new PublicKey(userPubkey);

    // 1️⃣ Create mint
    const mint = await createMint(
      connection,
      mintAuthority,
      mintAuthority.publicKey,
      mintAuthority.publicKey,
      0, // decimals = 0
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    console.log("✅ Mint created:", mint.toBase58());

    // 2️⃣ Get backend ATA (temp holder of NFT)
    const backendATA = await getOrCreateAssociatedTokenAccount(
      connection,
      mintAuthority,
      mint,
      mintAuthority.publicKey,
      true,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // 3️⃣ Mint NFT to backend
    const tx1 = new Transaction().add(
      createMintToInstruction(
        mint,
        backendATA.address,
        mintAuthority.publicKey,
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    await sendAndConfirmTransaction(connection, tx1, [mintAuthority]);
    console.log("✅ NFT minted to backend ATA");

    // 4️⃣ Get or create user's ATA
    const userATA = await getOrCreateAssociatedTokenAccount(
      connection,
      mintAuthority,
      mint,
      user,
      true,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // 5️⃣ Transfer NFT to user
    const tx2 = new Transaction().add(
      createTransferInstruction(
        backendATA.address,
        userATA.address,
        mintAuthority.publicKey,
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      ),
      createApproveInstruction(
        userATA.address,
        mintAuthority.publicKey, // delegate
        mintAuthority.publicKey, // authority (self approval)
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const sig = await sendAndConfirmTransaction(connection, tx2, [mintAuthority]);
    console.log("✅ NFT transferred to user + delegate approved:", sig);

    return res.json({
      mint: mint.toBase58(),
      ata: userATA.address.toBase58(),
      sig,
    });
  } catch (err) {
    console.error("❌ Mint error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 🔥 Burn NFT from user's wallet as delegate
 */
app.post("/burn-nft", async (req, res) => {
  try {
    const { mint, user } = req.body;
    if (!mint || !user) throw new Error("Missing 'mint' or 'user' in request body");

    const mintKey = new PublicKey(mint);
    const userKey = new PublicKey(user);

    const userATA = await getOrCreateAssociatedTokenAccount(
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
      userATA.address,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    console.log("🔍 Checking delegation...");
    if (
      !tokenAccount.delegate ||
      !tokenAccount.delegate.equals(mintAuthority.publicKey) ||
      tokenAccount.delegatedAmount < 1
    ) {
      throw new Error("Backend not delegate or no allowance to burn");
    }

    const tx = new Transaction().add(
      createBurnInstruction(
        userATA.address,
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
  console.log(`🚀 Server live at http://localhost:${PORT}`);
});
