// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal slice of the real Uniswap V2 Router interface — only the
/// functions Market.sol actually calls. Deliberately not the full interface
/// (no liquidity/removeLiquidity/etc.) to keep the surface area Market.sol
/// depends on small and auditable. Matches the real uniswap/v2-periphery
/// IUniswapV2Router02 ABI exactly for the functions included, so this can
/// point at either a locally-deployed Uniswap V2 Router (see
/// contracts/vendor/) or a real deployed one on a live network without any
/// code changes.
interface IUniswapV2Router02 {
    function WETH() external pure returns (address);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);
}
