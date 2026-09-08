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
