const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const SideContract = await hre.ethers.getContractFactory("SideContract");
  const side = await SideContract.deploy("0xE488253D..."); // Replace with TIFFY address
  await side.waitForDeployment();
  console.log("SideContract deployed to:", await side.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
