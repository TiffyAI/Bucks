const { ethers } = require('ethers');
const fs = require('fs');

// Generate 10,000 wallets
const wallets = Array.from({ length: 10000 }, () => ethers.Wallet.createRandom());

// Create .env content
let envContent = '';
wallets.forEach((wallet, i) => {
  envContent += `WALLET${i + 1}=${wallet.privateKey}\n`;
});

// Save to .env
fs.writeFileSync('tiffy-wallets.env', envContent);
console.log('Generated 10,000 wallets to tiffy-wallets.env');
