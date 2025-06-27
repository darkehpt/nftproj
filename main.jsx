import React from "react";
import ReactDOM from "react-dom/client";
import AppWrapper from './src/App.jsx'; // ✅ Correct path to AppWrapper
import "@solana/wallet-adapter-react-ui/styles.css";
import { Buffer } from "buffer";
window.Buffer = Buffer;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>
);
