require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.20",
  networks: {
    bsc: {
      url: "https://bsc-dataseed.binance.org/",
      accounts: [process.env.ADMIN_PRIVATE] // Admin wallet private key (0x2a234...)
    }
  },
  etherscan: {
    apiKey: process.env.BSCSCAN_API_KEY // Add BscScan API key
  }
};
