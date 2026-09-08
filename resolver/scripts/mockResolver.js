const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const { mapResultToResolution, ResolutionError } = require("../lib/resolveLogic");

/**
 * Stage 1 deliverable: a mock resolver that stands in for the real Chainlink
 * CRE workflow so Agent 2 can build and test against a real resolveMarket()
 * call path without waiting for CRE to be wired up.
 *
 * It does exactly what the future CRE workflow will do, just without a DON:
 *   1. Read an "official result" (resolver/mock-result/results.json)
 *   2. Validate + map eventId/winner -> (marketId, winningOption)
 *   3. Call resolveMarket(marketId, winningOption) using the resolver's key
 *
 * Usage:
 *   MARKET_CONTRACT_ADDRESS=0x... EVENT_ID=IITD-CRICKET-2026-FINAL \
 *     npx hardhat run resolver/scripts/mockResolver.js --network <network>
 *
 * By default it signs with the Hardhat account whose address matches the
 * deployed contract's `resolver`. To use a specific key, set
 * RESOLVER_PRIVATE_KEY.
 */

const RESULTS_PATH = path.join(__dirname, "..", "mock-result", "results.json");
const REGISTRY_PATH = path.join(__dirname, "..", "mock-result", "market-registry.json");
const LEDGER_PATH = path.join(__dirname, "..", "mock-result", "resolved-events.json");

const IMarketResolverAbi = [
  "function resolveMarket(uint256 marketId, uint256 winningOption) external",
];

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

async function resolveOne(eventId, { contractAddress, signer }) {
  const results = loadJson(RESULTS_PATH, {});
  const registry = loadJson(REGISTRY_PATH, {});
  const resolvedLedger = loadJson(LEDGER_PATH, []);
  const alreadyResolved = new Set(resolvedLedger);

  const result = results[eventId];
  if (!result) {
    throw new ResolutionError("MALFORMED_EVENT_ID", `No mock result found for eventId "${eventId}"`);
  }

  const { marketId, winningOption } = mapResultToResolution(result, registry, alreadyResolved);

  const market = new ethers.Contract(contractAddress, IMarketResolverAbi, signer);
  console.log(
    `Resolving marketId=${marketId} with winningOption=${winningOption} (winner="${result.winner}", eventId="${eventId}") via resolver ${await signer.getAddress()}`
  );

  const tx = await market.resolveMarket(marketId, winningOption);
  const receipt = await tx.wait();
  console.log(`resolveMarket tx confirmed: ${receipt.hash}`);

  resolvedLedger.push(eventId);
  saveJson(LEDGER_PATH, resolvedLedger);

  return { marketId, winningOption, txHash: receipt.hash };
}

async function main() {
  const contractAddress = process.env.MARKET_CONTRACT_ADDRESS;
  const eventId = process.env.EVENT_ID;
  if (!contractAddress) throw new Error("Set MARKET_CONTRACT_ADDRESS");
  if (!eventId) throw new Error("Set EVENT_ID (must exist in resolver/mock-result/results.json)");

  let signer;
  if (process.env.RESOLVER_PRIVATE_KEY) {
    signer = new ethers.Wallet(process.env.RESOLVER_PRIVATE_KEY, ethers.provider);
  } else {
    [signer] = await ethers.getSigners();
  }

  await resolveOne(eventId, { contractAddress, signer });
}

module.exports = { resolveOne };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
