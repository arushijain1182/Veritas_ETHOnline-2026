// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Test/demo stand-in for USDC. 6 decimals, matching the real
/// token, so payout math (Stage 5's rounding behavior) is representative.
/// `mint` is unrestricted — this is a faucet for testnet/demo use only,
/// never deploy this to a network where it could be mistaken for real USDC.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USD Coin", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
