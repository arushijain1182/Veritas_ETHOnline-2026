// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal slice of the real Uniswap V2 Factory interface — only
/// what Market.sol needs to stand up a secondary market for each outcome
/// token (Stage 6 stretch goal). Matches the real uniswap/v2-core
/// IUniswapV2Factory ABI exactly for the functions included.
interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);

    function createPair(address tokenA, address tokenB) external returns (address pair);
}
