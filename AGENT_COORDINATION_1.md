# Agent Coordination — Veritas (ETHOnline 2026)

Status handoff doc so the other agent(s) working on this repo know what
Agent 1 has built, what's stable, and what's still open. Update this file
instead of re-deriving context from scratch.

## Agent 1 — Market Resolution Contract (Stage B + C)

**Status: implemented, tested, merged to `main`.**

File: [`contracts/MarketResolution.sol`](contracts/MarketResolution.sol)
Tests: [`test/MarketResolution.test.js`](test/MarketResolution.test.js) (17 passing)
Deploy script: [`scripts/deploy.js`](scripts/deploy.js)

### What it does
- `createMarket(question, options[], closingTime)` — owner-only. Returns `marketId`.
- `placeBet(marketId, optionIndex)` — payable, anyone, before `closingTime`.
- `resolveMarket(marketId, winningOption)` — **only callable by the `resolver`
  address** (meant to be the Chainlink workflow). Only after `closingTime`,
  only once per market.
- `claim(marketId)` — pull-payment payout for winners, callable any time
  after resolution. No bulk payout transaction — each user claims their own
  share. `previewClaim(marketId, user)` is a free view function for a
  frontend to show expected payout before the user sends a tx.
- `setResolver(address)` — owner-only, rotates the authorized resolver.

### On-chain state per market
`question`, `options[]`, `closingTime`, `winningOption`, `totalPool`, `resolved`
— read via `getMarket(marketId)`.

### Access control model (needs your input if it changes)
`resolver` is currently a single EOA/contract address set at deploy time and
rotatable by the owner. `resolveMarket` just checks `msg.sender == resolver`.

If the Chainlink integration instead wants to **sign** the resolution
off-chain (EIP-712) and have anyone relay it on-chain — which is what the
`chainlink-for-agents` skill supports — this needs to change to signature
verification instead of a plain address check. Flag if that's the direction
so Stage B can be updated before other code depends on the current interface.

### Events (for indexing/frontend)
- `MarketCreated(marketId, question, options, closingTime)`
- `BetPlaced(marketId, user, optionIndex, amount)`
- `MarketResolved(marketId, winningOption, totalPool)`
- `Claimed(marketId, user, amount)`
- `ResolverUpdated(oldResolver, newResolver)`

### Custom errors
`MarketDoesNotExist`, `MarketClosed`, `MarketNotClosed`,
`MarketAlreadyResolved`, `MarketNotResolved`, `InvalidOption`,
`InvalidClosingTime`, `NotResolver`, `ZeroAmount`, `AlreadyClaimed`,
`NoWinningStake`, `TransferFailed`

### What the other agent needs to know
- **Betting is native ETH**, not an ERC20. If the design elsewhere (staking
  agent, frontend) assumes an ERC20 stake token, say so — swapping `payable`/
  `msg.value` for an ERC20 `transferFrom` is a moderate but contained change.
- **Market creation is owner-only.** If markets should be created by the
  Chainlink workflow or a separate factory/admin flow, that's a one-line
  modifier swap but affects who needs which key.
- **`resolveMarket` requires `block.timestamp >= closingTime`.** If the
  Chainlink workflow resolves early in some flow (e.g. an oracle confirms the
  outcome before the scheduled close), that will currently revert with
  `MarketNotClosed` — flag if early resolution is needed.
- Deployment needs `RESOLVER_ADDRESS` env var set to whatever address/contract
  the Chainlink workflow will call from.

### Open / not yet decided
- [ ] EOA-address resolver vs. EIP-712 signed relay (see above).
- [ ] ETH vs. ERC20 staking.
- [ ] Who is allowed to call `createMarket`.
- [ ] Whether `resolveMarket` should allow resolution before `closingTime`.

## How to add your section

When you (the other agent) pick up work here, add a section below with the
same shape: what you built, file paths, function signatures/events other
code needs to call, and open questions for Agent 1. Keep this file as the
single source of truth for cross-agent contracts (interfaces, addresses,
assumptions) — don't duplicate it elsewhere.

---
