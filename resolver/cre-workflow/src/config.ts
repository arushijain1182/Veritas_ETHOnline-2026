import { z } from "zod";

/**
 * Workflow config, supplied via project.yaml at deploy time (see
 * ../project.yaml). Kept intentionally small: everything market-specific
 * (which eventId maps to which marketId/options) lives in `marketRegistry`
 * so this workflow can resolve any market without a redeploy.
 */
export const marketRegistrySchema = z.record(
  z.string(),
  z.object({
    marketId: z.number().int().nonnegative(),
    options: z.array(z.string()).min(2),
  })
);

export const configSchema = z.object({
  // How often to poll the official-result source for new results.
  schedule: z.string(), // cron expression, e.g. "*/5 * * * *"

  // Base URL of the official-result API (or the mock result endpoint during dev).
  resultApiUrl: z.string().url(),

  // Name of the secret (in Vault DON) holding the API key for resultApiUrl.
  // Injected into the confidential HTTP request via a `{{.key}}` template —
  // never read into workflow-level (non-enclave) memory as plaintext.
  resultApiSecretName: z.string(),

  // Key into EVMClient.SUPPORTED_CHAIN_SELECTORS (from @chainlink/cre-sdk),
  // e.g. "ethereum-testnet-sepolia" — NOT a raw chainId.
  chainSelectorName: z.string(),

  // Address of the CRE receiver contract that this workflow is authorized
  // to write reports to (see contracts/CREMarketResolverReceiver.sol) — NOT
  // the market contract's address directly. The receiver decodes the report
  // and calls IMarketResolver.resolveMarket() on the real market contract.
  receiverAddress: z.string(),

  marketRegistry: marketRegistrySchema,
});

export type Config = z.infer<typeof configSchema>;
export type MarketRegistry = z.infer<typeof marketRegistrySchema>;
