// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMarketResolver} from "./interfaces/IMarketResolver.sol";

/// @title CREMarketResolverReceiver
/// @notice Bridges Chainlink CRE's report/forwarder write mechanism to a market
/// contract's IMarketResolver.resolveMarket(). This is the contract that should
/// be set as the market contract's authorized `resolver` — not an EOA, and not
/// the CRE workflow's own identity, since CRE (per the SDK: EVMClient.writeReport
/// in resolver/cre-workflow/src/main.ts) writes on-chain via a signed report
/// submitted through a Forwarder, which then calls a fixed receiver method on
/// this contract, not an arbitrary function on the market contract directly.
///
/// CAVEAT: `onReport`'s selector/signature and the `onlyForwarder` check below
/// follow the standard Chainlink Forwarder->Receiver shape used elsewhere in
/// Chainlink's Keystone architecture. This has not been verified against a live
/// CRE deployment's actual forwarder contract (Confidential Workflows are
/// private-beta as of writing) — confirm the exact interface once you have DON
/// access, per resolver/cre-workflow/README.md.
contract CREMarketResolverReceiver is Ownable {
    /// @notice The market contract this receiver ultimately resolves.
    IMarketResolver public immutable market;

    /// @notice The only address allowed to call `onReport` — the CRE Forwarder
    /// contract for the chain this receiver is deployed on.
    address public forwarder;

    event ForwarderUpdated(address indexed oldForwarder, address indexed newForwarder);
    event ReportRelayed(uint256 indexed marketId, uint256 winningOption);

    error NotForwarder();
    error InvalidReportLength();

    modifier onlyForwarder() {
        if (msg.sender != forwarder) revert NotForwarder();
        _;
    }

    constructor(address marketContract, address initialForwarder) Ownable(msg.sender) {
        market = IMarketResolver(marketContract);
        forwarder = initialForwarder;
    }

    function setForwarder(address newForwarder) external onlyOwner {
        emit ForwarderUpdated(forwarder, newForwarder);
        forwarder = newForwarder;
    }

    /// @notice Called by the CRE Forwarder with the DON-verified report body.
    /// `report` is expected to be abi.encode(uint256 marketId, uint256 winningOption)
    /// — the exact payload `writeResolutionOnChain` in the CRE workflow encodes.
    /// `metadata` (workflow id / owner / DON info) is accepted but unused here;
    /// the Forwarder is trusted to have already verified DON signatures before
    /// calling this function, which is why only `onlyForwarder` gates it.
    function onReport(bytes calldata metadata, bytes calldata report) external onlyForwarder {
        metadata; // unused; see NatSpec above
        if (report.length != 64) revert InvalidReportLength();

        (uint256 marketId, uint256 winningOption) = abi.decode(report, (uint256, uint256));
        market.resolveMarket(marketId, winningOption);

        emit ReportRelayed(marketId, winningOption);
    }
}
