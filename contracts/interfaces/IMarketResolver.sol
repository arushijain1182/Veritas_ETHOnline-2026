// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IMarketResolver
/// @notice Shared interface between the market contract (owned by Agent 2:
/// creation / betting / claim) and the resolution side (owned by Agent 1:
/// the mock resolver script and the Chainlink CRE workflow).
///
/// Whatever market contract Agent 2 ships MUST expose this function with
/// this exact selector so the resolver script / CRE workflow can call it
/// without knowing anything else about the contract's internals. The
/// implementing contract is responsible for:
///   - restricting the caller to a single authorized `resolver` address
///     (see MarketResolution.sol for a reference implementation)
///   - rejecting calls while the market is still OPEN (before closeTime)
///   - rejecting a second resolution of an already-RESOLVED market
///   - rejecting an out-of-range `winningOption`
interface IMarketResolver {
    /// @notice Transition a market from CLOSED to RESOLVED with the given
    /// winning option. Reverts if the caller is not the authorized resolver,
    /// the market isn't closed yet, it's already resolved, or the option is
    /// out of range.
    function resolveMarket(uint256 marketId, uint256 winningOption) external;
}
