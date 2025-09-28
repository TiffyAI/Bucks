require('dotenv').config();
const { ethers } = require('ethers');
const Web3 = require('web3');

// CONFIG
const RPC = 'https://bsc-dataseed.binance.org/';
const provider = new ethers.JsonRpcProvider(RPC);
const web3 = new Web3(RPC);

// Admin wallet
const PRIVATES = [
  process.env.WALLET1,
  process.env.WALLET2,
  process.env.WALLET3,
  process.env.WALLET4,
  process.env.WALLET5
].filter(key => key); // Use WALLET1-5 from TIFFYAI contract + admin

// Contract addresses
const TIFFY = '0xE488253D...'; // Replace with TIFFY address
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
const SIDE_CONTRACT = '0x2a234d5C...'; // Replace with deployed side contract address
const ADMIN_OWNER = '0x2a234d5C...'; // Replace with admin wallet
const POOL_ADDRESS = '0x1305302ef3929dd9252b051077e4ca182107f00d'; // TIFFY/WBNB pair
const LP_WALLET = '0x85...'; // Replace with LP wallet

// ABIs
const tiffyAbi = [
  'function approve(address,uint256) external returns(bool)',
  'function balanceOf(address) view returns(uint256)',
  'function transfer(address,uint256) external returns(bool)'
];
const wbnbAbi = [
  'function approve(address,uint256) external returns(bool)',
  'function balanceOf(address) view returns(uint256)',
  'function deposit() external payable',
  'function withdraw(uint256) external'
];
const routerAbi = [
  'function getAmountOut(uint,uint,uint) view returns(uint)',
  'function swapExactTokensForTokens(uint,uint,address[],address,uint) external returns(uint[])',
  'function addLiquidity(address,address,uint,uint,uint,uint,address,uint) external returns(uint,uint,uint)'
];
const sideAbi = [
  'function feedPool(uint256) external',
  'function setExempt(address[] memory wallets, bool exempt) external',
  'function addLiquidity(uint256,uint256) external',
  'function withdrawBNB(uint256) external' // New function
];

// Contract instances
const tiffy = new ethers.Contract(TIFFY, tiffyAbi, provider);
const wbnb = new ethers.Contract(WBNB, wbnbAbi, provider);
const router = new ethers.Contract(ROUTER, routerAbi, provider);
const side = new ethers.Contract(SIDE_CONTRACT, sideAbi, provider);

// GAS & SAFETY
const MAX_SLIPPAGE = 500; // 5%
const MIN_GAS_PRICE = ethers.parseUnits('0.1', 'gwei');
const MAX_GAS_PRICE = ethers.parseUnits('5', 'gwei');
const GAS_LIMIT = 300000;
const MIN_DAILY_NET = 40;

// WITHDRAW BNB FROM SIDE CONTRACT
async function withdrawBNB(signer, amount) {
  const tx = { gasPrice: MIN_GAS_PRICE, gasLimit: 200000 };
  try {
    await (await side.connect(signer).withdrawBNB(ethers.parseUnits(amount.toString(), 18), tx)).wait();
    console.log(`Withdrew ${amount} BNB from TIFFYAI contract via side contract`);
  } catch (e) {
    console.log(`Withdraw failed: ${e.reason || e.message}`);
  }
}

// WRAP BNB TO WBNB
async function wrapBNB(signer, amount) {
  const tx = { gasPrice: MIN_GAS_PRICE, gasLimit: 200000, value: ethers.parseUnits(amount.toString(), 18) };
  try {
    await (await wbnb.connect(signer).deposit(tx)).wait();
    console.log(`Wrapped ${amount} BNB to WBNB`);
  } catch (e) {
    console.log(`Wrap failed: ${e.reason || e.message}`);
  }
}

// ADD LIQUIDITY
async function addLiquidity(signer, tiffyAmount, wbnbAmount) {
  const tx = { gasPrice: MIN_GAS_PRICE, gasLimit: 400000 };
  const tiffyAmt = ethers.parseUnits(tiffyAmount.toString(), 18);
  const wbnbAmt = ethers.parseUnits(wbnbAmount.toString(), 18);
  try {
    await (await tiffy.connect(signer).approve(ROUTER, tiffyAmt, tx)).wait();
    await (await wbnb.connect(signer).approve(ROUTER, wbnbAmt, tx)).wait();
    await (await router.connect(signer).addLiquidity(
      TIFFY,
      WBNB,
      tiffyAmt,
      wbnbAmt,
      tiffyAmt.mul(95).div(100),
      wbnbAmt.mul(95).div(100),
      LP_WALLET,
      Math.floor(Date.now() / 1000) + 300,
      tx
    )).wait();
    console.log(`Added ${tiffyAmount} TIFFY + ${wbnbAmount} WBNB to pool, LP to ${LP_WALLET}`);
  } catch (e) {
    console.log(`Liquidity add failed: ${e.reason || e.message}`);
  }
}

// MAIN TRADE LOOP
async function runTrade(wallet, tradeAmt = 0.048, maxTrades = 100) { // Changed to 100 trades
  const signer = new ethers.Wallet(wallet, provider);
  const tx = { gasPrice: MIN_GAS_PRICE, gasLimit: GAS_LIMIT };
  console.log(`Starting ${maxTrades} trades on ${signer.address}...`);

  // Add liquidity before trades
  await addLiquidity(signer, 1.35, 0.022);

  let gasSwaps = 0;
  let totalNet = 0;

  for (let i = 0; i < maxTrades; i++) {
    const gasPrice = await provider.getFeeData().gasPrice;
    if (gasPrice > MAX_GAS_PRICE) {
      console.log('Gas > 5 Gwei, pausing...');
      return;
    }
    tx.gasPrice = ethers.parseUnits(Math.min(gasPrice / 1e9, 5).toString(), 'gwei');

    const balance = await tiffy.balanceOf(signer.address);
    if (balance < ethers.parseUnits(tradeAmt.toString(), 18)) {
      console.log(`Low TIFFY balance: ${ethers.formatUnits(balance, 18)}`);
      break;
    }

    const tRes = await tiffy.balanceOf(POOL_ADDRESS);
    const wRes = await wbnb.balanceOf(POOL_ADDRESS);
    const out = await router.getAmountOut(ethers.parseUnits(tradeAmt.toString(), 18), tRes, wRes);
    const minOut = out.mul(10000 - MAX_SLIPPAGE).div(10000);
    if (out.lte(ethers.parseUnits('0.0001', 18))) {
      console.log('Output too low, skipping...');
      break;
    }

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
      totalNet += tradeAmt * 16.004342; // Updated price
      gasSwaps++;
      if (gasSwaps % 25 === 0) await swapToGas(signer, 0.02);
    } catch (e) {
      console.log(`Skip trade ${i+1}: ${e.reason || e.message}`);
    }

    await new Promise(r => setTimeout(r, 30000)); // 30s cooldown
  }

  if (gasSwaps > 0) await swapToGas(signer, 0.02);

  try {
    const balance = await tiffy.balanceOf(signer.address);
    if (balance >= ethers.parseUnits('0.99', 18)) {
      await (await tiffy.connect(signer).approve(SIDE_CONTRACT, ethers.parseUnits('0.99', 18), tx)).wait();
      await (await side.connect(signer).feedPool(ethers.parseUnits('0.99', 18), tx)).wait();
      console.log(`Fed pool: 0.99 TIFFY from ${signer.address}`);
    }
  } catch (e) {
    console.log(`Pool feed failed: ${e.reason || e.message}`);
  }

  if (totalNet < MIN_DAILY_NET) {
    console.log(`Net ${totalNet} USD < $40, stopping...`);
    process.exit(1);
  }
}

// GAS SWAP
async function swapToGas(signer, amtTIFFY) {
  const amt = ethers.parseUnits(amtTIFFY.toString(), 18);
  const balance = await tiffy.balanceOf(signer.address);
  if (balance < amt) {
    console.log(`Low TIFFY for gas swap: ${ethers.formatUnits(balance, 18)}`);
    return;
  }
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

// EXEMPT WALLETS
async function exemptWallets(wallets) {
  const signer = new ethers.Wallet(process.env.ADMIN_PRIVATE, provider);
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
  
  // Withdraw stuck BNB from TIFFYAI contract
  const signer = new ethers.Wallet(process.env.ADMIN_PRIVATE, provider);
  await withdrawBNB(signer, 0.003); // Withdraw 0.003 BNB
  
  // Exempt wallets
  const wallets = [
    process.env.WALLET1,
    process.env.WALLET2,
    process.env.WALLET3,
    process.env.WALLET4,
    process.env.WALLET5
  ].filter(w => w).map(w => new ethers.Wallet(w, provider).address);
  await exemptWallets(wallets);

  // Run trades
  for (const key of PRIVATES) {
    await runTrade(key);
  }
  console.log('Daily cycle done.');
}

// RUN
start().catch(e => console.error(`Error: ${e.reason || e.message}`));

// CRON (uncomment for 24-hour auto-run)
// setInterval(start, 24 * 60 * 60 * 1000);
