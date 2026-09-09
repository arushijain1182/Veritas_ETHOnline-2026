// SPDX-License-Identifier: MIT
pragma solidity =0.5.16;

// Vendored purely to get local/test/demo deployments of the real Uniswap V2
// Factory and canonical WETH9. See UniswapV2Vendor.sol for the Router
// (pinned to a different exact pragma, hence the separate file).
//
// solhint-disable no-unused-import
import "@uniswap/v2-core/contracts/UniswapV2Factory.sol";
import "canonical-weth/contracts/WETH9.sol";
