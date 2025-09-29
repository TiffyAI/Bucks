const express = require('express');
const { ethers } = require('ethers');
const axios = require('axios');

const app = express();
app.use(express.json());

// CONFIG
const RPC = 'https://bsc-dataseed.binance.org/';
const provider = new ethers.JsonRpcProvider(RPC);
const ADMIN_PRIVATE = process.env.ADMIN_PRIVATE;
const PRIVATES = [
  process.env.WALLET1,
  process.env.WALLET2,
  process.env.WALLET3,
  process.env.WALLET4,
  process.env.WALLET5
].filter(key => key);
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY;

// Contract addresses
const TIFFY = '0xE488253DD6B4D31431142F1b7601C96f24Fb7dd5';
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
const SIDE_CONTRACT = '0x2a234d5C...'; // Update post-deployment
const ADMIN_OWNER = '0x2a234d5Cc7431B824723c84c8605fD3968BF0255';
const POOL_ADDRESS = '0x1305302ef3929dd9252b051077e4ca182107f00d';
const LP_WALLET = '0x6a28ae01Ad12bC73D0c70E88D23CeEd6d6382D19';

// ABIs
const tiffyAbi = [
  'function approve(address,uint256) external returns(bool)',
  'function balanceOf(address) view returns(uint256)',
  'function transfer(address,uint256) external returns(bool)',
  'function isFeeExempt(address) view returns(bool)',
  'function aiSwapTokenForBNB(uint256,address) external returns(uint256)'
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
  'function addLiquidity(uint256,uint256) external',
  'function setExempt(address[] memory wallets, bool exempt) external',
  'function withdrawBNB(uint256) external'
];

// Contract instances
const tiffy = new ethers.Contract(TIFFY, tiffyAbi, provider);
const wbnb = new ethers.Contract(WBNB, wbnbAbi, provider);
const router = new ethers.Contract(ROUTER, routerAbi, provider);
const side = new ethers.Contract(SIDE_CONTRACT, sideAbi, provider);

// GAS & SAFETY
const MAX_SLIPPAGE = 500; // 5%
const MIN_GAS_PRICE = ethers.parseUnits('0.1', 'gwei');
const MAX_GAS_PRICE = ethers.parseUnits('1', 'gwei');
const GAS_LIMIT = 150000;
const MIN_DAILY_NET = 40; // USD
const TRADE_AMOUNT = 0.048;
const MAX_TRADES_PER_WALLET = 20;
const LIQUIDITY_FEED_USD = 20;

// FETCH LIVE PRICE
async function fetchLivePrice() {
  try {
    const response = await axios.get('https://tiffyai.github.io/TIFFY-Market-Value/price.json', { timeout: 5000 });
    const data = response.data;
    if (Date.now() - new Date(data.lastUpdated).getTime() > 1800000) {
      throw new Error('Stale price data');
    }
    return {
      tiffyToUSD: parseFloat(data.tiffyToUSD), // ~$16.72
      tiffyToWBNB: parseFloat(data.tiffyToWBNB), // ~0.0165
      bnbToUSD: 1010,
      lastUpdated: data.lastUpdated
    };
  } catch (e) {
    console.error(`Price fetch failed: ${e.message} - Fallback to on-chain`);
    const tRes = await tiffy.balanceOf(POOL_ADDRESS);
    const wRes = await wbnb.balanceOf(POOL_ADDRESS);
    const tiffyToWBNB = Number(ethers.formatUnits(wRes, 18)) / Number(ethers.formatUnits(tRes, 18));
    const bnbPrice = await fetchBNBPrice();
    return { tiffyToUSD: tiffyToWBNB * bnbPrice, tiffyToWBNB, bnbToUSD: bnbPrice, lastUpdated: new Date().toISOString() };
  }
}

// FETCH BNB PRICE
async function fetchBNBPrice() {
  try {
    const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd', { timeout: 5000 });
    return data.binancecoin.usd; // ~$1010
  } catch (e) {
    console.error(`BNB price fetch failed: ${e.message}`);
    return 1010; // Fallback
  }
}

// WITHDRAW BNB
async function withdrawBNB(signer, amount) {
  try {
    const tx = await side.connect(signer).withdrawBNB(ethers.parseUnits(amount.toString(), 18), {
      gasPrice: MIN_GAS_PRICE,
      gasLimit: 200000
    });
    await tx.wait();
    console.log(`Withdrew ${amount} BNB from side contract`);
  } catch (e) {
    console.error(`Withdraw failed: ${e.reason || e.message}`);
  }
}

// DISTRIBUTE BNB
async function distributeBNB(signer, recipients, amountEach) {
  for (const recipient of recipients) {
    try {
      const tx = await signer.sendTransaction({
        to: recipient,
        value: ethers.parseUnits(amountEach.toString(), 18),
        gasPrice: MIN_GAS_PRICE,
        gasLimit: 21000
      });
      await tx.wait();
      console.log(`Sent ${amountEach} BNB to ${recipient}`);
    } catch (e) {
      console.error(`Failed to send BNB to ${recipient}: ${e.reason || e.message}`);
    }
  }
}

// ADD LIQUIDITY
async function addLiquidity(signer, tiffyAmount, bnbAmount) {
  const tx = { gasPrice: MIN_GAS_PRICE, gasLimit: 400000 };
  const tiffyAmt = ethers.parseUnits(tiffyAmount.toString(), 18);
  const bnbAmt = ethers.parseUnits(bnbAmount.toString(), 18);
  try {
    await (await tiffy.connect(signer).approve(ROUTER, tiffyAmt, tx)).wait();
    await (await wbnb.connect(signer).approve(ROUTER, bnbAmt, tx)).wait();
    await (await router.connect(signer).addLiquidity(
      TIFFY,
      WBNB,
      tiffyAmt,
      bnbAmt,
      tiffyAmt.mul(95).div(100),
      bnbAmt.mul(95).div(100),
      LP_WALLET,
      Math.floor(Date.now() / 1000) + 300,
      { ...tx, value: bnbAmt }
    )).wait();
    console.log(`Added ${tiffyAmount} TIFFY + ${bnbAmount} BNB to pool`);
  } catch (e) {
    console.error(`Liquidity add failed: ${e.reason || e.message}`);
  }
}

// SWAP TIFFY FOR GAS
async function swapToGas(signer, amtTIFFY) {
  const amt = ethers.parseUnits(amtTIFFY.toString(), 18);
  const balance = await tiffy.balanceOf(signer.address);
  if (balance < amt) {
    console.error(`Low TIFFY for gas: ${ethers.formatUnits(balance, 18)}`);
    return;
  }
  try {
    const tx = await tiffy.connect(signer).aiSwapTokenForBNB(amt, signer.address, {
      gasPrice: MIN_GAS_PRICE,
      gasLimit: GAS_LIMIT
    });
    await tx.wait();
    console.log(`Swapped ${amtTIFFY} TIFFY for gas`);
  } catch (e) {
    console.error(`Gas swap failed: ${e.reason || e.message}`);
  }
}

// EXEMPT WALLETS
async function exemptWallets(signer, wallets) {
  const allExempt = await Promise.all(wallets.map(w => tiffy.isFeeExempt(w)));
  if (allExempt.every(e => e)) {
    console.log('All wallets already exempt');
    return;
  }
  try {
    const tx = await side.connect(signer).setExempt(wallets, true, {
      gasPrice: MIN_GAS_PRICE,
      gasLimit: 2500000
    });
    await tx.wait();
    console.log(`Exempted ${wallets.length} wallets`);
  } catch (e) {
    console.error(`Exempt failed: ${e.reason || e.message}`);
  }
}

// MAIN TRADE LOOP
async function runTrade(wallet, tradeAmt = TRADE_AMOUNT, maxTrades = MAX_TRADES_PER_WALLET) {
  const signer = new ethers.Wallet(wallet, provider);
  let totalBNB = 0;
  const price = await fetchLivePrice();
  console.log(`Using live price: $${price.tiffyToUSD} TIFFY, ${price.tiffyToWBNB} WBNB`);
  for (let i = 0; i < maxTrades; i++) {
    const balance = await tiffy.balanceOf(signer.address);
    if (balance < ethers.parseUnits(tradeAmt.toString(), 18)) {
      console.error(`Low TIFFY: ${ethers.formatUnits(balance, 18)}`);
      break;
    }
    const bnbBalance = await provider.getBalance(signer.address);
    if (bnbBalance < ethers.parseUnits('0.006', 18)) {
      await swapToGas(signer, 0.01);
    }
    const gasPrice = await provider.getFeeData().gasPrice;
    if (gasPrice > MAX_GAS_PRICE) {
      console.error('Gas > 1 Gwei, pausing...');
      break;
    }
    try {
      const tRes = await tiffy.balanceOf(POOL_ADDRESS);
      const wRes = await wbnb.balanceOf(POOL_ADDRESS);
      const out = await router.getAmountOut(ethers.parseUnits(tradeAmt.toString(), 18), tRes, wRes);
      const minOut = out.mul(10000 - MAX_SLIPPAGE).div(10000);
      if (out.lte(ethers.parseUnits('0.0001', 18))) {
        console.error('Output too low, skipping...');
        break;
      }
      const tx = await tiffy.connect(signer).aiSwapTokenForBNB(
        ethers.parseUnits(tradeAmt.toString(), 18),
        signer.address,
        { gasPrice: MIN_GAS_PRICE, gasLimit: GAS_LIMIT }
      );
      const receipt = await tx.wait();
      const actualOut = ethers.formatUnits(receipt.logs[0].data, 18);
      totalBNB += Number(actualOut);
      const tradeUSD = Number(actualOut) * price.bnbToUSD;
      console.log(`Trade ${i+1}: ${receipt.hash}, BNB: ${actualOut}, USD: $${tradeUSD.toFixed(2)}`);
      await new Promise(r => setTimeout(r, 30000));
    } catch (e) {
      console.error(`Trade ${i+1} failed: ${e.reason || e.message}`);
    }
  }
  const totalUSD = totalBNB * price.bnbToUSD;
  console.log(`Wallet net: $${totalUSD.toFixed(2)} USD`);
  if (totalUSD < MIN_DAILY_NET / 5) {
    console.error(`Net ${totalUSD} USD < ${MIN_DAILY_NET / 5}, stopping...`);
    return;
  }
  if (totalBNB > 0.0198) {
    await addLiquidity(signer, 1.2, 0.0198);
  }
}

// BACKEND ENDPOINTS
app.get('/trades', async (req, res) => {
  try {
    const { address } = req.query;
    const url = `https://api.bscscan.com/api?module=account&action=txlist&address=${address}&sort=desc&apikey=${BSCSCAN_API_KEY}`;
    const { data } = await axios.get(url);
    res.json(data);
  } catch (e) {
    res.status(500).json({ message: 'Failed to fetch trades' });
  }
});

app.get('/pool', async (req, res) => {
  try {
    const { pool } = req.query;
    const tiffyBal = await tiffy.balanceOf(pool);
    const wbnbBal = await wbnb.balanceOf(pool);
    res.json({ tiffy: tiffyBal, wbnb: wbnbBal });
  } catch (e) {
    res.status(500).json({ message: 'Failed to fetch pool' });
  }
});

app.get('/wallets', async (req, res) => {
  try {
    const { admin, lp } = req.query;
    const adminBal = await tiffy.balanceOf(admin);
    const lpBal = await tiffy.balanceOf(lp);
    res.json({ admin: adminBal, lp: lpBal });
  } catch (e) {
    res.status(500).json({ message: 'Failed to fetch wallets' });
  }
});

app.post('/exempt', async (req, res) => {
  try {
    const { wallets } = req.body;
    const signer = new ethers.Wallet(ADMIN_PRIVATE, provider);
    await exemptWallets(signer, wallets);
    res.json({ message: 'Wallets exempted' });
  } catch (e) {
    res.status(500).json({ message: `Exempt failed: ${e.reason || e.message}` });
  }
});

app.post('/distribute', async (req, res) => {
  try {
    const { wallets, amount } = req.body;
    const signer = new ethers.Wallet(ADMIN_PRIVATE, provider);
    await distributeBNB(signer, wallets, amount);
    res.json({ message: `Distributed ${amount} BNB to ${wallets.length} wallets` });
  } catch (e) {
    res.status(500).json({ message: `Distribute failed: ${e.reason || e.message}` });
  }
});

// MAIN
async function start() {
  console.log('Starting TIFFY trader...');
  const signer = new ethers.Wallet(ADMIN_PRIVATE, provider);
  
  const price = await fetchLivePrice();
  const tiffyAmt = (19 / 2) / price.tiffyToUSD;
  const bnbAmt = (19 / 2) / price.bnbToUSD;
  await addLiquidity(signer, tiffyAmt, bnbAmt);
  
  const recipients = [
    '0xed9b43bED20B063ae0966C0AEC446bc755fB84bA',
    '0x6a28ae01Ad12bC73D0c70E88D23CeEd6d6382D19',
    '0x8e8f465cC81b87efE6C58Efb1A03Ff10c32bBf2d',
    '0xF27d595F962ed722F39889B23682B39F712B4Da8',
    '0x2a234d5Cc7431B824723c84c8605fD3968BF0255'
  ];
  await distributeBNB(signer, recipients, 0.006);
  
  await withdrawBNB(signer, 0.003);
  
  await Promise.all(PRIVATES.map(key => runTrade(key)));
  
  const newWallets = []; // Add 5 new addresses
  if (newWallets.length) await exemptWallets(signer, newWallets);
  
  console.log('Cycle done.');
}

// Start server
app.listen(3000, () => console.log('Backend running on port 3000'));

// RUN
start().catch(e => console.error(`Error: ${e.reason || e.message}`));
