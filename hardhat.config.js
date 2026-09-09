require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ quiet: true });

const sepoliaAccounts = process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY ? [process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY] : [];

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          // OpenZeppelin's Strings/Bytes utilities (pulled in by
          // OutcomeToken's symbol generation) use MCOPY, a Cancun opcode.
          // Safe on any network this project targets — Dencun has been live
          // on Ethereum mainnet and every public testnet since March 2024.
          evmVersion: "cancun",
        },
      },
      // Real Uniswap V2 core/periphery + canonical WETH9, vendored under
      // contracts/vendor/ for local test/demo deployment (see
      // contracts/vendor/UniswapV2Vendor.sol). Pinned to the exact versions
      // those packages ship with.
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: sepoliaAccounts,
    },
  },
};
