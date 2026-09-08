/**
 * Stage 3 deliverable: the real Chainlink CRE workflow.
 *
 * Official Result -> confidential fetch+validate (enclave-executed
 *   capability call) -> map winner->option -> DON-signed report ->
 *   writeReport to the receiver contract -> receiver decodes report ->
 *   resolveMarket() -> RESOLVED
 *
 * This is the production replacement for resolver/scripts/mockResolver.js:
 * same validation rules (resolveLogic.ts mirrors resolveLogic.js), same
 * ultimate target (IMarketResolver.resolveMarket), but triggered on a
 * schedule, fetching the result through a confidentiality-preserving
 * capability, and writing on-chain through CRE's report/forwarder
 * mechanism instead of a developer's laptop signing a raw transaction with
 * a plaintext private key.
 *
 * IMPORTANT — verified vs. assumed (read this before treating this file as
 * ready to deploy as-is). This whole directory was type-checked with
 * `tsc` against the real, installed `@chainlink/cre-sdk@1.19.1` package
 * (`npm install && npm run build` in this directory) — not just written
 * against docs prose — which caught real mistakes along the way (e.g. an
 * earlier draft called the confidential-http capability from a `TeeRuntime`,
 * which doesn't type-check; it wants a plain `Runtime`).
 *
 * VERIFIED against the installed package's .d.ts output and its own example
 * workflows (dist/workflows/standard_tests/):
 *   - `handler(trigger, fn)` / `handlerInTee(trigger, fn, [{tee, regions}])`
 *     are both real, exported from `@chainlink/cre-sdk`.
 *   - `ConfidentialHTTPClient.sendRequest(runtime: Runtime<unknown>, ...)` —
 *     confidentiality comes from the capability's own enclave execution,
 *     not from the calling handler needing to be `handlerInTee`. See
 *     confidentialResult.ts's header for why this workflow uses a plain
 *     `handler`, not `handlerInTee`.
 *   - `Runtime.report({ encodedPayload, encoderName, signingAlgo, hashingAlgo })`
 *     produces a DON-signed `Report`; `EVMClient.writeReport(runtime, { receiver, report })`
 *     submits it — EVM writes in this SDK go through this report/receiver
 *     mechanism; there is no raw "send arbitrary calldata" write capability
 *     (`callContract` exists but is read-only).
 *   - `EVMClient` is constructed with a chain-selector `bigint`, available
 *     as `EVMClient.SUPPORTED_CHAIN_SELECTORS[<name>]`.
 *
 * NOT independently verified (Confidential Workflows are private-beta; no
 * live DON access from this environment) — confirm against your enrolled
 * SDK/DON before relying on it:
 *   - The exact `encoderName`/`signingAlgo`/`hashingAlgo` string constants
 *     your DON config expects for an EVM-consumable report.
 *   - The receiver contract's exact ABI (`contracts/CREMarketResolverReceiver.sol`
 *     assumes the standard Chainlink Forwarder->Receiver `onReport(bytes,bytes)`
 *     shape used elsewhere in Chainlink's Keystone architecture; confirm
 *     against your CRE deployment's actual forwarder contract).
 */

import { Runner, CronCapability, EVMClient, handler } from "@chainlink/cre-sdk";
import type { Runtime, CronPayload } from "@chainlink/cre-sdk";
import { encodeAbiParameters } from "viem";
import { configSchema, type Config } from "./config";
import { fetchOfficialResultConfidentially } from "./confidentialResult";
import { mapResultToResolution, ResolutionError } from "./resolveLogic";

function writeResolutionOnChain(
  runtime: Runtime<Config>,
  config: Config,
  resolution: { marketId: number; winningOption: number }
) {
  const encodedPayload = encodeAbiParameters(
    [
      { name: "marketId", type: "uint256" },
      { name: "winningOption", type: "uint256" },
    ],
    [BigInt(resolution.marketId), BigInt(resolution.winningOption)]
  );

  const report = runtime
    .report({
      encodedPayload,
      encoderName: "evm", // confirm against your DON config, see file header
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const chainSelector = EVMClient.SUPPORTED_CHAIN_SELECTORS[
    config.chainSelectorName as keyof typeof EVMClient.SUPPORTED_CHAIN_SELECTORS
  ];
  const evmClient = new EVMClient(chainSelector);
  return evmClient
    .writeReport(runtime, {
      receiver: config.receiverAddress,
      report,
    })
    .result();
}

const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): string => {
  const config = runtime.config;

  // 1 & 2. Receive the official result and validate it. The fetch itself
  // executes inside a TEE via the confidential-http capability — see
  // confidentialResult.ts. Only {eventId, winner, timestamp} comes back.
  let result;
  try {
    result = fetchOfficialResultConfidentially(runtime, config);
  } catch (err) {
    if (err instanceof ResolutionError) {
      runtime.log(`No resolvable result yet: [${err.code}] ${err.message}`);
      return "skipped: " + err.code;
    }
    throw err;
  }

  // 3. Map eventId/winner -> (marketId, winningOption). No on-chain
  // "already resolved" lookup happens here — that check is authoritative on
  // the market contract itself (resolveMarket reverts with
  // MarketAlreadyResolved), so a duplicate cron tick is a no-op revert, not
  // a double-payout risk.
  let resolution;
  try {
    resolution = mapResultToResolution(result, config.marketRegistry);
  } catch (err) {
    if (err instanceof ResolutionError) {
      runtime.log(`Result did not map to a resolvable market: [${err.code}] ${err.message}`);
      return "skipped: " + err.code;
    }
    throw err;
  }

  runtime.log(
    `Resolving marketId=${resolution.marketId} winningOption=${resolution.winningOption} ` +
      `(eventId=${resolution.eventId}, winner=${result.winner})`
  );

  // 4/5. Produce a DON-signed report and write it on-chain to the receiver.
  const tx = writeResolutionOnChain(runtime, config, resolution);
  runtime.log(`resolveMarket submitted on-chain: ${JSON.stringify(tx)}`);
  return `resolved marketId=${resolution.marketId}`;
};

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
