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
  getAccount,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Load backend wallet from secret key
const secret = process.env.PRIVATE_KEY;
if (!secret) {
  throw new Error("PRIVATE_KEY not found in .env file");
}
const mintAuthority = Keypair.fromSecretKey(bs58.decode(secret));

console.log("✅ Backend authority pubkey:", mintAuthority.publicKey.toBase58());

/**
 * ✅ Mint a Token-2022 NFT to user
 * Note: Does NOT set backend as delegate — user must do this on frontend.
 */
 app.post("/mint-nft", async (req, res) => {
   try {
     const { user } = req.body;
     if (!user) throw new Error("Missing 'user' in request body");

     const userPublicKey = new PublicKey(user);

     // Create Token-2022 Mint (0 decimals = NFT) with backend as mint + close authority
     const mint = await createMint(
       connection,
       mintAuthority,
       mintAuthority.publicKey, // mint authority
       mintAuthority.publicKey, // ✅ set backend as close authority too
       0,
       undefined,
       undefined,
       TOKEN_2022_PROGRAM_ID
     );

     console.log("✅ Mint created:", mint.toBase58());

     // Get/Create user's ATA for this mint
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

     // ✅ Mint + Approve backend as delegate in one transaction
     const tx = new Transaction();

     // Mint 1 token to user's ATA
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

     // ✅ Approve backend as delegate with full authority to burn (allowance = 1)
     tx.add(
       createApproveInstruction(
         ata.address,
         mintAuthority.publicKey, // delegate (us)
         userPublicKey, // owner (user must sign, but we bypass since we're minting for them)
         1,
         [],
         TOKEN_2022_PROGRAM_ID
       )
     );

     // Send TX (only mintAuthority signs, user doesn't need to sign)
     const sig = await sendAndConfirmTransaction(connection, tx, [mintAuthority]);

     console.log("✅ Minted and delegate approved in tx:", sig);

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
 * Requires that user has previously approved backend as delegate via frontend.
 */
app.post("/burn-nft", async (req, res) => {
  try {
    const { mint, user } = req.body;
    if (!mint || !user) throw new Error("Missing 'mint' or 'user' in request body");

    const mintKey = new PublicKey(mint);
    const userKey = new PublicKey(user);

    // Get user's ATA
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

    // 🛡️ Confirm backend is approved delegate
    const tokenAccount = await getAccount(connection, ata.address, "confirmed", TOKEN_2022_PROGRAM_ID);

    if (
      !tokenAccount.delegate ||
      !tokenAccount.delegate.equals(mintAuthority.publicKey) ||
      tokenAccount.delegatedAmount < 1
    ) {
      throw new Error(
        "Backend wallet is NOT approved delegate for this token account. User must approve via frontend first."
      );
    }

    // 🔥 Burn instruction
    const tx = new Transaction().add(
      createBurnInstruction(
        ata.address,
        mintKey,
        mintAuthority.publicKey, // Delegate
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
app.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});
