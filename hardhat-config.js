require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    bsc: {
      url: 'https://bsc-dataseed.binance.org/',
      accounts: [process.env.ADMIN_PRIVATE]
    }
  },
  etherscan: {
    apiKey: process.env.BSCSCAN_API_KEY, // V2 key for all chains
    customChains: [
      {
        network: 'bsc',
        chainId: 56,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api',
          browserURL: 'https://bscscan.com'
        }
      }
    ]
  },
  sourcify: {
    enabled: true // Keep Sourcify enabled
  }
};
