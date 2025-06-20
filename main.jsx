import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { WalletConnectionProvider } from "./WalletConnectionProvider";
import "@solana/wallet-adapter-react-ui/styles.css";
import { Buffer } from 'buffer'
window.Buffer = Buffer

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WalletConnectionProvider>
      <App />
    </WalletConnectionProvider>
  </React.StrictMode>
);
