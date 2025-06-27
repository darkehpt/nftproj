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
  getOrCreateAssociatedTokenAccount,
  createBurnInstruction,
  createApproveInstruction,
  getAccount,
  createTransferInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

dotenv.config();
const app = express();

// CORS Setup: Allow your frontend origins
const allowedOrigins = [
  "http://localhost:3000", // local dev frontend
  "https://nftproj-frans-projects-d13b4cab.vercel.app", // deployed frontend
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow REST tools or curl
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `CORS policy: Origin ${origin} not allowed`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));
app.options("*", cors()); // enable pre-flight

app.use(express.json());

// Log requests for debugging
app.use((req, res, next) => {
  console.log("📩 Request:", req.method, req.path);
  console.log("📦 Body:", req.body);
  next();
});

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Load backend wallet from env secret
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

// Predefined mint addresses for each plan (replace with your actual mint addresses)
const PREDEFINED_MINTS = {
  "10GB": new PublicKey("GXsBcsscLxMRKLgwWWnKkUzuXdEXwr74NiSqJrBs21Mz"),
  "25GB": new PublicKey("HDtzBt6nvoHLhiV8KLrovhnP4pYesguq89J2vZZbn6kA"),
  "50GB": new PublicKey("C6is6ajmWgySMA4WpDfccadLf5JweXVufdXexWNrLKKD"),
};

/**
 * Transfer 1 token from backend ATA to user ATA
 */
app.post("/mint-nft", async (req, res) => {
  try {
    const { userPubkey, plan } = req.body;
    if (!userPubkey) throw new Error("Missing 'userPubkey'");
    if (!plan || !PREDEFINED_MINTS[plan]) throw new Error("Invalid or missing 'plan'");

    const user = new PublicKey(userPubkey);
    const mint = PREDEFINED_MINTS[plan];

    // 1️⃣ Get or create backend ATA for this mint
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

    // 2️⃣ Get or create user ATA for this mint
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

    // 3️⃣ Transfer 1 token from backend ATA to user ATA
    const transferTx = new Transaction().add(
      createTransferInstruction(
        backendATA.address,
        userATA.address,
        mintAuthority.publicKey,
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const sig = await sendAndConfirmTransaction(connection, transferTx, [mintAuthority]);
    console.log("✅ NFT transferred to user:", sig);

    return res.json({
      success: true,
      mint: mint.toBase58(),
      ata: userATA.address.toBase58(),
      txid: sig,
    });
  } catch (err) {
    console.error("❌ Mint error:", err);
    return res.status(500).json({ error: err.message, success: false });
  }
});

/**
 * Burn NFT from user's wallet as delegate
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

    return res.json({ success: true, sig });
  } catch (err) {
    console.error("❌ Burn error:", err);
    return res.status(500).json({ error: err.message, success: false });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server live at http://localhost:${PORT}`);
});
