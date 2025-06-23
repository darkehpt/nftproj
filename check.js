import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

const connection = new Connection(clusterApiUrl("devnet"));
const mints = [
  "4GqdGtfrv7H8NmpkbS4cbhcuCu5ReEzVXCXrEwWoVK9g",
  "B8a9MpAgyZP15MFUrnidhnvi5bgXF7SrtAbaDYnAdfR8",
  "FbuPiznmwqcmUjsZkmpV4kHwgEqgvKU2PgXaGAdnbcfB"
];

async function checkMintOwners() {
  for (const mintAddr of mints) {
    const pubkey = new PublicKey(mintAddr);
    const accountInfo = await connection.getAccountInfo(pubkey);
    if (!accountInfo) {
      console.log(`${mintAddr} does NOT exist.`);
      continue;
    }
    console.log(`${mintAddr} owner: ${accountInfo.owner.toBase58()}`);
  }
}

checkMintOwners();
