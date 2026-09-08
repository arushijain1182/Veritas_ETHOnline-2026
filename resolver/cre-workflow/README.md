# IITD Markets — CRE Resolver Workflow

Chainlink CRE (Runtime Environment) workflow implementing Stage 3 + Stage 4:
turns a closed market into a resolved one by fetching the official
inter-hostel competition result, validating it via a confidentiality-
preserving capability, and writing `resolveMarket(marketId, winningOption)`
on-chain through CRE's report/forwarder mechanism.

```
Official Result
      |
      v
confidential-http capability call        (enclave-executed server-side —
      |                                    API key & raw response never
      v                                    reach this workflow's own memory;
{ eventId, winner, timestamp }             see src/confidentialResult.ts)
      |
      v
Validate event/market id + map winner -> option index (src/resolveLogic.ts)
      |
      v
runtime.report({ encodedPayload: abi.encode(marketId, winningOption), ... })
      |
      v
EVMClient.writeReport(runtime, { receiver, report })
      |
      v
CRE Forwarder verifies DON signatures -> CREMarketResolverReceiver.onReport()
      |
      v
IMarketResolver(market).resolveMarket(marketId, winningOption)
      |
      v
Market RESOLVED
```

## Why CRE, not a plain script or Chainlink Functions call

- **State-changing, not read-only.** This isn't "fetch a price and display
  it" — the workflow's output directly flips a market from CLOSED to
  RESOLVED and unlocks real payouts. That's the trigger -> compute ->
  consensus -> on-chain-write shape CRE is built for.
- **BFT consensus on the result before it's trusted on-chain.** Capability
  calls and the on-chain write both go through DON-level execution and a
  DON-signed report, not a single centralized script holding a private key
  — which is exactly what Stage 1's mock resolver is, and specifically what
  CRE replaces for production use.
- **Confidential compute is load-bearing, not decorative** (Stage 4): the
  official-result API key and the raw response (which contains more than a
  public winner — see `confidentialResult.ts`) are handled by a capability
  that executes inside a TEE, never reaching DON node operators or on-chain
  logs. Only the minimal `{eventId, winner, timestamp}` triple crosses the
  confidentiality boundary, and only `marketId`/`winningOption` ever reach
  the chain (ABI-encoded into the report payload).

## Verified vs. assumed

This code isn't written from docs prose alone. `@chainlink/cre-sdk@1.19.1`
was installed locally and this whole `src/` directory is type-checked
against its real `.d.ts` output (`npm install && npm run build` — passes
clean). That process caught and fixed a real mistake: an earlier draft
called the confidential-http capability from inside a `handlerInTee`
handler (`TeeRuntime`), which doesn't type-check — `ConfidentialHTTPClient.sendRequest`
wants a plain `Runtime`. The confidentiality comes from the capability's own
enclave execution, not from the calling handler being TEE-wrapped.

**Verified against the installed package** (types + its own shipped example
workflows under `dist/workflows/standard_tests/`):
- `handler` / `handlerInTee` are real, exported, and `handlerInTee` really
  does take `(trigger, fn, [{tee: 'nitro', regions: [...]}])`.
- `ConfidentialHTTPClient`, `HTTPClient`, `EVMClient`, `CronCapability` are
  all real exports from `@chainlink/cre-sdk`, matching the names used here.
- `Runtime.report({encodedPayload, encoderName, signingAlgo, hashingAlgo})`
  → DON-signed `Report`; `EVMClient.writeReport(runtime, {receiver, report})`
  submits it. **EVM writes in this SDK only go through this report/receiver
  mechanism** — `EVMClient.callContract` exists but is read-only, there is
  no "send arbitrary calldata" write capability. This is why
  `contracts/CREMarketResolverReceiver.sol` exists as a small adapter rather
  than the workflow calling `resolveMarket` "directly."
- `EVMClient` takes a chain-selector `bigint`, available as
  `EVMClient.SUPPORTED_CHAIN_SELECTORS[<name>]`.

**Not independently verified** (Confidential Workflows are private beta —
docs.chain.link/cre/concepts/confidential-workflows — no live DON access
from this environment):
- The exact `encoderName`/`signingAlgo`/`hashingAlgo` string values a real
  DON config expects.
- `CREMarketResolverReceiver.onReport(bytes,bytes)`'s exact selector/shape —
  it follows the standard Chainlink Forwarder→Receiver pattern used
  elsewhere in Chainlink's architecture, but confirm against your actual
  CRE deployment's forwarder contract before trusting it in production.

## Resolver identity

The market contract's authorized `resolver` must be
**`CREMarketResolverReceiver`'s address**, not this workflow's own identity
and not an EOA — CRE writes through a Forwarder → Receiver, so the receiver
contract is what actually calls `resolveMarket()`. See
`contracts/CREMarketResolverReceiver.sol` and its `onlyForwarder` guard.

## Layout

- `src/config.ts` — zod config schema (schedule, result API, chain selector name, receiver address, market registry).
- `src/confidentialResult.ts` — Stage 4: confidential-http fetch + validate + reduce.
- `src/resolveLogic.ts` — event/market-id validation + winner->option mapping (mirrors `resolver/lib/resolveLogic.js`).
- `src/main.ts` — Stage 3: cron trigger, report construction, on-chain write.
- `project.yaml` — CRE CLI project config (best-effort on CLI-specific fields; see its own header comment).

## Local development

```bash
# type-check the workflow against the real SDK
cd resolver/cre-workflow
npm install
npm run build

# business-logic + on-chain tests (no CRE runtime needed)
cd ../..
npx hardhat test test/resolver

# once you have the CRE CLI + DON enrollment:
cd resolver/cre-workflow
cre workflow simulate --config ./project.yaml
```
