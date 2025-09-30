const hre = require("hardhat");

async function main() {
  const SIDE_CONTRACT = "0x1234…"; // Replace with deployed address
  const sideAbi = [
    "function withdrawBNB(uint256) external"
  ];
  const [signer] = await hre.ethers.getSigners();
  const side = new hre.ethers.Contract(SIDE_CONTRACT, sideAbi, signer);
  const amount = hre.ethers.parseUnits("0.003", 18);
  console.log(`Withdrawing 0.003 BNB from ${SIDE_CONTRACT}...`);
  const tx = await side.withdrawBNB(amount, { gasPrice: hre.ethers.parseUnits("1", "gwei"), gasLimit: 200000 });
  await tx.wait();
  console.log(`Withdrew 0.003 BNB: ${tx.hash}`);
}

main().catch((error) => {
  console.error(`Withdraw failed: ${error.reason || error.message}`);
  process.exitCode = 1);
});
