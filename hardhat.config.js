require('@nomiclabs/hardhat-waffle')
require('@atixlabs/hardhat-time-n-mine')
require('@nomiclabs/hardhat-etherscan')

const fs = require('fs')
const dev = fs.readFileSync('.secret').toString().trim()
const deployer = fs.readFileSync('.secret.mainnet').toString().trim()
const etherscanApiKey = fs.readFileSync('.secret.etherscan').toString().trim()
module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.8.4',
      },
      {
        version: '0.7.5',
      },
      {
        version: '0.5.16', // for uniswap v2
      },
    ],
  },
  networks: {
    'mainnet': {
      url: 'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
      accounts: [deployer],
      gasPrice: 35000000000,
      // gas: 20000000,
    },
    'rinkeby': {
      url: 'https://rinkeby.infura.io/v3/d98b322397ca41ee86d071d157435ba1',
      accounts: [dev],
      gasPrice: 1200000000,
    },
    // hardhat: {
    //   gas: 'auto',
    // },
  },
  etherscan: {
    apiKey: etherscanApiKey,
  },
  mocha: {
    timeout: 5 * 60 * 10000,
  },
}
