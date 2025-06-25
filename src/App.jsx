import React, { useState, useEffect } from "react";
import {
  Connection,
  PublicKey,
  clusterApiUrl,
  Transaction,
  SystemProgram,
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
import {
  useWallet,
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import {
  WalletModalProvider,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";

// Import your local images here
import pass1 from "./utils/pass1.png";
import pass2 from "./utils/pass2.png";
import pass3 from "./utils/pass3.png";

// --- CONFIG ---
const CONNECTION = new Connection(clusterApiUrl("devnet"), "confirmed");
const RECEIVER_USDC = new PublicKey("64MWbWRdtrE8Rvr3Un59CQ4x3q11ZQHhdRbvtvmw81MG");
const PLAN_PRICES = { "10GB": 0.001, "25GB": 0.025, "50GB": 0.05 };
const NFT_MINTS = {
  "10GB": new PublicKey("GXsBcsscLxMRKLgwWWnKkUzuXdEXwr74NiSqJrBs21Mz"),
  "25GB": new PublicKey("HDtzBt6nvoHLhiV8KLrovhnP4pYesguq89J2vZZbn6kA"),
  "50GB": new PublicKey("C6is6ajmWgySMA4WpDfccadLf5JweXVufdXexWNrLKKD"),
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
      if (err.name === "TokenAccountNotFoundError") {
        setNftBalance(0);
      } else {
        console.warn("Error fetching balance:", err);
        setNftBalance(0);
      }
    }
  };

  useEffect(() => {
    fetchNftBalance();
  }, [wallet.connected, wallet.publicKey, plan]);

  const handlePayAndMint = async () => {
    if (!wallet.connected || !wallet.publicKey) {
      return setStatus("❗ Connect your wallet first.");
    }
    if (loading) return;

    setLoading(true);
    setStatus("⏳ Processing payment...");

    try {
      const tx = new Transaction();
      const { blockhash } = await CONNECTION.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      const price = PLAN_PRICES[plan] * 1e9; // convert SOL to lamports

      tx.add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: RECEIVER_USDC,
          lamports: price,
        })
      );

      const signedTx = await wallet.signTransaction(tx);
      const txid = await CONNECTION.sendRawTransaction(signedTx.serialize());
      await CONNECTION.confirmTransaction(txid, "confirmed");

      setStatus(`💸 Payment successful! Tx: ${txid}`);
    } catch (err) {
      console.error(err);
      setStatus(`❌ Payment failed: ${err.message}`);
      setLoading(false);
      return;
    }

    setStatus("⏳ Minting your NFT...");

    try {
      const res = await fetch("https://nftproj.onrender.com/mint-nft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPubkey: wallet.publicKey.toBase58(), plan }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus(`🎉 NFT minted! Tx: ${data.txid}`);
      } else {
        throw new Error(data.error || "Mint failed");
      }
      await fetchNftBalance();
    } catch (err) {
      console.error(err);
      setStatus(`❌ NFT minting failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBurn = async () => {
    if (!wallet.connected || !wallet.publicKey) {
      return setStatus("❗ Connect your wallet first.");
    }
    if (loading) return;

    setLoading(true);
    setStatus("⏳ Burning NFT...");

    try {
      const tx = new Transaction();
      const { blockhash } = await CONNECTION.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      const mint = NFT_MINTS[plan];
      const ata = await getOrCreateATA(CONNECTION, mint, wallet.publicKey, wallet.publicKey, tx, TOKEN_2022_PROGRAM_ID);

      const burnIx = createBurnInstruction(
        ata,
        mint,
        wallet.publicKey,
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      );
      tx.add(burnIx);

      const signedTx = await wallet.signTransaction(tx);
      const txid = await CONNECTION.sendRawTransaction(signedTx.serialize());
      await CONNECTION.confirmTransaction(txid, "confirmed");

      setStatus(`🔥 NFT burned successfully! Tx: ${txid}`);
      await fetchNftBalance();
    } catch (err) {
      console.error(err);
      setStatus(`❌ Burn failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-screen-md mx-auto text-center space-y-4">
      <h1 className="text-2xl font-bold">🚀 Buy & Mint Data Plan NFT</h1>
      <WalletMultiButton />
      <div>
        <select
          className="p-2 border rounded"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
        >
          <option value="10GB">10GB – 0.001 SOL</option>
          <option value="25GB">25GB – 0.025 SOL</option>
          <option value="50GB">50GB – 0.05 SOL</option>
        </select>
      </div>

      <div className="flex flex-col items-center space-y-2">
        <img
          src={PLAN_IMAGES[plan]}
          alt={`${plan} pass`}
          style={{ width: "300px", height: "300px" }}
          className="rounded shadow-md"
        />
        <p className="text-lg font-semibold">
          Owned: <span className="text-blue-600">{nftBalance}</span>
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
