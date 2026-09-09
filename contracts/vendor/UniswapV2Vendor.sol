// SPDX-License-Identifier: MIT
pragma solidity =0.6.6;

// This file exists purely so Hardhat compiles (and produces a deployable
// artifact for) the real, canonical Uniswap V2 Router alongside our own
// 0.8.24 contracts. Market.sol only ever talks to Uniswap through
// IUniswapV2Router02 (contracts/uniswap/IUniswapV2Router02.sol) — this
// import is solely to get a local/test/demo deployment of the actual
// Uniswap V2 Router, not something our contracts inherit from or call
// directly. Factory + WETH9 are vendored separately (UniswapV2FactoryVendor.sol)
// since they pin an incompatible exact pragma (0.5.16).
//
// Imports the local uniswap-v2-periphery/ copy (byte-for-byte the official
// UniswapV2Router02, see that directory's UniswapV2Library.sol) rather than
// the @uniswap/v2-periphery package directly: the package's Router hardcodes
// a CREATE2 init-code-hash for UniswapV2Pair that only matches the exact
// original 0.5.16 build Uniswap shipped, not this repo's own compile of
// UniswapV2Pair — using it as-is makes every Router call resolve to the
// wrong pair address and revert. See uniswap-v2-periphery/libraries/
// UniswapV2Library.sol for the fix and scripts/lib/computeInitCodeHash.js
// for how the corrected hash was derived.
//
// solhint-disable no-unused-import
import "./uniswap-v2-periphery/UniswapV2Router02.sol";
