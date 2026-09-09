// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IMarketResolver} from "./interfaces/IMarketResolver.sol";
import {IUniswapV2Router02} from "./uniswap/IUniswapV2Router02.sol";

/// @title Market
/// @notice IITD Markets: a USDC-denominated campus prediction market. Users
/// contribute USDC to an outcome; on resolution the platform takes a 10%
/// fee and the remaining 90% is split among winners proportional to their
/// stake on the winning option. Implements IMarketResolver so Agent 1's
/// mock resolver / Chainlink CRE workflow (via CREMarketResolverReceiver)
/// can settle markets exactly the way they already do against
/// MarketResolution.sol — this contract is the real one, that one was the
/// scaffold used to build and test the resolver side.
contract Market is Ownable, ReentrancyGuard, IMarketResolver {
    enum Status {
        OPEN,
        CLOSED,
        RESOLVED
    }

    struct MarketData {
        string question;
        string[] options;
        uint256 closeTime;
        Status status;
        uint256 totalPool;
        uint256 winningOption;
        uint256 platformFee; // locked in at resolution
        uint256 prizePool; // totalPool - platformFee, locked in at resolution
    }

    uint16 public constant PLATFORM_FEE_BPS = 1000; // 10.00%, in basis points (10000 = 100%)

    IERC20 public immutable usdc;
    IUniswapV2Router02 public immutable uniswapRouter;

    address public resolver;
    address public feeRecipient;

    uint256 public marketCount;
    mapping(uint256 => MarketData) private markets;
    // marketId => option => total USDC staked on that option
    mapping(uint256 => mapping(uint256 => uint256)) public optionPool;
    // user => marketId => option => amount staked
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) public userContribution;
    // user => marketId => has claimed
    mapping(address => mapping(uint256 => bool)) public claimed;

    event MarketCreated(uint256 indexed marketId, string question, string[] options, uint256 closeTime);
    event BetPlaced(uint256 indexed marketId, address indexed user, uint256 indexed option, uint256 amount);
    event SwappedETHForUSDC(address indexed user, uint256 ethIn, uint256 usdcOut);
    event MarketClosed(uint256 indexed marketId);
    event MarketResolved(
        uint256 indexed marketId,
        uint256 winningOption,
        uint256 totalPool,
        uint256 platformFee,
        uint256 prizePool
    );
    event Claimed(uint256 indexed marketId, address indexed user, uint256 amount);
    event ResolverUpdated(address indexed oldResolver, address indexed newResolver);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    error MarketDoesNotExist();
    error InvalidOption();
    error InvalidCloseTime();
    error MarketNotOpen();
    error MarketClosedForBetting();
    error ZeroAmount();
    error MarketNotClosed();
    error MarketAlreadyResolved();
    error MarketNotResolved();
    error CloseTimeNotReached();
    error NotResolver();
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

    constructor(address usdcAddress, address uniswapRouterAddress, address initialResolver) Ownable(msg.sender) {
        usdc = IERC20(usdcAddress);
        uniswapRouter = IUniswapV2Router02(uniswapRouterAddress);
        resolver = initialResolver;
        feeRecipient = msg.sender;
    }

    function setResolver(address newResolver) external onlyOwner {
        emit ResolverUpdated(resolver, newResolver);
        resolver = newResolver;
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        emit FeeRecipientUpdated(feeRecipient, newRecipient);
        feeRecipient = newRecipient;
    }

    // ---------------------------------------------------------------------
    // Stage 1: market creation
    // ---------------------------------------------------------------------

    function createMarket(
        string calldata question,
        string[] calldata options,
        uint256 closeTime
    ) external onlyOwner returns (uint256 marketId) {
        if (options.length < 2) revert InvalidOption();
        if (closeTime <= block.timestamp) revert InvalidCloseTime();

        marketId = marketCount++;
        MarketData storage m = markets[marketId];
        m.question = question;
        for (uint256 i = 0; i < options.length; i++) {
            m.options.push(options[i]);
        }
        m.closeTime = closeTime;
        m.status = Status.OPEN;

        emit MarketCreated(marketId, question, options, closeTime);
    }

    // ---------------------------------------------------------------------
    // Stage 2: betting
    // ---------------------------------------------------------------------

    /// @notice Bet with USDC directly (must `approve` this contract first).
    function placeBet(uint256 marketId, uint256 option, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        bool ok = usdc.transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();
        _recordBet(marketId, option, amount, msg.sender);
    }

    /// @notice Stage 6 (Uniswap MVP): swap ETH for USDC through the real
    /// Uniswap V2 Router and bet the proceeds in one transaction — the
    /// "obtain the settlement asset via Uniswap" flow, gated directly
    /// behind a core action rather than a decorative swap widget.
    function placeBetWithETH(
        uint256 marketId,
        uint256 option,
        uint256 minUSDCOut
    ) external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();

        address[] memory path = new address[](2);
        path[0] = uniswapRouter.WETH();
        path[1] = address(usdc);

        uint256 balanceBefore = usdc.balanceOf(address(this));
        uniswapRouter.swapExactETHForTokens{value: msg.value}(minUSDCOut, path, address(this), block.timestamp);
        uint256 received = usdc.balanceOf(address(this)) - balanceBefore;

        emit SwappedETHForUSDC(msg.sender, msg.value, received);
        _recordBet(marketId, option, received, msg.sender);
    }

    /// @notice Frontend helper: quote how much USDC `ethAmountIn` would buy
    /// right now via the configured Uniswap Router, without sending a tx.
    function quoteETHForUSDC(uint256 ethAmountIn) external view returns (uint256 usdcOut) {
        address[] memory path = new address[](2);
        path[0] = uniswapRouter.WETH();
        path[1] = address(usdc);
        uint256[] memory amounts = uniswapRouter.getAmountsOut(ethAmountIn, path);
        return amounts[1];
    }

    function _recordBet(uint256 marketId, uint256 option, uint256 amount, address user) internal marketExists(marketId) {
        MarketData storage m = markets[marketId];
        if (m.status != Status.OPEN) revert MarketNotOpen();
        if (block.timestamp >= m.closeTime) revert MarketClosedForBetting();
        if (option >= m.options.length) revert InvalidOption();

        m.totalPool += amount;
        optionPool[marketId][option] += amount;
        userContribution[user][marketId][option] += amount;

        emit BetPlaced(marketId, user, option, amount);
    }

    // ---------------------------------------------------------------------
    // Stage 3: closing
    // ---------------------------------------------------------------------

    /// @notice Anyone can close a market once its close time has passed —
    /// the timestamp check is the real guard, not the caller's identity.
    function closeMarket(uint256 marketId) external marketExists(marketId) {
        MarketData storage m = markets[marketId];
        if (m.status != Status.OPEN) revert MarketNotOpen();
        if (block.timestamp < m.closeTime) revert CloseTimeNotReached();

        m.status = Status.CLOSED;
        emit MarketClosed(marketId);
    }

    // ---------------------------------------------------------------------
    // Stage 4/5: resolution (Agent 1's side calls this) + fee accounting
    // ---------------------------------------------------------------------

    function resolveMarket(uint256 marketId, uint256 winningOption) external onlyResolver marketExists(marketId) {
        MarketData storage m = markets[marketId];
        if (m.status == Status.OPEN) revert MarketNotClosed();
        if (m.status == Status.RESOLVED) revert MarketAlreadyResolved();
        if (winningOption >= m.options.length) revert InvalidOption();

        uint256 platformFee = (m.totalPool * PLATFORM_FEE_BPS) / 10000;
        uint256 prizePool = m.totalPool - platformFee;

        m.status = Status.RESOLVED;
        m.winningOption = winningOption;
        m.platformFee = platformFee;
        m.prizePool = prizePool;

        if (platformFee > 0) {
            bool ok = usdc.transfer(feeRecipient, platformFee);
            if (!ok) revert TransferFailed();
        }

        emit MarketResolved(marketId, winningOption, m.totalPool, platformFee, prizePool);
    }

    // ---------------------------------------------------------------------
    // Stage 4: claim-based payout (never pushed, never looped)
    // ---------------------------------------------------------------------

    function claim(uint256 marketId) external nonReentrant marketExists(marketId) {
        MarketData storage m = markets[marketId];
        if (m.status != Status.RESOLVED) revert MarketNotResolved();
        if (claimed[msg.sender][marketId]) revert AlreadyClaimed();

        uint256 userStake = userContribution[msg.sender][marketId][m.winningOption];
        if (userStake == 0) revert NoWinningStake();

        uint256 winningPool = optionPool[marketId][m.winningOption];
        uint256 payout = (userStake * m.prizePool) / winningPool;

        claimed[msg.sender][marketId] = true;

        bool ok = usdc.transfer(msg.sender, payout);
        if (!ok) revert TransferFailed();

        emit Claimed(marketId, msg.sender, payout);
    }

    /// @notice Preview a user's claimable payout without submitting a tx —
    /// used by the Results screen ("Your payout: ...") before claiming.
    function previewClaim(uint256 marketId, address user) external view marketExists(marketId) returns (uint256) {
        MarketData storage m = markets[marketId];
        if (m.status != Status.RESOLVED || claimed[user][marketId]) return 0;

        uint256 userStake = userContribution[user][marketId][m.winningOption];
        if (userStake == 0) return 0;

        uint256 winningPool = optionPool[marketId][m.winningOption];
        if (winningPool == 0) return 0;
        return (userStake * m.prizePool) / winningPool;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getMarket(uint256 marketId)
        external
        view
        marketExists(marketId)
        returns (
            string memory question,
            string[] memory options,
            uint256 closeTime,
            Status status,
            uint256 totalPool,
            uint256 winningOption,
            uint256 platformFee,
            uint256 prizePool
        )
    {
        MarketData storage m = markets[marketId];
        return (m.question, m.options, m.closeTime, m.status, m.totalPool, m.winningOption, m.platformFee, m.prizePool);
    }

    function getOptionPool(uint256 marketId, uint256 option) external view returns (uint256) {
        return optionPool[marketId][option];
    }
}
