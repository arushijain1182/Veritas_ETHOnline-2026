// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMarketResolver} from "./interfaces/IMarketResolver.sol";

/// @title MarketResolution
/// @notice Reference implementation of the full market lifecycle (create / bet / resolve /
/// claim). Creation, betting and claim logic are Agent 2's area of ownership per the shared
/// design in AGENT_COORDINATION_1.md; this contract exists so Agent 1's mock resolver script
/// and Chainlink CRE workflow have a real `IMarketResolver`-compatible target to call and test
/// against before Agent 2's contract is ready. An authorized Chainlink resolver settles the
/// outcome via `resolveMarket`, and winners pull their own payout instead of the contract
/// pushing funds to every staker.
contract MarketResolution is Ownable, ReentrancyGuard, IMarketResolver {
    struct Market {
        string question;
        string[] options;
        uint256 closingTime;
        uint256 winningOption;
        uint256 totalPool;
        bool resolved;
    }

    /// @notice Address of the authorized Chainlink workflow/resolver allowed to settle markets.
    address public resolver;

    uint256 public marketCount;

    mapping(uint256 => Market) private markets;
    // marketId => optionIndex => total staked on that option
    mapping(uint256 => mapping(uint256 => uint256)) public optionPool;
    // marketId => user => optionIndex => amount staked
    mapping(uint256 => mapping(address => mapping(uint256 => uint256))) public stakes;
    // marketId => user => has claimed payout
    mapping(uint256 => mapping(address => bool)) public claimed;

    event MarketCreated(uint256 indexed marketId, string question, string[] options, uint256 closingTime);
    event BetPlaced(uint256 indexed marketId, address indexed user, uint256 indexed optionIndex, uint256 amount);
    event MarketResolved(uint256 indexed marketId, uint256 winningOption, uint256 totalPool);
    event Claimed(uint256 indexed marketId, address indexed user, uint256 amount);
    event ResolverUpdated(address indexed oldResolver, address indexed newResolver);

    error MarketDoesNotExist();
    error MarketClosed();
    error MarketNotClosed();
    error MarketAlreadyResolved();
    error MarketNotResolved();
    error InvalidOption();
    error InvalidClosingTime();
    error NotResolver();
    error ZeroAmount();
    error AlreadyClaimed();
    error NoWinningStake();
    error TransferFailed();

    modifier onlyResolver() {
        if (msg.sender != resolver) revert NotResolver();
        _;
    }

    modifier marketExists(uint256 marketId) {
        if (marketId >= marketCount) revert MarketDoesNotExist();
        _;
    }

    constructor(address initialResolver) Ownable(msg.sender) {
        resolver = initialResolver;
    }

    /// @notice Update the address authorized to resolve markets (the Chainlink workflow/resolver).
    function setResolver(address newResolver) external onlyOwner {
        emit ResolverUpdated(resolver, newResolver);
        resolver = newResolver;
    }

    /// @notice Create a new market.
    /// @param question Human-readable market question.
    /// @param options Possible outcomes, e.g. ["Himadri", "Someone Else"].
    /// @param closingTime Unix timestamp after which no more bets can be placed.
    function createMarket(
        string calldata question,
        string[] calldata options,
        uint256 closingTime
    ) external onlyOwner returns (uint256 marketId) {
        if (options.length < 2) revert InvalidOption();
        if (closingTime <= block.timestamp) revert InvalidClosingTime();

        marketId = marketCount++;
        Market storage m = markets[marketId];
        m.question = question;
        for (uint256 i = 0; i < options.length; i++) {
            m.options.push(options[i]);
        }
        m.closingTime = closingTime;

        emit MarketCreated(marketId, question, options, closingTime);
    }

    /// @notice Stake ETH on an option before the market closes.
    function placeBet(uint256 marketId, uint256 optionIndex) external payable marketExists(marketId) {
        Market storage m = markets[marketId];
        if (block.timestamp >= m.closingTime) revert MarketClosed();
        if (optionIndex >= m.options.length) revert InvalidOption();
        if (msg.value == 0) revert ZeroAmount();

        stakes[marketId][msg.sender][optionIndex] += msg.value;
        optionPool[marketId][optionIndex] += msg.value;
        m.totalPool += msg.value;

        emit BetPlaced(marketId, msg.sender, optionIndex, msg.value);
    }

    /// @notice Settle a market's outcome. Callable only by the authorized Chainlink resolver.
    function resolveMarket(uint256 marketId, uint256 winningOption) external onlyResolver marketExists(marketId) {
        Market storage m = markets[marketId];
        if (block.timestamp < m.closingTime) revert MarketNotClosed();
        if (m.resolved) revert MarketAlreadyResolved();
        if (winningOption >= m.options.length) revert InvalidOption();

        m.winningOption = winningOption;
        m.resolved = true;

        emit MarketResolved(marketId, winningOption, m.totalPool);
    }

    /// @notice Pull-payment claim: each winner withdraws their own share of the pool.
    /// Payout is proportional to the caller's stake on the winning option relative to
    /// the total staked on that option, applied to the market's entire pool.
    function claim(uint256 marketId) external nonReentrant marketExists(marketId) {
        Market storage m = markets[marketId];
        if (!m.resolved) revert MarketNotResolved();
        if (claimed[marketId][msg.sender]) revert AlreadyClaimed();

        uint256 userStake = stakes[marketId][msg.sender][m.winningOption];
        if (userStake == 0) revert NoWinningStake();

        uint256 winningPool = optionPool[marketId][m.winningOption];
        uint256 payout = (userStake * m.totalPool) / winningPool;

        claimed[marketId][msg.sender] = true;

        (bool success, ) = msg.sender.call{value: payout}("");
        if (!success) revert TransferFailed();

        emit Claimed(marketId, msg.sender, payout);
    }

    function getMarket(uint256 marketId)
        external
        view
        marketExists(marketId)
        returns (
            string memory question,
            string[] memory options,
            uint256 closingTime,
            uint256 winningOption,
            uint256 totalPool,
            bool resolved
        )
    {
        Market storage m = markets[marketId];
        return (m.question, m.options, m.closingTime, m.winningOption, m.totalPool, m.resolved);
    }

    function getUserStake(uint256 marketId, address user, uint256 optionIndex) external view returns (uint256) {
        return stakes[marketId][user][optionIndex];
    }

    /// @notice Preview a user's claimable payout without submitting a transaction.
    function previewClaim(uint256 marketId, address user) external view marketExists(marketId) returns (uint256) {
        Market storage m = markets[marketId];
        if (!m.resolved || claimed[marketId][user]) return 0;

        uint256 userStake = stakes[marketId][user][m.winningOption];
        if (userStake == 0) return 0;

        uint256 winningPool = optionPool[marketId][m.winningOption];
        return (userStake * m.totalPool) / winningPool;
    }
}
