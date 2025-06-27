const express = require("express");
const cors = require("cors");
const {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");

const {
  getAssociatedTokenAddress,
  getAccount,
  createTransferInstruction,
  TOKEN_2022_PROGRAM_ID,
} = require("@solana/spl-token");

const app = express();
const PORT = process.env.PORT || 10000;

// CORS + JSON parsing
app.use(cors());
app.use(express.json());

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Load backend wallet from env-stored secret key array
const SECRET_KEY = JSON.parse(process.env.MINT_AUTHORITY_SECRET); // e.g. "[12,34,56,...]"
const BACKEND_WALLET = Keypair.fromSecretKey(Uint8Array.from(SECRET_KEY));
const BACKEND_AUTHORITY = BACKEND_WALLET.publicKey;

console.log("✅ Backend wallet:", BACKEND_AUTHORITY.toBase58());

// Fixed NFT mints
const NFT_MINTS = {
  "10GB": new PublicKey("GXsBcsscLxMRKLgwWWnKkUzuXdEXwr74NiSqJrBs21Mz"),
  "25GB": new PublicKey("HDtzBt6nvoHLhiV8KLrovhnP4pYesguq89J2vZZbn6kA"),
  "50GB": new PublicKey("C6is6ajmWgySMA4WpDfccadLf5JweXVufdXexWNrLKKD"),
};

// Mint endpoint: transfers 1 NFT from backend wallet to user
app.post("/mint-nft", async (req, res) => {
  try {
    const { userPubkey, plan } = req.body;
    if (!userPubkey || !plan || !NFT_MINTS[plan]) {
      return res.status(400).json({ success: false, error: "Invalid input" });
    }

    const user = new PublicKey(userPubkey);
    const mint = NFT_MINTS[plan];

    const backendAta = await getAssociatedTokenAddress(
      mint,
      BACKEND_AUTHORITY,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const userAta = await getAssociatedTokenAddress(
      mint,
      user,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const userAtaInfo = await connection.getAccountInfo(userAta);

    const tx = new (require("@solana/web3.js").Transaction)();

    if (!userAtaInfo) {
      const {
        createAssociatedTokenAccountInstruction,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      } = require("@solana/spl-token");

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

    const sig = await sendAndConfirmTransaction(connection, tx, [BACKEND_WALLET]);
    res.json({ success: true, txid: sig });
  } catch (err) {
    console.error("Mint error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Optional burn endpoint (if you want to allow server-side burning)
app.post("/burn-nft", async (req, res) => {
  try {
    const { userPubkey, plan } = req.body;
    if (!userPubkey || !plan || !NFT_MINTS[plan]) {
      return res.status(400).json({ success: false, error: "Invalid input" });
    }

    const user = new PublicKey(userPubkey);
    const mint = NFT_MINTS[plan];

    const userAta = await getAssociatedTokenAddress(
      mint,
      user,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const { createBurnInstruction } = require("@solana/spl-token");
    const tx = new (require("@solana/web3.js").Transaction)();

    tx.add(
      createBurnInstruction(
        userAta,
        mint,
        BACKEND_AUTHORITY, // backend is delegate
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [BACKEND_WALLET]);
    res.json({ success: true, txid: sig });
  } catch (err) {
    console.error("Burn error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
