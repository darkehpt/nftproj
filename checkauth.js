import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const connection = new Connection(clusterApiUrl("devnet"));

const mints = [
  "4GqdGtfrv7H8NmpkbS4cbhcuCu5ReEzVXCXrEwWoVK9g",
  "B8a9MpAgyZP15MFUrnidhnvi5bgXF7SrtAbaDYnAdfR8",
  "FbuPiznmwqcmUjsZkmpV4kHwgEqgvKU2PgXaGAdnbcfB"
];

async function checkMintAuthority() {
  for (const mintAddr of mints) {
    const pubkey = new PublicKey(mintAddr);
    try {
      const mint = await getMint(connection, pubkey, "confirmed", TOKEN_2022_PROGRAM_ID);
      console.log(`${mintAddr} mint authority: ${mint.mintAuthority?.toBase58()}`);
    } catch (e) {
      console.error(`Failed to get mint info for ${mintAddr}:`, e);
    }
  }
}

checkMintAuthority();
