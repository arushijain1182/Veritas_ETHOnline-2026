/**
 * Stage 4 — the confidential piece of this workflow.
 *
 * What's actually sensitive here, concretely:
 *   1. The official-result API key. It authenticates this workflow to the
 *      IITD sports-office endpoint; if it leaked to node operators it could
 *      be reused outside the workflow.
 *   2. The raw API response. The real endpoint returns more than a winner —
 *      per-hostel score breakdowns, disciplinary notes, referee identity —
 *      none of which belongs on a public chain or in DON node logs.
 *
 * So the confidential boundary is drawn around "fetch + validate + reduce":
 * this function calls the `confidential-http` capability (capability id
 * `confidential-http@1.0.0-alpha`), whose *implementation* executes the
 * actual HTTP call and secret substitution inside a TEE server-side —
 * the calling handler does not itself need to be a `handlerInTee` handler
 * for that part to be confidential (verified: `ConfidentialHTTPClient.sendRequest`
 * is typed to take a plain `Runtime<unknown>`, not a `TeeRuntime`, in
 * @chainlink/cre-sdk@1.19.1 — confirmed by actually type-checking this file
 * against the installed package, not just reading docs). The API key is
 * referenced as a Vault DON secret and substituted into the request
 * server-side inside the enclave; it never becomes a plaintext string this
 * function can see. Only the reduced {eventId, winner, timestamp} triple is
 * returned.
 *
 * (`handlerInTee` — see main.ts's file header — is a separate, heavier
 * mechanism for shielding your *own* business logic inside a TEE, e.g. if
 * `mapResultToResolution`'s mapping rules themselves needed to be hidden
 * from node operators. Not needed here since that mapping only touches
 * public option strings.)
 */

import type { Runtime } from "@chainlink/cre-sdk";
import { ConfidentialHTTPClient } from "@chainlink/cre-sdk";
import type { Config } from "./config";
import { ResolutionError, type OfficialResult } from "./resolveLogic";

interface RawResultPayload {
  eventId?: unknown;
  winner?: unknown;
  timestamp?: unknown;
  signature?: unknown;
  // ...plus whatever other sensitive fields the real IITD API returns.
  // They're read here, inside the enclave, and simply never referenced
  // again — they don't get assigned to anything this function returns.
}

/**
 * Runs inside the TEE (called from a `handlerInTee` handler). Fetches the
 * official result with the API key injected as a Vault DON secret, and
 * returns only {eventId, winner, timestamp} — the minimum the chain needs.
 */
export function fetchOfficialResultConfidentially(
  runtime: Runtime<Config>,
  config: Config
): OfficialResult {
  const client = new ConfidentialHTTPClient();

  // ConfidentialHTTPRequest = { vaultDonSecrets: SecretIdentifier[], request: HTTPRequest }
  // (capabilities/networking/confidentialhttp/v1alpha/client_pb). The secret
  // named `config.resultApiSecretName` is resolved from the Vault DON and
  // substituted into the `{{<key>}}` placeholder in the header value —
  // *inside* the enclave. It's never available to this function as a JS
  // string, unlike `runtime.getSecret()` (which docs explicitly warn not to
  // paste into confidential-http headers/body, since that would defeat the
  // point).
  const response = client
    .sendRequest(runtime, {
      vaultDonSecrets: [{ key: config.resultApiSecretName, namespace: "default" }],
      request: {
        url: config.resultApiUrl,
        method: "GET",
        multiHeaders: {
          Authorization: { values: [`Bearer {{${config.resultApiSecretName}}}`] },
        },
      },
    })
    .result();

  let raw: RawResultPayload;
  try {
    raw = JSON.parse(new TextDecoder().decode(response.body)) as RawResultPayload;
  } catch {
    throw new ResolutionError("MALFORMED_RESULT", "Official result response was not valid JSON");
  }

  if (typeof raw.eventId !== "string" || typeof raw.winner !== "string") {
    throw new ResolutionError(
      "MALFORMED_RESULT",
      "Official result response is missing eventId/winner"
    );
  }

  // In production this is where the enclave verifies `raw.signature`
  // against the sports office's known public key / HMAC secret (also
  // injected confidentially) before trusting the payload. Omitted here
  // since Stage 2 uses a mock result source with a placeholder signature —
  // see resolver/mock-result/results.json.

  const timestamp = typeof raw.timestamp === "number" ? raw.timestamp : Math.floor(Date.now() / 1000);

  // Everything else in `raw` (score breakdowns, notes, whatever) is
  // discarded here, inside the enclave. Only this triple crosses back out.
  return { eventId: raw.eventId, winner: raw.winner, timestamp };
}
