import React, { useState, useEffect } from "react";
import {
  Connection,
  PublicKey,
  clusterApiUrl,
  Transaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  createMintToInstruction,
  createBurnInstruction,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { useWallet, ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";

// Import your local images here
import pass1 from "./utils/pass1.png";
import pass2 from "./utils/pass2.png";
import pass3 from "./utils/pass3.png";

// --- CONFIG ---
const CONNECTION = new Connection(clusterApiUrl("devnet"), "confirmed");
const USDC_MINT = new PublicKey("2wpnySC7n6Zp5DFWLAucno9nQpJBZYdVU6TMNHo3UAkN");
const RECEIVER_USDC = new PublicKey("64MWbWRdtrE8Rvr3Un59CQ4x3q11ZQHhdRbvtvmw81MG");
const PLAN_PRICES = { "10GB": 0.1, "25GB": 0.25, "50GB": 0.5 };
const NFT_MINTS = {
  "10GB": new PublicKey("CY6bLqxa4sjxtFctujQUMDwrSR3bsPWyYG22C2dtVP6G"),
  "25GB": new PublicKey("D3VtXx5HN7AWFz9kT1QbhowpJc8GMhqrwV95fbArjCPX"),
  "50GB": new PublicKey("DHHmw8tMW2sFZPTfdfpZszP5gkoiiEyuazqBp6rq58aZ"),
};

// Map plan to imported images
const PLAN_IMAGES = {
  "10GB": pass1,
  "25GB": pass2,
  "50GB": pass3,
};

async function getOrCreateATA(connection, mint, owner, payer, tx, tokenProgramId) {
  const ata = await getAssociatedTokenAddress(mint, owner, false, tokenProgramId);
  try {
    await getAccount(connection, ata, "confirmed", tokenProgramId);
  } catch (err) {
    if (err.name === "TokenAccountNotFoundError") {
      tx.add(
        createAssociatedTokenAccountInstruction(
          payer,
          ata,
          owner,
          mint,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    } else {
      throw err;
    }
  }
  return ata;
}

const App = () => {
  const wallet = useWallet();
  const [plan, setPlan] = useState("10GB");
  const [status, setStatus] = useState("");
  const [nftBalance, setNftBalance] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fetch NFT balance helper
  const fetchNftBalance = async () => {
    if (!wallet.connected || !wallet.publicKey) {
      setNftBalance(0);
      return;
    }
    try {
      const mint = NFT_MINTS[plan];
      const ata = await getAssociatedTokenAddress(mint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const accountInfo = await getAccount(CONNECTION, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
      setNftBalance(Number(accountInfo.amount));
    } catch (err) {
      console.warn("[fetchNftBalance] Error fetching NFT balance:", err);
      setNftBalance(0);
    }
  };

  useEffect(() => {
    fetchNftBalance();
  }, [wallet.connected, wallet.publicKey, plan]);

  const handlePayAndMint = async () => {
    if (loading) return;
    if (!wallet.connected || !wallet.publicKey) {
      setStatus("Please connect your wallet first.");
      return;
    }
    setLoading(true);
    setStatus("Starting payment and minting...");

    try {
      const tx = new Transaction();
      const { blockhash } = await CONNECTION.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      const userUsdcAta = await getOrCreateATA(
        CONNECTION,
        USDC_MINT,
        wallet.publicKey,
        wallet.publicKey,
        tx,
        TOKEN_PROGRAM_ID
      );

      const receiverUsdcAta = await getOrCreateATA(
        CONNECTION,
        USDC_MINT,
        RECEIVER_USDC,
        wallet.publicKey,
        tx,
        TOKEN_PROGRAM_ID
      );

      const amount = PLAN_PRICES[plan] * 1e6;
      tx.add(
        createTransferCheckedInstruction(
          userUsdcAta,
          USDC_MINT,
          receiverUsdcAta,
          wallet.publicKey,
          amount,
          6,
          TOKEN_PROGRAM_ID
        )
      );

      const nftMint = NFT_MINTS[plan];
      if (!nftMint) {
        setStatus("Invalid NFT mint address.");
        setLoading(false);
        return;
      }

      const userNftAta = await getOrCreateATA(
        CONNECTION,
        nftMint,
        wallet.publicKey,
        wallet.publicKey,
        tx,
        TOKEN_2022_PROGRAM_ID
      );

      tx.add(
        createMintToInstruction(
          nftMint,
          userNftAta,
          wallet.publicKey,
          1,
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );

      const signedTx = await wallet.signTransaction(tx);
      const txid = await CONNECTION.sendRawTransaction(signedTx.serialize());
      await CONNECTION.confirmTransaction(txid, "confirmed");

      console.log(`[handlePayAndMint] ✅ Transaction successful: ${txid}`);
      setStatus(`NFT Minted! Txid: ${txid}`);

      // Refresh NFT balance after mint
      await fetchNftBalance();
    } catch (err) {
      console.error("[handlePayAndMint] ❌ Error:", err);
      setStatus(`Error: ${err.message || err.toString()}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBurn = async () => {
    if (loading) return;
    if (!wallet.connected || !wallet.publicKey) {
      setStatus("Please connect your wallet first.");
      return;
    }
    setLoading(true);
    setStatus("Starting burn process...");
    try {
      const tx = new Transaction();
      const { blockhash } = await CONNECTION.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      const nftMint = NFT_MINTS[plan];
      const userNftAta = await getAssociatedTokenAddress(nftMint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);

      tx.add(
        createBurnInstruction(
          userNftAta,
          nftMint,
          wallet.publicKey,
          1,
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );

      const signedTx = await wallet.signTransaction(tx);
      const txid = await CONNECTION.sendRawTransaction(signedTx.serialize());
      await CONNECTION.confirmTransaction(txid, "confirmed");

      console.log(`[handleBurn] Burn successful: ${txid}`);
      setStatus(`NFT burned successfully! Transaction ID: ${txid}`);

      // Refresh NFT balance after burn
      await fetchNftBalance();
    } catch (err) {
      console.error("[handleBurn] Error:", err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-screen-md mx-auto text-center space-y-4">
      <h1 className="text-2xl font-bold">🚀 Buy & Mint Data‑Plan NFT</h1>
      <WalletMultiButton />
      <div>
        <select
          className="p-2 border rounded"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
        >
          <option value="10GB">10GB – 0.1 USDC</option>
          <option value="25GB">25GB – 0.25 USDC</option>
          <option value="50GB">50GB – 0.5 USDC</option>
        </select>
      </div>

      <div className="flex flex-col items-center space-y-2">
      <img
src={PLAN_IMAGES[plan]}
alt={`${plan} pass image`}
style={{ width: "300px", height: "300px" }}
className="rounded shadow-md"
/>
        <p className="text-lg font-semibold">
          Quantity owned: <span className="text-blue-600">{nftBalance}</span>
        </p>
      </div>

      <div className="flex justify-center space-x-4">
        <button
          onClick={handlePayAndMint}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded"
        >
          {loading ? "Processing..." : "Pay & Mint"}
        </button>
        <button
          onClick={handleBurn}
          disabled={loading}
          className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded"
        >
          {loading ? "Processing..." : "🔥 Burn NFT"}
        </button>
      </div>
      {status && <p className="mt-4">{status}</p>}
    </div>
  );
};


const AppWrapper = () => {
  const wallets = [new PhantomWalletAdapter()];
  return (
    <ConnectionProvider endpoint={clusterApiUrl("devnet")}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default AppWrapper;
