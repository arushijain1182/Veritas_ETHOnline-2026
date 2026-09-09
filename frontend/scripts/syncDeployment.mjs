// Copies the deployment manifest scripts/deployMarket.js writes (repo-root
// deployments/<network>.json) into src/config/deployment.json, which the
// frontend imports directly. Run after every deploy:
//   npx hardhat run scripts/deployMarket.js && (cd frontend && npm run sync-deployment)
// Defaults to the "hardhat" network manifest; pass a network name to use a
// different one, e.g. `node scripts/syncDeployment.mjs sepolia`.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const networkName = process.argv[2] || "hardhat";
const manifestPath = join(__dirname, "..", "..", "deployments", `${networkName}.json`);
const outPath = join(__dirname, "..", "src", "config", "deployment.json");

if (!existsSync(manifestPath)) {
  console.error(`No deployment manifest at deployments/${networkName}.json`);
  console.error("Run `npx hardhat run scripts/deployMarket.js` (from the repo root) first.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote src/config/deployment.json from deployments/${networkName}.json`);
console.log(manifest);
