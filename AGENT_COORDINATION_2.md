# Agent Coordination — Agent 2 (Market / Uniswap)

Status handoff doc for Agent 2's side. See [`AGENT_COORDINATION_1.md`](AGENT_COORDINATION_1.md)
for Agent 1's side (Chainlink CRE resolution) and the shared `IMarketResolver`
contract between us.

## What's built

- **[`contracts/Market.sol`](contracts/Market.sol)** — the real market contract
  the project ships (`MarketResolution.sol` remains Agent 1's reference/mock
  target only, per its own coordination doc). USDC-denominated, implements
  `IMarketResolver` so it plugs directly into Agent 1's mock resolver and,
  once deployed, the CRE workflow via `CREMarketResolverReceiver`.

  - `createMarket(question, options[], closeTime)` — `onlyOwner`, ≥2 options,
    `closeTime` must be in the future. Returns `marketId` (0-indexed,
    incrementing).
  - `placeBet(marketId, option, amount)` — USDC path; caller must
    `approve()` the contract first.
  - `placeBetWithETH(marketId, option, minUSDCOut)` *(payable)* — Stage 6
    Uniswap MVP: swaps `msg.value` ETH for USDC through the real Uniswap V2
    Router (`swapExactETHForTokens`) and bets the *actual* USDC received
    (not the ETH amount) in the same transaction. `quoteETHForUSDC(ethIn)`
    is a view helper for the frontend to show an estimate before the swap.
  - `closeMarket(marketId)` — callable by anyone once `block.timestamp >=
    closeTime` (the timestamp is the real guard, not the caller). Betting
    also independently reverts past `closeTime` even if nobody has called
    `closeMarket` yet.
  - `resolveMarket(marketId, winningOption)` — `onlyResolver` (Agent 1's
    side calls this). Locks in `platformFee` (10%, `PLATFORM_FEE_BPS =
    1000`) and `prizePool` (90%) at resolution time and immediately pays
    the fee to `feeRecipient` (owner-settable, defaults to the deployer).
  - `claim(marketId)` — pull-payment payout, proportional to the caller's
    **current balance of the winning option's OutcomeToken** (see the
    stretch goal below — not the original `userContribution`, since
    positions are transferable): `payout = tokenBalance * prizePool /
    winningOptionPool`, then burns that balance. No loop over winners
    anywhere in the contract (verified by a gas-flatness test with 10
    independent stakers, matching Agent 1's equivalent test for
    `MarketResolution.sol`). Burning (rather than a separate `claimed`
    flag) is what makes a repeat call safe *and* non-permanent — acquire
    more of the winning token later (e.g. buy it on Uniswap after a
    partial claim) and that new balance is claimable too.
  - `previewClaim(marketId, user)` — view version of the same math, for the
    Results screen ("Your payout: ...") before submitting a claim tx.
  - `getMarket(marketId)`, `getOptionPool(marketId, option)`,
    `getOutcomeToken(marketId, option)` — views for the frontend's market
    list/detail screens.
  - Events: `MarketCreated`, `OutcomeTokenCreated`, `BetPlaced`,
    `SwappedETHForUSDC`, `MarketClosed`, `MarketResolved` (includes
    `totalPool`/`platformFee`/`prizePool` so the UI's fee breakdown doesn't
    need a second read), `Claimed`, `ResolverUpdated`,
    `FeeRecipientUpdated`.

- **[`contracts/OutcomeToken.sol`](contracts/OutcomeToken.sol)** — Stage 6
  **stretch goal**, now built: a transferable ERC20 per option
  ("HIMADRI-M1", 6 decimals to match USDC 1:1), mint/burn restricted to the
  `Market` contract that deployed it. `createMarket` deploys one per option
  and — best-effort, via `contracts/uniswap/IUniswapV2Factory.sol` — lists
  it on a real Uniswap V2 pair against USDC (`factory.createPair`), so
  positions are tradeable on a real AMM before resolution, not just an
  internal ledger entry. Listing is skipped (token still works, `pair` just
  reads `address(0)` from `getOutcomeToken`) if `uniswapRouter` has no code
  at that address — e.g. a test that doesn't care about Uniswap at all —
  so the stretch goal genuinely never blocks market creation. `placeBet`
  and `placeBetWithETH` both mint the bettor tokens 1:1 with the USDC
  staked; `claim` burns whatever the winning token's current holder has.
  `userContribution` is kept as a historical record only (who originally
  bet what) — it is **not** consulted for payout, since a transferred
  position pays whoever holds/burns the token, not whoever placed the
  original bet. See `test/OutcomeToken.test.js` for the full behavior:
  a buyer who never called `placeBet` claiming after buying the winning
  token on Uniswap, a seller partially exiting pre-resolution, and
  `scripts/demoMarket.js`'s "Stage 6" section for a live walkthrough.

- **[`contracts/mocks/MockUSDC.sol`](contracts/mocks/MockUSDC.sol)** —
  6-decimal ERC20 stand-in for USDC (unrestricted `mint`, test/demo only).

- **Uniswap integration** — real Uniswap V2, not a logo:
  - [`contracts/uniswap/IUniswapV2Router02.sol`](contracts/uniswap/IUniswapV2Router02.sol) —
    the minimal Router slice `Market.sol` actually calls.
  - [`contracts/vendor/`](contracts/vendor/) — vendors the *real*
    `@uniswap/v2-core` Factory + canonical `WETH9` + a **locally patched
    copy** of `@uniswap/v2-periphery`'s `UniswapV2Router02` for
    local/test/demo deployment. **Why patched**: `UniswapV2Library.pairFor`
    hardcodes a CREATE2 init-code-hash for `UniswapV2Pair` that only matches
    Uniswap's original 0.5.16 build — this repo's own compile of
    `UniswapV2Pair` (different Hardhat/solc/optimizer config) produces
    different bytecode and therefore a different hash, so the unpatched
    library derives the wrong pair address and every Router call reverts
    against a non-contract. Fixed by vendoring
    `contracts/vendor/uniswap-v2-periphery/libraries/UniswapV2Library.sol`
    with the hash recomputed for this repo's build
    (`scripts/lib/computeInitCodeHash.js` — rerun it and update the constant
    if `UniswapV2Pair`'s compiler settings ever change). On a live network
    this entire vendor step is skipped — `Market.sol`'s constructor just
    takes the real deployed Router address.
  - `Market.placeBetWithETH` is the "obtain the settlement asset through
    Uniswap" flow from the brief, gated directly behind a core action
    (placing a bet) rather than a decorative swap widget.

- **[`test/Market.test.js`](test/Market.test.js)** — 34 tests: market
  creation/views, invalid market id, close-before/after-deadline, valid/zero/
  insufficient-balance/after-close betting, resolver access control, the
  1000/700/100 → 128.57 USDC example from the brief exactly, losing bettors,
  multiple winners, rounding/dust, double-claim (now via burned tokens, not
  a `claimed` flag — see the stretch goal), gas-flat claim scaling, and the
  Uniswap path (successful swap, zero-ETH revert, slippage-protection
  revert, no-liquidity revert, and that the bet is credited with the actual
  swap output). Run with `npx hardhat test test/Market.test.js`.
- **[`test/OutcomeToken.test.js`](test/OutcomeToken.test.js)** — 11 tests
  for the stretch goal: token deployed + listed on a real Uniswap pair per
  option (and gracefully pairless if the router has no code), 1:1 minting
  from both bet paths, mint/burn access control (`onlyMarket`), a buyer who
  never placed a bet claiming after acquiring the winning token, a seller
  splitting a position and each side claiming their own remaining share, a
  fresh balance acquired *after* a first claim still being claimable (no
  permanent lockout), and real secondary-market trades (sell pre-resolution
  for USDC, buy in with no bet history) through the actual Router.
  **82/82 passing** across all three agents' suites (`npx hardhat test`).

- **[`scripts/deployMarket.js`](scripts/deployMarket.js)** — deploys
  `Market` on any network. Locally (`hardhat`/`localhost`, no addresses
  given) it deploys `MockUSDC` + the vendored Uniswap V2 stack and seeds a
  WETH/USDC pool. On a live network, set `USDC_ADDRESS`,
  `UNISWAP_ROUTER_ADDRESS`, and `RESOLVER_ADDRESS` (the real USDC, the real
  Uniswap V2 Router, and `CREMarketResolverReceiver`'s address respectively)
  — see that file's header comment for exact usage.

- **[`scripts/demoMarket.js`](scripts/demoMarket.js)** — Stage 10
  deterministic demo covering the brief's story end to end, including the
  stretch goal: deploy → create market (marketId 1, matching Agent 1's
  `market-registry.json` mapping for `IITD-CRICKET-2026-FINAL`) → Alice
  bets 500 USDC directly on HIMADRI → Bob swaps 0.1 ETH for USDC via the
  real Uniswap Router and bets it on KARAKORAM → pool/probability shown →
  Alice LPs 200 of her HIMADRI position tokens against USDC on Uniswap →
  Carol buys ~66 HIMADRI tokens on that secondary market, *never once
  calling `placeBet`* → close → resolve via Agent 1's mock resolver
  (Himadri wins) → fee/prize breakdown shown → both Alice and Carol claim,
  each getting paid for the tokens they actually hold. Run:
  `npx hardhat run scripts/demoMarket.js`.

- **[`frontend/`](frontend/)** — React + TypeScript + Vite app, wagmi/viem
  for wallet + contract calls (injected connector — MetaMask etc.). Three
  screens per the brief:
  - **Market list** (`src/pages/MarketListPage.tsx`) — question, live
    per-option percentages (from `getOptionPool`), total pool, status badge.
  - **Market page** (`src/pages/MarketPage.tsx`) — pool bars per option,
    close time, the connected user's position, and (while `OPEN`) two bet
    tabs: `BetForm` (direct USDC, approve-gated) and `SwapBetForm` (ETH ->
    USDC via the real Uniswap V2 Router, `quoteETHForUSDC` preview + 1%
    slippage tolerance) — the Stage 6 Uniswap MVP surfaced directly in the
    UI, not just the contract. Shows a "Close Market" action once
    `closeTime` has passed. All reads poll every 4s so pool/status update
    live as other users bet/close/resolve.
  - **Results/claim** (`ClaimPanel`, shown on the same market page once
    `RESOLVED`) — winner, total pool / platform fee (10%) / winner pool
    (90%) breakdown, the user's original contribution and `previewClaim`
    payout (now reflecting current OutcomeToken balance, not the original
    bet — see the stretch goal), and a `claim` button.
  - A **Position tokens** section on the market page surfaces the stretch
    goal in the UI, not just the contract: each option's OutcomeToken
    address and its Uniswap V2 pair address (or "not listed"), so a user
    can find and trade the position in their own wallet / any Uniswap
    front-end.
  - Plus a fourth, owner-gated **Create Market** page
    (`src/pages/CreateMarketPage.tsx`) for the "market creation UI"
    deliverable — only visible/usable when the connected wallet is
    `Market.owner()`.
  - Every write action (approve/bet/swap-bet/close/claim/create) shows a
    `TxStatus` indicator: signing -> confirming -> confirmed/error, per the
    brief's "transaction status" requirement.
  - `npm run sync-abi` / `sync-deployment` regenerate `src/abi/*.json` /
    `src/config/deployment.json` from the Hardhat build + `deployments/
    <network>.json` (written by `scripts/deployMarket.js`) — see
    `frontend/README.md` for the full local-dev and live-network setup.
  - **Verified working end-to-end against a real local deployment**: ran a
    headless-browser session (Playwright) with a minimal injected
    EIP-1193 provider forwarding to a live `npx hardhat node`, driving real
    wallet-gated transactions through the actual UI — connect wallet,
    approve USDC, place a direct bet, swap ETH for USDC via Uniswap and bet
    it, and claim a resolved market's payout — and confirmed the on-chain
    state (pool totals, balances, allowances) matched what the UI showed at
    every step. Caught and fixed one real bug this way: `BetForm`'s
    "which transaction's status to show" logic switched away from the
    approve transaction the instant it confirmed (deferring to the not-yet-
    started bet transaction, which was still idle), so the "Approved"
    confirmation was never actually visible before the button flipped to
    "Place Prediction" — fixed to keep showing approve's status until the
    bet transaction itself starts.

## Not built

- Auto-seeded initial liquidity for every OutcomeToken/USDC pair — the pair
  is created at market creation (so it exists and anyone can add liquidity
  to it via the Router), but the contract itself doesn't fund and seed
  liquidity on its own. Left to whoever wants to LP (a market maker, the
  platform operator, or a bettor exiting a position), matching "provide
  Uniswap liquidity/secondary trading" as *enabling* the mechanism rather
  than the contract taking on custody/pricing risk it doesn't need to.

## Answers to Agent 1's open questions

- **ETH vs ERC20 staking**: ERC20 (USDC) — `MarketResolution.sol` used
  native ETH as a scaffold; `Market.sol` (the real contract) is
  USDC-denominated per the brief's "contribute USDC to that outcome's pool."
  ETH only ever appears transiently inside `placeBetWithETH`'s Uniswap swap.
- **Who can call `createMarket`**: `onlyOwner` for now (single admin/deployer
  account creates campus markets) — no permissionless market creation in
  this pass.
- **Early resolution**: no — `resolveMarket` requires the market to already
  be `CLOSED` (`m.status != Status.OPEN` check), same assumption Agent 1's
  side already makes.
- **`eventId` → `marketId` registry**: kept as the existing JSON file
  (`resolver/mock-result/market-registry.json`) for this stage; didn't move
  it on-chain. `scripts/demoMarket.js` deliberately creates a throwaway
  market first so the real one lands on `marketId 1` to match the existing
  registry entry without editing it.

## Market contract's read surface (what the frontend wires up)

- `getMarket(marketId)` (returns `question, options[], closeTime, status
  (0=OPEN/1=CLOSED/2=RESOLVED), totalPool, winningOption, platformFee,
  prizePool`) and `getOptionPool(marketId, option)`.
- `getOutcomeToken(marketId, option)` — returns `(token, pair)`, the
  option's transferable position token and its Uniswap V2 pair against
  USDC (`pair` is `address(0)` if listing was skipped — see
  `OutcomeToken.sol`'s coordination-doc entry above).
- User's *original* stake (historical, not payout-determining):
  `userContribution(user, marketId, option)`. A user's actual claimable
  position is their current OutcomeToken balance — `balanceOf` on the
  token from `getOutcomeToken`, or just call `previewClaim`.
- Payout preview before claiming: `previewClaim(marketId, user)` (returns 0
  if the user holds none of the winning token right now — whether because
  they never backed the winner, already claimed, or sold/transferred their
  position — safe to call unconditionally).
- Two bet paths: `placeBet` (needs an `approve()` first) and
  `placeBetWithETH` (needs `quoteETHForUSDC(ethIn)` for the estimate shown
  before the user confirms, then pass a `minUSDCOut` with slippage
  tolerance).
- `Market` ABI is in `artifacts/contracts/Market.sol/Market.json` after
  `npx hardhat compile` (or `frontend/src/abi/Market.json` after
  `npm run sync-abi`).
