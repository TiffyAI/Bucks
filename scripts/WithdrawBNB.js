const hre = require("hardhat");

async function main() {
  const SIDE_CONTRACT = "0xNewSide..."; // Replace with deployed SideLiquidityFeeder address
  const sideAbi = [
    "function withdrawBNB(uint256) external"
  ];
  const [signer] = await hre.ethers.getSigners();
  console.log("Withdrawing with:", signer.address);

  const side = new hre.ethers.Contract(SIDE_CONTRACT, sideAbi, signer);
  const amount = hre.ethers.parseUnits("0.003", 18);
  const contractBalance = await hre.ethers.provider.getBalance(SIDE_CONTRACT);
  
  if (contractBalance < amount) {
    throw new Error(`Insufficient BNB in contract: ${hre.ethers.formatUnits(contractBalance, 18)} BNB`);
  }

  console.log(`Withdrawing 0.003 BNB from ${SIDE_CONTRACT}...`);
  const gasPrice = await hre.ethers.provider.getGasPrice();
  const cappedGasPrice = gasPrice > hre.ethers.parseUnits("0.1", "gwei") ? hre.ethers.parseUnits("0.1", "gwei") : gasPrice;
  const tx = await side.withdrawBNB(amount, { gasPrice: cappedGasPrice, gasLimit: 200000 });
  await tx.wait();
  console.log(`Withdrew 0.003 BNB: ${tx.hash}`);
}

main().catch((error) => {
  console.error(`Withdraw failed: ${error.reason || error.message}`);
  process.exitCode = 1;
});
