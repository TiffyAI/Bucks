const { ethers } = require('ethers');
const fs = require('fs');

const wallets = Array.from({ length: 10000 }, () => ethers.Wallet.createRandom());
let envContent = '';
wallets.forEach((wallet, i) => {
  envContent += `WALLET${i + 1}=${wallet.privateKey}\n`;
});
fs.writeFileSync('tiffy-wallets.env', envContent);
console.log('Generated 10,000 wallets to tiffy-wallets.env');

const addresses = wallets.map(w => w.address);
fs.writeFileSync('wallet-addresses.json', JSON.stringify(addresses, null, 2));
console.log('Saved 10,000 addresses to wallet-addresses.json');
