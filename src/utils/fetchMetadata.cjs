const { Metaplex } = require("@metaplex-foundation/js");
const { Connection, clusterApiUrl, PublicKey } = require("@solana/web3.js");
const fetch = require("node-fetch");

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"));
  const metaplex = new Metaplex(connection);

  const mintAddress = new PublicKey("CY6bLqxa4sjxtFctujQUMDwrSR3bsPWyYG22C2dtVP6G");

  try {
    const nft = await metaplex.nfts().findByMint({ mintAddress });
    console.log("NFT on-chain metadata:", nft);

    const response = await fetch(nft.uri);
    const metadata = await response.json();
    console.log("Off-chain JSON metadata:", metadata);
  } catch (error) {
    console.error("Error fetching NFT metadata:", error);
  }
}

main();
