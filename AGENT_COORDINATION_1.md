# Agent Coordination — Veritas / IITD Markets (ETHOnline 2026)

Status handoff doc so the other agent(s) working on this repo know what
Agent 1 has built, what's stable, and what's still open. Update this file
instead of re-deriving context from scratch. (Agent 2: this file is
`AGENT_COORDINATION_1.md` — put your own status in
`AGENT_COORDINATION_2.md`, per the rename you already did.)

## Role split (per the latest brief):

- **Agent 2 owns**: market creation, betting, and claim/payout logic —
  the `OPEN` and `RESOLVED -> paid out` parts of the lifecycle.
- **Agent 1 (this doc) owns**: the `CLOSED -> RESOLVED` transition — the
  mock resolver, the official-result mapping/validation, and the Chainlink
  CRE workflow that actually calls `resolveMarket()`.

```
OPEN -> CLOSED -> RESOLVED
^^^^^^^^^^^^^^^^    ^^^^^^^^^
   Agent 2          Agent 1
```

**Important reconciliation**: an earlier version of this doc described a
single `MarketResolution.sol` implementing create/bet/resolve/claim end to
end. That contract still exists and is fully tested — but per the new role
split, treat it as **Agent 1's reference/mock target**, not the contract
this project ships. Its purpose now is so the mock resolver and the CRE
workflow have something real to call `resolveMarket()` against before
Agent 2's actual market contract exists. **Agent 2: build your own market
contract; you don't need to adopt this one.** The only hard requirement
Agent 1 needs from it is described below.

## Stage 0 — the shared contract between us

Whatever contract Agent 2 ships must implement:

```solidity
interface IMarketResolver {
    function resolveMarket(uint256 marketId, uint256 winningOption) external;
}
```

— see [`contracts/interfaces/IMarketResolver.sol`](contracts/interfaces/IMarketResolver.sol).
`MarketResolution.sol` implements it as a reference (`resolveMarket` at
[contracts/MarketResolution.sol:116](contracts/MarketResolution.sol)).

Requirements on the implementation (all verified by Agent 1's tests against
the reference contract, in [`test/MarketResolution.test.js`](test/MarketResolution.test.js)):

- `resolveMarket` reverts unless `msg.sender` is a single authorized
  `resolver` address (a state variable / equivalent — not a hardcoded
  constant, since it needs to become the CRE workflow's forwarder address
  once deployed, see below).
- Reverts if called before the market is closed.
- Reverts if the market is already resolved (irreversible, single resolution).
- Reverts if `winningOption` is out of range for the market's options.
- `marketId` and option indices are `uint256`, 0-indexed, in the order
  passed to `createMarket`.

**Resolver identity is not a normal EOA in production, and not the CRE
workflow's own address either.** Confirmed against the real `@chainlink/cre-sdk`
package (not just docs): CRE's EVM writes go through a DON-signed report
submitted to a Forwarder, which calls a fixed `onReport` method on a
receiver contract — there's no "call arbitrary calldata" write path. So the
address authorized to call `resolveMarket` should be
[`CREMarketResolverReceiver`](contracts/CREMarketResolverReceiver.sol)'s
address, which itself only accepts calls from the Forwarder
(`onlyForwarder`). Until the workflow is actually deployed, both of us
should test against a plain EOA resolver (as `MarketResolution.sol` does,
and as `resolver/scripts/mockResolver.js` uses) and swap the address later
— don't hardcode assumptions about the resolver being an EOA anywhere in
claim/UI logic.

## Agent 1 deliverables (this stage)

| Stage | What | Where |
|---|---|---|
| 1 | Mock resolver + `IMarketResolver` interface | [`contracts/interfaces/IMarketResolver.sol`](contracts/interfaces/IMarketResolver.sol), [`resolver/scripts/mockResolver.js`](resolver/scripts/mockResolver.js) |
| 2 | Mock official-result source | [`resolver/mock-result/results.json`](resolver/mock-result/results.json), [`resolver/mock-result/market-registry.json`](resolver/mock-result/market-registry.json) |
| 3 | Chainlink CRE workflow | [`resolver/cre-workflow/`](resolver/cre-workflow/) — type-checked against the real `@chainlink/cre-sdk` package, see its README |
| 4 | Confidential compute component | [`resolver/cre-workflow/src/confidentialResult.ts`](resolver/cre-workflow/src/confidentialResult.ts) |
| 5 | On-chain receiver (CRE writes via signed report + Forwarder, not arbitrary calldata) | [`contracts/CREMarketResolverReceiver.sol`](contracts/CREMarketResolverReceiver.sol) |
| 6 | Tests | [`test/resolver/`](test/resolver/) (22 unit + integration tests incl. the receiver, run with `npx hardhat test test/resolver`) |
| 7 | Demo script | [`resolver/scripts/demo.js`](resolver/scripts/demo.js) — `npx hardhat run resolver/scripts/demo.js` |

**Use `resolver/scripts/mockResolver.js` to test your contract right now**,
without waiting for the real CRE deployment:

```bash
MARKET_CONTRACT_ADDRESS=<your deployed address> \
EVENT_ID=IITD-CRICKET-2026-FINAL \
npx hardhat run resolver/scripts/mockResolver.js --network <network>
```

It reads `resolver/mock-result/results.json` (mock official result: Himadri
won `IITD-CRICKET-2026-FINAL`), maps it through
`resolver/mock-result/market-registry.json` (eventId -> marketId/options —
**add your market's eventId mapping here** once you create it), and calls
`resolveMarket(marketId, winningOption)` on your contract signed by the
resolver key. Same validation rules the real CRE workflow uses
(`resolver/lib/resolveLogic.js` / its TS twin
`resolver/cre-workflow/src/resolveLogic.ts`): rejects unknown event ids,
unknown winners, malformed payloads, and duplicate results.

Full "why CRE" / "why confidential" writeup, deployment caveats, and
architecture diagram: [`resolver/cre-workflow/README.md`](resolver/cre-workflow/README.md).

## Reference contract details (MarketResolution.sol — for local testing only)

`createMarket(question, options[], closingTime)`,
`placeBet(marketId, optionIndex)` (payable, native ETH),
`resolveMarket(marketId, winningOption)` (onlyResolver),
`claim(marketId)` (pull-payment payout, proportional to stake on the
winning option), `previewClaim(marketId, user)` (view), `setResolver(address)`
(owner-only). Events: `MarketCreated`, `BetPlaced`, `MarketResolved`,
`Claimed`, `ResolverUpdated`. Errors: `MarketDoesNotExist`, `MarketClosed`,
`MarketNotClosed`, `MarketAlreadyResolved`, `MarketNotResolved`,
`InvalidOption`, `InvalidClosingTime`, `NotResolver`, `ZeroAmount`,
`AlreadyClaimed`, `NoWinningStake`, `TransferFailed`.

### Open / not yet decided
- [ ] Does Agent 2's contract use native ETH staking (like the reference) or an ERC20?
- [ ] Who is allowed to call `createMarket` on Agent 2's contract?
- [ ] Does Agent 2's contract need early resolution (before `closingTime`) for any flow? The reference and the CRE workflow both currently assume resolution only happens after close.
- [ ] Confirm the `eventId` -> `marketId` registry approach (currently a JSON file both the mock resolver and CRE workflow read) is workable, or whether it should move on-chain / into `createMarket`'s return value some other way.

## How to add your section

When you (the other agent) pick up work here, add a section to your own
`AGENT_COORDINATION_2.md` with the same shape: what you built, file paths,
function signatures/events other code needs to call, and open questions for
Agent 1.

---
