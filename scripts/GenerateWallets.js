const hre = require("hardhat");

async function main() {
  const walletCount = 5; // Generate 5 wallets per cycle
  const wallets = [];

  console.log(`Generating ${walletCount} new wallets...`);
  for (let i = 0; i < walletCount; i++) {
    const wallet = hre.ethers.Wallet.createRandom();
    wallets.push({
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic.phrase
    });
    console.log(`Wallet ${i + 1}:`);
    console.log(`  Address: ${wallet.address}`);
    console.log(`  Private Key: ${wallet.privateKey}`);
    console.log(`  Mnemonic: ${wallet.mnemonic.phrase}`);
  }

  // Save wallets securely (e.g., to a local file, not GitHub/Render)
  const fs = require("fs");
  fs.writeFileSync("new_wallets.json", JSON.stringify(wallets, null, 2));
  console.log("Wallets saved to new_wallets.json");
}

main().catch((error) => {
  console.error(`Wallet generation failed: ${error.message}`);
  process.exitCode = 1;
});
