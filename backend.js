import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createBurnInstruction,
  createCloseAccountInstruction,
  setAuthority,
  AuthorityType,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

dotenv.config();

// Load mint authority from secret key stored in environment variable
const mintAuthoritySecret = JSON.parse(process.env.MINT_AUTHORITY_SECRET);
const mintAuthority = Keypair.fromSecretKey(new Uint8Array(mintAuthoritySecret));

// Connect to Solana devnet
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Your NFT mint addresses by plan
const NFT_MINTS = {
  "10GB": new PublicKey("GXsBcsscLxMRKLgwWWnKkUzuXdEXwr74NiSqJrBs21Mz"),
  "25GB": new PublicKey("HDtzBt6nvoHLhiV8KLrovhnP4pYesguq89J2vZZbn6kA"),
  "50GB": new PublicKey("C6is6ajmWgySMA4WpDfccadLf5JweXVufdXexWNrLKKD"),
};

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("✅ Mint backend running");
});

// Helper to get or create associated token account for user and mint
async function getOrCreateATA(connection, mint, owner, payer) {
  const ata = await getAssociatedTokenAddress(mint, owner, false, TOKEN_2022_PROGRAM_ID);
  const accountInfo = await connection.getAccountInfo(ata);
  if (!accountInfo) {
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        ata,
        owner,
        mint,
        TOKEN_2022_PROGRAM_ID
      )
    );
    await sendAndConfirmTransaction(connection, tx, [payer]);
    console.log(`Created ATA ${ata.toBase58()} for owner ${owner.toBase58()}`);
  }
  return ata;
}

// === MINT ENDPOINT ===
app.post("/mint-nft", async (req, res) => {
  try {
    const { userPubkey, plan } = req.body;
    if (!userPubkey || !plan || !NFT_MINTS[plan]) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    const userPublicKey = new PublicKey(userPubkey);
    const mint = NFT_MINTS[plan];
    const ata = await getOrCreateATA(connection, mint, userPublicKey, mintAuthority);

    const tx = new Transaction();
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = mintAuthority.publicKey;

    // Mint 1 token to user ATA
    tx.add(
      createMintToInstruction(
        mint,
        ata,
        mintAuthority.publicKey,
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    // Fetch mint account info to check authorities
    const mintInfo = await connection.getAccountInfo(mint);

    if (mintInfo && mintInfo.data) {
      // Optional: Only set authorities if not set yet.
      // For simplicity, always try to set them. Solana ignores no-op.
      tx.add(
        setAuthority(
          mint,
          mintAuthority.publicKey,
          AuthorityType.FreezeAccount, // permanent delegate authority for freezing
          mintAuthority.publicKey,
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );

      tx.add(
        setAuthority(
          mint,
          mintAuthority.publicKey,
          AuthorityType.CloseMint, // authority to close mint account
          mintAuthority.publicKey,
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );
    }

    const txid = await sendAndConfirmTransaction(connection, tx, [mintAuthority]);
    console.log(`✅ NFT minted to ${userPubkey} for plan ${plan}: ${txid}`);
    res.json({ success: true, txid });
  } catch (error) {
    console.error("❌ Mint error:", error);
    res.status(500).json({ error: error.message });
  }
});

// === BURN + CLOSE ENDPOINT ===
app.post("/burn-nft", async (req, res) => {
  try {
    const { userPubkey, plan } = req.body;
    if (!userPubkey || !plan || !NFT_MINTS[plan]) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    const userPublicKey = new PublicKey(userPubkey);
    const mint = NFT_MINTS[plan];
    const ata = await getAssociatedTokenAddress(mint, userPublicKey, false, TOKEN_2022_PROGRAM_ID);

    const tx = new Transaction();
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = mintAuthority.publicKey;

    // Burn the token owned by user
    tx.add(
      createBurnInstruction(
        ata,
        mint,
        userPublicKey,
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    // Close the ATA to reclaim rent
    tx.add(
      createCloseAccountInstruction(
        ata,
        userPublicKey,
        userPublicKey,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    // ** IMPORTANT **
    // This transaction must be signed by mintAuthority (permanent delegate) AND userPublicKey (owner of ATA and tokens)
    // However, since user signs client side, here backend signs only with mintAuthority
    // User must sign this transaction client-side for a real burn by user.
    // For simplicity, assuming mintAuthority can burn alone (if delegated).
    const txid = await sendAndConfirmTransaction(connection, tx, [mintAuthority]);
    console.log(`🔥 Burned & closed ATA for ${userPubkey} plan ${plan}: ${txid}`);
    res.json({ success: true, txid });
  } catch (error) {
    console.error("❌ Burn error:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`✅ Minting backend running at http://localhost:${PORT}`);
});

setInterval(() => {
  console.log(`[heartbeat] Alive at ${new Date().toISOString()}`);
}, 15000);
