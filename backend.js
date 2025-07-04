import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  burn,
  getAccount,
} from "@solana/spl-token";

app.post("/mint-nft", async (req, res) => {
  try {
    const { userPubkey, oldMintAddress } = req.body;
    if (!userPubkey) {
      return res.status(400).json({ success: false, error: "Missing userPubkey" });
    }

    const user = new PublicKey(userPubkey);

    // 🧨 Burn existing NFT if provided
    if (oldMintAddress) {
      const oldMint = new PublicKey(oldMintAddress);

      // Get user's token account for the old mint
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
        console.log("🔥 Burned old NFT:", burnSig);
      } else {
        console.log("ℹ️ Old NFT already burned or not present.");
      }
    }

    // 🎯 Mint new soulbound NFT
    const mint = await createMint(
      connection,
      BACKEND_WALLET,
      BACKEND_AUTHORITY,
      null, // ❗No freeze authority = cannot unlock
      0, // NFT = 0 decimals
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    console.log("✅ New mint:", mint.toBase58());

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

    res.json({ success: true, txid: sig, mint: mint.toBase58() });

  } catch (err) {
    console.error("❌ Mint error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
