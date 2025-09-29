const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const SideLiquidityFeeder = await hre.ethers.getContractFactory("SideLiquidityFeeder");
  const side = await SideLiquidityFeeder.deploy(
    "0xE488253DD6B4D31431142F1b7601C96f24Fb7dd5", // TIFFY
    "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
    "0x10ED43C718714eb63d5aA57B78B54704E256024E", // PancakeRouter
    "0x1305302ef3929dd9252b051077e4ca182107f00d"  // TIFFY/WBNB Pool
  );
  await side.waitForDeployment();
  console.log("SideLiquidityFeeder deployed to:", await side.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
