const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const { deployUniswapV2, seedETHUSDCLiquidity } = require("./lib/deployUniswapV2");

const LOCAL_NETWORKS = new Set(["hardhat", "localhost"]);
// Networks where auto-deploying MockUSDC (rather than requiring a real
// USDC_ADDRESS) is acceptable: local dev, plus public testnets where
// there's no canonical USDC everyone agrees on for demo purposes anyway.
// Never mainnet — a live network always needs a real USDC_ADDRESS.
const MOCK_USDC_NETWORKS = new Set(["hardhat", "localhost", "sepolia"]);
const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");

/**
 * Agent 2 deploy script. On a live network, point it at the real deployed
 * USDC and Uniswap V2 Router via USDC_ADDRESS / UNISWAP_ROUTER_ADDRESS. On
 * hardhat/localhost (no addresses given), it deploys MockUSDC plus the
 * vendored real Uniswap V2 stack (see contracts/vendor/) and seeds a
 * WETH/USDC pool so placeBetWithETH has something to swap against. On
 * Sepolia (no USDC_ADDRESS given), it likewise deploys MockUSDC and seeds a
 * WETH/USDC pool against the *real* Sepolia Uniswap V2 Router you pass via
 * UNISWAP_ROUTER_ADDRESS — a fresh token has zero liquidity against WETH on
 * a real router until someone seeds it, so this script does that itself
 * whenever it's the one that deployed the USDC token.
 *
 * RESOLVER_ADDRESS should be CREMarketResolverReceiver's address in
 * production (Agent 1's on-chain adapter for the Chainlink CRE workflow —
 * see AGENT_COORDINATION_1.md), or a test EOA / the mock resolver's signer
 * locally.
 *
 * Usage:
 *   npx hardhat run scripts/deployMarket.js                      # local
 *   RESOLVER_ADDRESS=0x... USDC_ADDRESS=0x... UNISWAP_ROUTER_ADDRESS=0x... \
 *     npx hardhat run scripts/deployMarket.js --network <network>  # live
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const isLocal = LOCAL_NETWORKS.has(network.name);
  const allowMockUsdc = MOCK_USDC_NETWORKS.has(network.name);

  const resolverAddress = process.env.RESOLVER_ADDRESS || (isLocal ? deployer.address : undefined);
  if (!resolverAddress) {
    throw new Error(
      "Set RESOLVER_ADDRESS (CREMarketResolverReceiver's address in production, or a test signer locally) before deploying"
    );
  }

  let usdcAddress = process.env.USDC_ADDRESS;
  let deployedFreshUsdc = false;
  if (!usdcAddress) {
    if (!allowMockUsdc) throw new Error(`Set USDC_ADDRESS to a real USDC deployment for network "${network.name}"`);
    console.log("No USDC_ADDRESS set — deploying MockUSDC for test/demo use");
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();
    usdcAddress = await usdc.getAddress();
    deployedFreshUsdc = true;
    console.log("MockUSDC deployed to:", usdcAddress);
  }

  let routerAddress = process.env.UNISWAP_ROUTER_ADDRESS;
  if (!routerAddress) {
    if (!isLocal) throw new Error(`Set UNISWAP_ROUTER_ADDRESS to the real Uniswap V2 Router for network "${network.name}"`);
    console.log("No UNISWAP_ROUTER_ADDRESS set — deploying a local Uniswap V2 stack (Factory + WETH9 + Router)");
    const { router, weth } = await deployUniswapV2(deployer);
    routerAddress = await router.getAddress();
    console.log("Uniswap V2 Router deployed to:", routerAddress);
    console.log("WETH9 deployed to:", await weth.getAddress());
  } else {
    console.log("Using existing Uniswap V2 Router:", routerAddress);
  }

  // A freshly-deployed USDC has no liquidity against WETH yet on whichever
  // router we're using (local or real) — seed some so placeBetWithETH has
  // something to swap against. Skipped if USDC_ADDRESS was an existing,
  // presumably-already-liquid token.
  if (deployedFreshUsdc && process.env.SEED_LIQUIDITY !== "false") {
    // Needs the *full* Router ABI (addLiquidityETH isn't in our minimal
    // interface, which is intentionally Market.sol's small dependency
    // surface only) — the vendored UniswapV2Router02 artifact has it and
    // matches the real Router's ABI exactly, so it works against any
    // Router address, local or real.
    const router = await ethers.getContractAt(
      "contracts/vendor/uniswap-v2-periphery/UniswapV2Router02.sol:UniswapV2Router02",
      routerAddress
    );
    const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);
    const ethAmount = process.env.SEED_ETH_AMOUNT ? ethers.parseEther(process.env.SEED_ETH_AMOUNT) : ethers.parseEther(isLocal ? "100" : "0.05");
    const usdcAmount = process.env.SEED_USDC_AMOUNT
      ? ethers.parseUnits(process.env.SEED_USDC_AMOUNT, 6)
      : ethers.parseUnits(isLocal ? "200000" : "100", 6);
    await seedETHUSDCLiquidity(router, usdc, deployer, { ethAmount, usdcAmount });
    console.log(`Seeded WETH/USDC pool with ${ethers.formatEther(ethAmount)} ETH / ${ethers.formatUnits(usdcAmount, 6)} USDC`);
  }

  const Market = await ethers.getContractFactory("Market");
  const market = await Market.deploy(usdcAddress, routerAddress, resolverAddress);
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();

  console.log("\nMarket deployed to:", marketAddress);
  console.log("USDC:", usdcAddress);
  console.log("Uniswap Router:", routerAddress);
  console.log("Resolver:", resolverAddress);
  console.log("Fee recipient (defaults to deployer):", deployer.address);

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const manifest = {
    network: network.name,
    chainId,
    market: marketAddress,
    usdc: usdcAddress,
    uniswapRouter: routerAddress,
    resolver: resolverAddress,
    feeRecipient: deployer.address,
    deployedAt: new Date().toISOString(),
  };
  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  const manifestPath = path.join(DEPLOYMENTS_DIR, `${network.name}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nWrote deployment manifest to deployments/${network.name}.json`);
  console.log("Run `npm run sync-deployment` in frontend/ to point the UI at it.");

  return { market, marketAddress, usdcAddress, routerAddress, resolverAddress, manifest };
}

module.exports = { main };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
