import fetch from "node-fetch";

(async () => {
  console.log("Starting test...");

  try {
    const response = await fetch("https://nftproj.onrender.com/burn-nft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userPubkey: "6WCrvPVzPcn6oWsiCgg4PWvgu3X9ytTJqNL39JwHhX8v",
        plan: "10GB",
      }),
    });

    console.log("Response status:", response.status);

    const data = await response.json();
    console.log("Response data:", data);
  } catch (e) {
    console.error("Fetch error:", e);
  } finally {
    console.log("Exiting script.");
    process.exit(0);
  }
})();
