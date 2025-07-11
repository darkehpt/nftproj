import pkg from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const {
  Connection,
  PublicKey,
  clusterApiUrl,
  getTokenLargestAccounts,
  getParsedAccountInfo,
} = pkg;

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

const SOULBOUND_MINT = new PublicKey("BGZPPAY2jJ1rgFNhRkHKjPVmxx1VFUisZSo569Pi71Pc");

(async () => {
  try {
    const largest = await connection.getTokenLargestAccounts(SOULBOUND_MINT);
    const holders = largest.value.filter(acc => acc.uiAmount > 0);

    console.log(`✅ Found ${holders.length} soulbound holders:\n`);

    for (const holder of holders) {
      const accountInfo = await connection.getParsedAccountInfo(holder.address);
      const owner = accountInfo.value?.data?.parsed?.info?.owner;

      if (owner) {
        const ownerPk = new PublicKey(owner);
        const ata = await getAssociatedTokenAddress(
          SOULBOUND_MINT,
          ownerPk,
          false,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        console.log(`- Owner: ${owner}`);
        console.log(`  ATA:   ${ata.toBase58()}`);
        console.log(`  Amount: ${holder.uiAmount}`);
        console.log("");
      }
    }
  } catch (err) {
    console.error("❌ Error scanning holders:", err);
  }
})();
