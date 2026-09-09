// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title OutcomeToken
/// @notice Stage 6 stretch goal: a transferable ERC20 representing a
/// position on one option of one market — "1 HIMADRI-M1 token = 1 USDC
/// (6 decimals) staked on HIMADRI in market 1, redeemable for a
/// proportional share of the 90% winner pool if HIMADRI wins." Minted 1:1
/// with the USDC a user stakes via Market.placeBet/placeBetWithETH, and
/// burned on Market.claim.
///
/// Transferable so it can be listed on Uniswap (Market.createMarket stands
/// up a token/USDC pair for each option) — a user can exit their position
/// before resolution by selling the token, or someone else can buy into a
/// position and later claim() the payout themselves. claim() pays out
/// whoever holds the token at resolution+claim time, not whoever
/// originally placed the bet — that's the whole point of making it a
/// tradeable asset rather than an internal ledger entry.
///
/// Mint/burn are restricted to the Market contract that deployed it (set
/// as `market` in the constructor, immutable) — never any other caller,
/// not even this token's own notion of an owner.
contract OutcomeToken is ERC20 {
    address public immutable market;

    error NotMarket();

    modifier onlyMarket() {
        if (msg.sender != market) revert NotMarket();
        _;
    }

    constructor(string memory name_, string memory symbol_, address market_) ERC20(name_, symbol_) {
        market = market_;
    }

    /// @dev Matches MockUSDC's 6 decimals so 1 token : 1 USDC-unit holds
    /// exactly, with no rescaling, throughout mint/transfer/burn/claim.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyMarket {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyMarket {
        _burn(from, amount);
    }
}
