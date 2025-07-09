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
  createBurnInstruction,
  TOKEN_2022_PROGRAM_ID,
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

import pass1 from "./utils/pass1.png";
import pass2 from "./utils/pass2.png";
import pass3 from "./utils/pass3.png";

const CONNECTION = new Connection(clusterApiUrl("devnet"), "confirmed");
const BACKEND_AUTHORITY = new PublicKey("64MWbWRdtrE8Rvr3Un59CQ4x3q11ZQHhdRbvtvmw81MG");
const SOULBOUND_MINT = new PublicKey("BGZPPAY2jJ1rgFNhRkHKjPVmxx1VFUisZSo569Pi71Pc");

const PLAN_PRICES = { "10GB": 0.001, "25GB": 0.025, "50GB": 0.05 };
const NFT_MINTS = {
  "10GB": new PublicKey("GXsBcsscLxMRKLgwWWnKkUzuXdEXwr74NiSqJrBs21Mz"),
  "25GB": new PublicKey("HDtzBt6nvoHLhiV8KLrovhnP4pYesguq89J2vZZbn6kA"),
  "50GB": new PublicKey("C6is6ajmWgySMA4WpDfccadLf5JweXVufdXexWNrLKKD"),
};
const PLAN_IMAGES = { "10GB": pass1, "25GB": pass2, "50GB": pass3 };

async function getOrCreateATA(connection, mint, owner, payer, tx, tokenProgramId = TOKEN_2022_PROGRAM_ID) {
  const ata = await getAssociatedTokenAddress(mint, owner, false, tokenProgramId);
  try {
    await getAccount(connection, ata, "confirmed", tokenProgramId);
  } catch (err) {
    if (err.name === "TokenAccountNotFoundError") {
      tx.add(
        createAssociatedTokenAccountInstruction(payer, ata, owner, mint, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID)
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
  const [planBalances, setPlanBalances] = useState({});
  const [nftBalance, setNftBalance] = useState(0);
  const [soulboundOwned, setSoulboundOwned] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchPlanBalances = async () => {
    if (!wallet.connected || !wallet.publicKey) {
      setPlanBalances({});
      return;
    }

    const balances = {};
    for (const [name, mint] of Object.entries(NFT_MINTS)) {
      try {
        const ata = await getAssociatedTokenAddress(mint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
        const accountInfo = await getAccount(CONNECTION, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
        balances[name] = Number(accountInfo.amount);
      } catch {
        balances[name] = 0;
      }
    }

    try {
      const ata = await getAssociatedTokenAddress(SOULBOUND_MINT, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const accountInfo = await getAccount(CONNECTION, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
      setSoulboundOwned(Number(accountInfo.amount) > 0);
    } catch {
      setSoulboundOwned(false);
    }

    setPlanBalances(balances);
  };

  useEffect(() => {
    fetchPlanBalances();
  }, [wallet.connected, wallet.publicKey]);

  useEffect(() => {
    setNftBalance(planBalances[plan] || 0);
  }, [plan, planBalances]);

  const handlePayAndMint = async () => {
    if (!wallet.connected || !wallet.publicKey || loading) return;
    setLoading(true);
    setStatus("⏳ Processing payment...");

    try {
      const tx = new Transaction();
      const { blockhash } = await CONNECTION.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      const price = Math.round(PLAN_PRICES[plan] * 1e9);
      tx.add(SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: BACKEND_AUTHORITY, lamports: price }));

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
      const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

    try {
  const res = await fetch("https://nftproj.onrender.com/mint-nft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userPubkey: wallet.publicKey.toBase58(), plan }),
  });

  if (!res.ok) {
    const errText = await res.text(); // fallback if it's not JSON
    throw new Error(`Backend error: ${errText}`);
  }

  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Mint failed");

  setStatus(`🎉 NFT minted! Tx: ${data.txid}`);
  await fetchPlanBalances();
} catch (err) {
  console.error(err);
  setStatus(`❌ NFT minting failed: ${err.message}`);
}

      setStatus(`🎉 NFT minted! Tx: ${data.txid}`);
      await fetchPlanBalances();
    } catch (err) {
      console.error(err);
      setStatus(`❌ NFT minting failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimSoulbound = async () => {
    if (!wallet.connected || !wallet.publicKey || soulboundOwned) return;

    try {
      setStatus("⏳ Claiming your soulbound NFT...");

      const res = await fetch("https://nftproj.onrender.com/mint-soulbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPubkey: wallet.publicKey.toBase58() }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Soulbound mint failed");

      setStatus(`🔒 Soulbound NFT minted! Tx: ${data.txid}`);
      setSoulboundOwned(true);
    } catch (err) {
      console.error(err);
      setStatus(`❌ Claim failed: ${err.message}`);
    }
  };

  const handleBurn = async () => {
    if (!wallet.connected || !wallet.publicKey || loading) return;
    setLoading(true);
    setStatus("⏳ Requesting backend to burn your NFT...");

    try {
      const res = await fetch("https://nftproj.onrender.com/mint-nft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPubkey: wallet.publicKey.toBase58(),
          plan,
          activationMint: NFT_MINTS[plan].toBase58(),
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Burn/mint failed");

      setStatus(`🔥 NFT burned and new one minted! Tx: ${data.txid}`);
      await fetchPlanBalances();
      if (!soulboundOwned) await handleClaimSoulbound();
    } catch (err) {
      console.error(err);
      setStatus(`❌ Burn/mint failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-screen-md mx-auto text-center space-y-6 bg-black text-white rounded-lg shadow-lg">
      <h1 className="text-3xl font-bold">🚀 Buy & Mint Data Plan NFT</h1>
      <div className="flex justify-center"><WalletMultiButton /></div>

      <select className="p-2 border border-white bg-black rounded text-white" value={plan} onChange={(e) => setPlan(e.target.value)}>
        <option value="10GB">10GB – 0.001 SOL</option>
        <option value="25GB">25GB – 0.025 SOL</option>
        <option value="50GB">50GB – 0.05 SOL</option>
      </select>

      <div className="flex flex-col items-center space-y-2">
        <img src={PLAN_IMAGES[plan]} alt={plan} className="rounded shadow-md" style={{ width: "300px", height: "300px" }} />
        <p className="text-lg font-semibold">Owned: <span className="text-blue-400">{nftBalance}</span></p>
        <p className="text-sm text-green-300">
          Soulbound NFT: {soulboundOwned ? "✅ Owned" : "❌ Not Yet Claimed"}
        </p>
      </div>

      <div className="flex justify-center space-x-4">
        <button onClick={handlePayAndMint} disabled={loading} className={`py-2 px-4 rounded font-semibold ${loading ? "bg-gray-500" : "bg-blue-600 hover:bg-blue-700"} text-white`}>
          {loading ? "Processing..." : "Pay & Mint"}
        </button>

        <button onClick={handleBurn} disabled={loading} className={`py-2 px-4 rounded font-semibold ${loading ? "bg-gray-500" : "bg-red-600 hover:bg-red-700"} text-white`}>
          {loading ? "Processing..." : "🔥 Burn NFT"}
        </button>
      </div>

      {!soulboundOwned && Object.values(planBalances).some(b => b > 0) && (
        <button onClick={handleClaimSoulbound} disabled={loading} className={`py-2 px-4 rounded font-semibold ${loading ? "bg-gray-500" : "bg-purple-700 hover:bg-purple-800"} text-white`}>
          {loading ? "Processing..." : "🎁 Claim Soulbound NFT"}
        </button>
      )}

      {status && <p className="mt-4 text-sm text-yellow-400">{status}</p>}
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
