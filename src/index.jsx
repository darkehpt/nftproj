import { Buffer } from "buffer";
window.Buffer = Buffer;

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";

import {
  WalletModalProvider,
} from "@solana/wallet-adapter-react-ui";

import {
  PhantomWalletAdapter,
  // add other wallet adapters if needed
} from "@solana/wallet-adapter-wallets";

const wallets = [new PhantomWalletAdapter()];
const network = "devnet";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <ConnectionProvider endpoint={`https://api.${network}.solana.com`}>
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>
        <App />
      </WalletModalProvider>
    </WalletProvider>
  </ConnectionProvider>
);
