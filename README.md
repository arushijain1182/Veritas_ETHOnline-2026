# Veritas — ETHOnline 2026

## Agent 1 — Market Resolution Contract

`contracts/MarketResolution.sol` implements Stage B and Stage C for Agent 1:

**Stage B — market resolution**
- `createMarket(question, options, closingTime)` — owner-only, stores a new market.
- `resolveMarket(marketId, winningOption)` — callable only by the authorized
  Chainlink workflow/resolver address (`resolver`), and only after `closingTime`
  has passed. Each market can be resolved exactly once.

Each market stores `question`, `options`, `closingTime`, `winningOption`,
`totalPool`, and `resolved`, exactly as specified.

**Stage C — payout trigger**
- Users stake ETH on an option via `placeBet(marketId, optionIndex)` before
  close, which accumulates `totalPool` and per-option pools.
- Once the resolver calls `resolveMarket`, winners become eligible to pull
  their share via `claim(marketId)` — payout is proportional to their stake
  on the winning option: `userStake * totalPool / winningOptionPool`.
- **No funds are pushed to any wallet during resolution.** Resolution only
  flips `resolved = true` and records the winning option; it does not iterate
  over stakers, so it costs the same flat gas regardless of whether 10 or
  10,000 people bet. Each winner claims independently and once
  (`AlreadyClaimed` guards re-entry, `previewClaim` lets a frontend show the
  expected payout before the user submits a transaction).

### Layout
- `contracts/MarketResolution.sol` — the contract.
- `test/MarketResolution.test.js` — Hardhat/Chai test suite (create, bet,
  resolve access-control, claim payouts, and a gas-flatness check for
  resolution with many stakers).
- `scripts/deploy.js` — deployment script; set `RESOLVER_ADDRESS` to the
  Chainlink resolver's address before running.

### Usage
```bash
npm install
npx hardhat compile
npx hardhat test
RESOLVER_ADDRESS=0x... npx hardhat run scripts/deploy.js --network <network>
```
