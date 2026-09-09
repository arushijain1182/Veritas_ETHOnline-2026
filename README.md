# Veritas / IITD Markets — ETHOnline 2026

A campus prediction market for inter-hostel competitions:
`Market created -> students place predictions -> market closes -> official
result is processed -> market is resolved -> winners claim payout`.

Cross-agent status/handoff docs: [`AGENT_COORDINATION_1.md`](AGENT_COORDINATION_1.md) (this agent), `AGENT_COORDINATION_2.md` (the other agent).

## Agent 1 — Chainlink / Market Resolution

Owns the `CLOSED -> RESOLVED` transition and the Chainlink CRE integration.
Full details, architecture diagram, and the "why CRE / why confidential"
writeup: [`resolver/cre-workflow/README.md`](resolver/cre-workflow/README.md).
Cross-agent contract and status: [`AGENT_COORDINATION_1.md`](AGENT_COORDINATION_1.md).

**Layout**
- `contracts/interfaces/IMarketResolver.sol` — the interface any market
  contract must expose for the resolver/CRE workflow to call.
- `contracts/MarketResolution.sol` — reference/mock market contract
  (full create/bet/resolve/claim lifecycle) used to test the resolver side
  against something real before Agent 2's contract exists.
- `contracts/CREMarketResolverReceiver.sol` — Stage 5: the on-chain adapter
  the CRE workflow actually writes to (CRE writes via a signed report
  through a Forwarder, not arbitrary calldata) — decodes the report and
  calls `resolveMarket()`. This is what should be set as a market
  contract's `resolver`, not an EOA.
- `resolver/scripts/mockResolver.js` — Stage 1 mock resolver: reads a mock
  official result, validates + maps it, calls `resolveMarket()`. Use this to
  test any `IMarketResolver`-compatible contract right now.
- `resolver/mock-result/` — Stage 2 mock official-result source
  (`results.json`) and the eventId -> marketId/options registry
  (`market-registry.json`).
- `resolver/cre-workflow/` — Stage 3/4 the real Chainlink CRE workflow
  (TypeScript, type-checked against the real `@chainlink/cre-sdk` package —
  see its README's "verified vs. assumed" section), including the
  confidential fetch+validate path.
- `resolver/scripts/demo.js` — Stage 7 deterministic demo: deploy, create
  market, bet, close, resolve (Himadri wins), claim.
- `test/MarketResolution.test.js`, `test/resolver/` — 34 passing tests
  (contract lifecycle, resolver access control incl. invalid option / unknown
  market, resolution mapping/validation, end-to-end mock-resolver
  integration, the CRE receiver's forwarder-gated relay, payout math, and a
  gas-flatness check on resolution regardless of staker count).

**Usage**
```bash
npm install
npx hardhat compile
npx hardhat test                       # all 34 tests
npx hardhat run resolver/scripts/demo.js   # Stage 7 demo

# deploy the reference contract
RESOLVER_ADDRESS=0x... npx hardhat run scripts/deploy.js --network <network>

# run the mock resolver against any deployed IMarketResolver contract
MARKET_CONTRACT_ADDRESS=0x... EVENT_ID=IITD-CRICKET-2026-FINAL \
  npx hardhat run resolver/scripts/mockResolver.js --network <network>

# type-check the CRE workflow against the real SDK
cd resolver/cre-workflow && npm install && npm run build
```

**Definition of done (this stage)**: a closed prediction market can receive
a trustworthy competition result through the Chainlink workflow and become
irreversibly resolved on-chain, with the Chainlink integration a real part
of the state transition — not merely reading/displaying data. See
`resolver/cre-workflow/README.md` for why CRE (vs. a plain script) is
load-bearing here, and why the confidential-compute component is genuine
rather than a label.

## Agent 2 — Market / Uniswap

Owns the `OPEN -> CLOSED` betting side and the `RESOLVED -> claimed` payout
side, the Uniswap integration, and the frontend. Full details and open
items: cross-agent contract and status in
[`AGENT_COORDINATION_2.md`](AGENT_COORDINATION_2.md).

**Layout**
- `contracts/Market.sol` — the real market contract the project ships:
  USDC-denominated create/bet/close/claim, implements `IMarketResolver` so
  Agent 1's resolver side (mock resolver or, in production, the Chainlink
  CRE workflow via `CREMarketResolverReceiver`) settles it exactly the way
  it already settles `MarketResolution.sol`. 10% platform fee / 90% winner
  pool, locked in at resolution; claim-based payout (no loop over winners).
- `contracts/mocks/MockUSDC.sol` — 6-decimal test/demo USDC.
- `contracts/uniswap/IUniswapV2Router02.sol`, `contracts/vendor/` — the real
  Uniswap V2 stack (Factory + WETH9 + Router, with a locally patched
  `UniswapV2Library` init-code-hash — see `AGENT_COORDINATION_2.md` for
  why) for local/test/demo use; `Market.placeBetWithETH` swaps ETH for USDC
  through the real Router and bets the proceeds in one transaction.
- `contracts/OutcomeToken.sol` — **Stage 6 stretch goal**: a transferable
  ERC20 per market option, minted 1:1 with USDC staked and listed on its
  own Uniswap V2 pair against USDC at market creation — a real secondary
  market for positions. `claim()` pays out (and burns) whoever holds the
  winning token, not necessarily whoever placed the original bet.
- `test/Market.test.js` — 34 tests (creation/views, betting, closing,
  resolver access control, the spec's 1000/700/100 → 128.57 USDC payout
  example, multiple winners, rounding, double-claim, gas-flat claim
  scaling, and the Uniswap swap-and-bet path).
- `test/OutcomeToken.test.js` — 11 tests for the stretch goal: pair
  creation, 1:1 minting, mint/burn access control, a buyer who never bet
  claiming after buying the winning token on Uniswap, split positions,
  no-lockout on a post-claim token transfer, and real secondary-market
  trades through the Router.
- `scripts/deployMarket.js` — Stage-appropriate deploy script; local
  networks auto-deploy MockUSDC + a seeded Uniswap V2 stack, live networks
  take real `USDC_ADDRESS` / `UNISWAP_ROUTER_ADDRESS` / `RESOLVER_ADDRESS`.
- `scripts/demoMarket.js` — Stage 10 deterministic demo: deploy, create
  market, one direct USDC bet + one Uniswap ETH-swap bet, list + trade a
  position token on Uniswap (one buyer never places a bet at all), close,
  resolve (via Agent 1's mock resolver), both token holders claim.
- `frontend/` — React + TypeScript + Vite app (wagmi/viem): market list,
  market page (bet with USDC or swap ETH -> USDC via Uniswap, live
  pool/status polling, a position-token/Uniswap-pair info panel),
  results/claim screen, and an owner-gated market creation page. See
  [`frontend/README.md`](frontend/README.md) for setup.

**Usage**
```bash
npx hardhat test                           # all tests, including the stretch goal
npx hardhat run scripts/demoMarket.js      # Stage 10 demo

# deploy locally (auto-deploys MockUSDC + a local Uniswap V2 stack)
npx hardhat run scripts/deployMarket.js

# deploy to a live network against real USDC/Uniswap
USDC_ADDRESS=0x... UNISWAP_ROUTER_ADDRESS=0x... RESOLVER_ADDRESS=0x... \
  npx hardhat run scripts/deployMarket.js --network <network>

# frontend (after a local deploy above)
cd frontend && npm install && npm run sync-deployment -- localhost && npm run dev
```
