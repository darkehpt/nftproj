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
  getAccount,
  createTransferInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

dotenv.config();

const app = express();

// CORS Setup - allow your frontend origins
const allowedOrigins = [
  "http://localhost:3000",
  "https://nftproj-frans-projects-d13b4cab.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow REST clients like curl or Postman
      if (!allowedOrigins.includes(origin)) {
        return callback(new Error(`CORS policy: Origin ${origin} not allowed`), false);
      }
      return callback(null, true);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.options("*", cors()); // enable pre-flight requests

app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log("📩 Request:", req.method, req.path);
  console.log("📦 Body:", req.body);
  next();
});

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Load backend wallet from env secret
const secretRaw = process.env.MINT_AUTHORITY_SECRET;
if (!secretRaw) throw new Error("MINT_AUTHORITY_SECRET not found in env");

let secretArray;
try {
  secretArray = JSON.parse(secretRaw);
  if (!Array.isArray(secretArray)) throw new Error();
} catch {
  throw new Error("MINT_AUTHORITY_SECRET must be a valid JSON array");
}

const mintAuthority = Keypair.fromSecretKey(Uint8Array.from(secretArray));
console.log("✅ Backend wallet loaded:", mintAuthority.publicKey.toBase58());

// Predefined mint addresses for plans (replace with your real mints)
const PREDEFINED_MINTS = {
  "10GB": new PublicKey("GXsBcsscLxMRKLgwWWnKkUzuXdEXwr74NiSqJrBs21Mz"),
  "25GB": new PublicKey("HDtzBt6nvoHLhiV8KLrovhnP4pYesguq89J2vZZbn6kA"),
  "50GB": new PublicKey("C6is6ajmWgySMA4WpDfccadLf5JweXVufdXexWNrLKKD"),
};

/**
 * Transfer 1 NFT token from backend ATA to user ATA
 */
app.post("/mint-nft", async (req, res) => {
  try {
    const { userPubkey, plan } = req.body;
    if (!userPubkey) throw new Error("Missing 'userPubkey'");
    if (!plan || !PREDEFINED_MINTS[plan]) throw new Error("Invalid or missing 'plan'");

    const user = new PublicKey(userPubkey);
    const mint = PREDEFINED_MINTS[plan];

    // Get or create backend ATA for mint
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

    // Get or create user ATA for mint
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

    // Check backend ATA balance to prevent transfer failures
    const backendAccountInfo = await getAccount(connection, backendATA.address, "confirmed", TOKEN_2022_PROGRAM_ID);
    if (backendAccountInfo.amount < BigInt(1)) {
      throw new Error(`Backend ATA has insufficient tokens for mint ${mint.toBase58()}`);
    }

    // Transfer 1 token from backend ATA to user ATA
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
    if (!mint || !user) throw new Error("Missing 'mint' or 'user'");

    const mintKey = new PublicKey(mint);
    const userKey = new PublicKey(user);

    // Get or create user ATA for mint
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

    // Fetch user token account info
    const tokenAccount = await getAccount(connection, userATA.address, "confirmed", TOKEN_2022_PROGRAM_ID);

    // Check if backend is delegate with allowance >= 1
    if (
      !tokenAccount.delegate ||
      !tokenAccount.delegate.equals(mintAuthority.publicKey) ||
      tokenAccount.delegatedAmount < BigInt(1)
    ) {
      throw new Error("Backend wallet is not delegate or has insufficient allowance to burn");
    }

    // Burn 1 token from user ATA
    const burnTx = new Transaction().add(
      createBurnInstruction(
        userATA.address,
        mintKey,
        mintAuthority.publicKey,
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const sig = await sendAndConfirmTransaction(connection, burnTx, [mintAuthority]);
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
