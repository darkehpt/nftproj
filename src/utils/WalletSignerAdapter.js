import { PublicKey } from "@solana/web3.js";

export class WalletSignerAdapter {
  constructor(wallet) {
    this.wallet = wallet;

    if (!wallet.publicKey) {
      throw new Error("Wallet not connected");
    }

    // This is crucial so `signer.publicKey.toBase58()` doesn't break
    this.publicKey = wallet.publicKey;
  }

  getPublicKey() {
    return this.publicKey;
  }

  async signTransaction(tx) {
    if (!this.wallet.signTransaction) {
      throw new Error("Wallet does not support signTransaction");
    }
    return this.wallet.signTransaction(tx);
  }

  async signAllTransactions(txs) {
    if (!this.wallet.signAllTransactions) {
      throw new Error("Wallet does not support signAllTransactions");
    }
    return this.wallet.signAllTransactions(txs);
  }
}
