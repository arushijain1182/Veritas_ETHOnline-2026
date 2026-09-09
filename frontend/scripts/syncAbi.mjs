// Copies just the ABI out of the Hardhat build artifacts in ../artifacts
// into src/abi/*.json, so the frontend doesn't import Hardhat's full
// artifact (bytecode, source maps, etc.) into the bundle. Run after
// `npx hardhat compile` in the repo root, or via `npm run sync-abi`.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsDir = join(__dirname, "..", "..", "artifacts", "contracts");
const outDir = join(__dirname, "..", "src", "abi");

const CONTRACTS = [
  { artifact: join(artifactsDir, "Market.sol", "Market.json"), out: "Market.json" },
  { artifact: join(artifactsDir, "mocks", "MockUSDC.sol", "MockUSDC.json"), out: "MockUSDC.json" },
];

mkdirSync(outDir, { recursive: true });

for (const { artifact, out } of CONTRACTS) {
  const { abi } = JSON.parse(readFileSync(artifact, "utf8"));
  writeFileSync(join(outDir, out), JSON.stringify(abi, null, 2) + "\n");
  console.log(`Wrote src/abi/${out} (${abi.length} entries)`);
}
