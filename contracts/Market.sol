// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IMarketResolver} from "./interfaces/IMarketResolver.sol";
import {IUniswapV2Router02} from "./uniswap/IUniswapV2Router02.sol";
import {IUniswapV2Factory} from "./uniswap/IUniswapV2Factory.sol";
import {OutcomeToken} from "./OutcomeToken.sol";

/// @title Market
/// @notice IITD Markets: a USDC-denominated campus prediction market. Users
/// contribute USDC to an outcome; on resolution the platform takes a 10%
/// fee and the remaining 90% is split among winners proportional to their
/// stake on the winning option. Implements IMarketResolver so Agent 1's
/// mock resolver / Chainlink CRE workflow (via CREMarketResolverReceiver)
/// can settle markets exactly the way they already do against
/// MarketResolution.sol — this contract is the real one, that one was the
/// scaffold used to build and test the resolver side.
///
/// Stage 6 stretch goal: each option gets a transferable OutcomeToken,
/// minted 1:1 with USDC staked and listed on a Uniswap V2 token/USDC pair
/// at creation time — a real secondary market for positions, not just an
/// internal ledger. claim() pays out whoever holds (and burns) the
/// winning-option token, not whoever originally placed the bet.
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
        string category; // free-text, e.g. "Sports" — frontend groups/filters by it
    }

    uint16 public constant PLATFORM_FEE_BPS = 1000; // 10.00%, in basis points (10000 = 100%)

    IERC20 public immutable usdc;
    IUniswapV2Router02 public immutable uniswapRouter;

    address public resolver;
    address public feeRecipient;

    uint256 public marketCount;
    mapping(uint256 => MarketData) private markets;
    // marketId => option => total USDC staked on that option (also the
    // winning token's redeemable supply once resolved — see claim()).
    mapping(uint256 => mapping(uint256 => uint256)) public optionPool;
    // user => marketId => option => amount originally staked (historical
    // record only — NOT used for payout, since positions are transferable;
    // see OutcomeToken balances / claim()).
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) public userContribution;
    // marketId => option => this option's transferable position token.
    mapping(uint256 => mapping(uint256 => OutcomeToken)) public outcomeToken;
    // marketId => option => the token's Uniswap V2 pair against USDC
    // (address(0) if pair creation failed/was skipped — see createMarket).
    mapping(uint256 => mapping(uint256 => address)) public outcomeTokenPair;

    event MarketCreated(
        uint256 indexed marketId,
        string question,
        string[] options,
        uint256 closeTime,
        string category
    );
    event OutcomeTokenCreated(
        uint256 indexed marketId,
        uint256 indexed option,
        address indexed token,
        address uniswapPair
    );
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
        uint256 closeTime,
        string calldata category
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
        m.category = category;

        emit MarketCreated(marketId, question, options, closeTime, category);

        for (uint256 i = 0; i < options.length; i++) {
            _createOutcomeToken(marketId, i, options[i]);
        }
    }

    /// @dev Deploys the option's transferable position token and, best-effort,
    /// lists it on a Uniswap V2 pair against USDC. Never reverts market
    /// creation over Uniswap listing failing: on a network/test setup where
    /// `uniswapRouter` isn't a real, fully-wired Router (e.g. a placeholder
    /// address in a test that doesn't exercise Uniswap at all), this
    /// degrades to "token exists, just not listed yet" rather than bricking
    /// createMarket — the stretch goal must never block the MVP.
    ///
    /// The explicit code-size check (rather than relying on try/catch alone)
    /// matters: calling a view/pure function on an address with no code
    /// "succeeds" at the EVM level with empty returndata, and Solidity's
    /// try/catch cannot catch the resulting ABI-decode failure — it bubbles
    /// up as an uncatchable revert. try/catch only covers genuine reverts
    /// from real contract code (e.g. Factory.createPair on an existing pair).
    function _createOutcomeToken(uint256 marketId, uint256 option, string memory optionName) internal {
        string memory symbol = string.concat(optionName, "-M", Strings.toString(marketId));
        OutcomeToken token = new OutcomeToken(symbol, symbol, address(this));
        outcomeToken[marketId][option] = token;

        address pair = address(0);
        if (address(uniswapRouter).code.length > 0) {
            try uniswapRouter.factory() returns (address factoryAddr) {
                if (factoryAddr.code.length > 0) {
                    try IUniswapV2Factory(factoryAddr).createPair(address(token), address(usdc)) returns (address p) {
                        pair = p;
                    } catch {}
                }
            } catch {}
        }
        outcomeTokenPair[marketId][option] = pair;

        emit OutcomeTokenCreated(marketId, option, address(token), pair);
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
        outcomeToken[marketId][option].mint(user, amount);

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

    /// @dev Payout is proportional to the winning-option token balance the
    /// caller holds *right now* — not to who originally placed the bet
    /// (see OutcomeToken). Burning that balance is what makes a second call
    /// safe: with 0 tokens left, NoWinningStake fires on any repeat call,
    /// no separate "claimed" flag needed. It also means a claim is never
    /// permanently locked out — if the caller acquires more of the winning
    /// token later (e.g. buys more on Uniswap after a partial claim), that
    /// new balance is claimable too.
    function claim(uint256 marketId) external nonReentrant marketExists(marketId) {
        MarketData storage m = markets[marketId];
        if (m.status != Status.RESOLVED) revert MarketNotResolved();

        OutcomeToken token = outcomeToken[marketId][m.winningOption];
        uint256 tokenBalance = token.balanceOf(msg.sender);
        if (tokenBalance == 0) revert NoWinningStake();

        uint256 winningPool = optionPool[marketId][m.winningOption];
        uint256 payout = (tokenBalance * m.prizePool) / winningPool;

        token.burn(msg.sender, tokenBalance);

        bool ok = usdc.transfer(msg.sender, payout);
        if (!ok) revert TransferFailed();

        emit Claimed(marketId, msg.sender, payout);
    }

    /// @notice Preview a user's claimable payout without submitting a tx —
    /// used by the Results screen ("Your payout: ...") before claiming.
    function previewClaim(uint256 marketId, address user) external view marketExists(marketId) returns (uint256) {
        MarketData storage m = markets[marketId];
        if (m.status != Status.RESOLVED) return 0;

        OutcomeToken token = outcomeToken[marketId][m.winningOption];
        uint256 tokenBalance = token.balanceOf(user);
        if (tokenBalance == 0) return 0;

        uint256 winningPool = optionPool[marketId][m.winningOption];
        if (winningPool == 0) return 0;
        return (tokenBalance * m.prizePool) / winningPool;
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
            uint256 prizePool,
            string memory category
        )
    {
        MarketData storage m = markets[marketId];
        return (
            m.question,
            m.options,
            m.closeTime,
            m.status,
            m.totalPool,
            m.winningOption,
            m.platformFee,
            m.prizePool,
            m.category
        );
    }

    function getOptionPool(uint256 marketId, uint256 option) external view returns (uint256) {
        return optionPool[marketId][option];
    }

    /// @notice The option's transferable position token and its Uniswap V2
    /// pair against USDC (pair is address(0) if listing failed/was skipped
    /// at creation time — see createMarket's try/catch).
    function getOutcomeToken(uint256 marketId, uint256 option) external view returns (address token, address pair) {
        return (address(outcomeToken[marketId][option]), outcomeTokenPair[marketId][option]);
    }
}
