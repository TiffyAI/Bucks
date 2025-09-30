require('dotenv').config();
const { ethers } = require('ethers');
const Web3 = require('web3');

// CONFIG
const RPC = 'https://bsc-dataseed.binance.org/'; // BSC mainnet
const provider = new ethers.JsonRpcProvider(RPC);
const web3 = new Web3(RPC);

// Your 5 exempt wallets (private keys in .env)
const PRIVATES = [
  process.env.WALLET1,
  process.env.WALLET2,
  process.env.WALLET3,
  process.env.WALLET4,
  process.env.WALLET5
];

// Contract addresses
const TIFFY = '0xE488253D...'; // Your TIFFY token (replace with full address)
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E'; // PancakeSwap Router V2
const SIDE_CONTRACT = '0x2a234d5C...'; // Your side contract (replace with full address)
const ADMIN_OWNER = '0x2a234d5C...'; // Your admin wallet (same as side contract)

// ABIs
const tiffyAbi = [
  'function approve(address,uint256) external returns(bool)',
  'function balanceOf(address) view returns(uint256)'
];
const wbnbAbi = [
  'function approve(address,uint256) external returns(bool)',
  'function balanceOf(address) view returns(uint256)',
  'function deposit() payable',
  'function withdraw(uint wad)'
];
const routerAbi = [
  'function getAmountOut(uint,uint,uint) view returns(uint)',
  'function swapExactTokensForTokens(uint,uint,address[],address,uint) external returns(uint[])',
  'function swapTokensForExactTokens(uint,uint,address[],address,uint) external returns(uint[])'
];
const sideAbi = [
  'function feedPool(uint256) external',
  'function setExempt(address[],bool) external' // onlyOwner exemption function
];

// Contract instances
const tiffy = new ethers.Contract(TIFFY, tiffyAbi, provider);
const wbnb = new ethers.Contract(WBNB, wbnbAbi, provider);
const router = new ethers.Contract(ROUTER, routerAbi, provider);
const side = new ethers.Contract(SIDE_CONTRACT, sideAbi, provider);

// GAS & SAFETY
const MAX_SLIPPAGE = 500; // 5% in basis points
const MIN_GAS_PRICE = ethers.parseUnits('0.1', 'gwei');
const MAX_GAS_PRICE = ethers.parseUnits('5', 'gwei');
const GAS_LIMIT = 300000;
const MIN_DAILY_NET = 40; // USD, stops if net < $40
const POOL_ADDRESS = '0x1305302e...'; // TIFFY/WBNB pair (replace with full address)

// MAIN TRADE LOOP
async function runTrade(wallet, tradeAmt = 0.048, count = 72) {
  const signer = new ethers.Wallet(wallet, provider);
  const tx = { gasPrice: MIN_GAS_PRICE, gasLimit: GAS_LIMIT };
  console.log(`Starting ${count} trades on ${signer.address}...`);

  let gasSwaps = 0;
  let totalNet = 0;

  for (let i = 0; i < count; i++) {
    // Check gas price
    const gasPrice = await provider.getFeeData().gasPrice;
    if (gasPrice > MAX_GAS_PRICE) {
      console.log('Gas > 5 Gwei, pausing...');
      return;
    }
    tx.gasPrice = ethers.parseUnits(Math.min(gasPrice / 1e9, 5).toString(), 'gwei');

    // Get quote
    const tRes = await tiffy.balanceOf(POOL_ADDRESS);
    const wRes = await wbnb.balanceOf(POOL_ADDRESS);
    const out = await router.getAmountOut(
      ethers.parseUnits(tradeAmt.toString(), 18),
      tRes,
      wRes
    );
    const minOut = out.mul(10000 - MAX_SLIPPAGE).div(10000); // 5% slippage
    if (out.lte(ethers.parseUnits('0.0001', 18))) {
      console.log('Output too low, skipping...');
      break;
    }

    // Trade
    try {
      await (await tiffy.connect(signer).approve(ROUTER, ethers.parseUnits(tradeAmt.toString(), 18), tx)).wait();
      const path = [TIFFY, WBNB];
      const res = await router.connect(signer).swapExactTokensForTokens(
        ethers.parseUnits(tradeAmt.toString(), 18),
        minOut,
        path,
        signer.address,
        Math.floor(Date.now() / 1000) + 300,
        tx
      );
      console.log(`Trade ${i+1}: ${res.hash}`);
      totalNet += tradeAmt * 16.3; // Approx USD value
      gasSwaps++;
      if (gasSwaps % 25 === 0) await swapToGas(signer);
    } catch (e) {
      console.log(`Skip trade ${i+1}: ${e.reason || e.message}`);
    }

    // 2-min cooldown (4 hours total for 72 trades)
    await new Promise(r => setTimeout(r, 120000));
  }

  // Final gas swap
  if (gasSwaps > 0) await swapToGas(signer);

  // Feed pool
  try {
    await (await side.connect(signer).feedPool(ethers.parseUnits('0.99', 18), tx)).wait();
    console.log(`Fed pool: 0.99 TIFFY from ${signer.address}`);
  } catch (e) {
    console.log(`Pool feed failed: ${e.reason || e.message}`);
  }

  // Check daily net
  if (totalNet < MIN_DAILY_NET) {
    console.log(`Net ${totalNet} USD < $40, stopping...`);
    process.exit(1);
  }
}

// GAS SWAP
async function swapToGas(signer) {
  const amt = ethers.parseUnits('0.02', 18); // 25 × 0.02 = 0.5 TIFFY/day
  const out = await router.getAmountOut(amt, await tiffy.balanceOf(POOL_ADDRESS), await wbnb.balanceOf(POOL_ADDRESS));
  const minOut = out.mul(10000 - MAX_SLIPPAGE).div(10000);
  try {
    await (await tiffy.connect(signer).approve(ROUTER, amt, { gasLimit: GAS_LIMIT })).wait();
    const path = [TIFFY, WBNB];
    const res = await router.connect(signer).swapExactTokensForTokens(
      amt,
      minOut,
      path,
      signer.address,
      Math.floor(Date.now() / 1000) + 300,
      { gasLimit: GAS_LIMIT }
    );
    console.log(`Gas swap: ${res.hash}`);
  } catch (e) {
    console.log(`Gas swap failed: ${e.reason || e.message}`);
  }
}

// WEEKLY EXEMPT
async function exemptWallets(wallets) {
  const signer = new ethers.Wallet(process.env.ADMIN_PRIVATE, provider); // Admin key
  try {
    await (await side.connect(signer).setExempt(wallets, true, { gasPrice: MIN_GAS_PRICE, gasLimit: 2500000 })).wait();
    console.log(`Exempted ${wallets.length} wallets`);
  } catch (e) {
    console.log(`Exempt failed: ${e.reason || e.message}`);
  }
}

// MAIN
async function start() {
  console.log('Starting TIFFY trader...');
  for (const key of PRIVATES) {
    await runTrade(key);
  }
  console.log('Daily cycle done.');

  // Weekly exempt (run manually or cron)
  const newWallets = ['0x...', '0x...', /* 50 new wallet addresses */]; // Replace with real addresses
  if (new Date().getDay() === 0) { // Sunday
    await exemptWallets(newWallets);
  }
}

// RUN
start().catch(e => console.error(`Error: ${e.reason || e.message}`));

// CRON (uncomment for weekly exempt)
// setInterval(() => exemptWallets(newWallets), 604800000); // 7 days
