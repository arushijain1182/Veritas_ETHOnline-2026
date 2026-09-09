const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");
const { deployUniswapV2, seedETHUSDCLiquidity } = require("./lib/deployUniswapV2");

const LOCAL_NETWORKS = new Set(["hardhat", "localhost"]);
const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");

/**
 * Agent 2 deploy script. On a live network, point it at the real deployed
 * USDC and Uniswap V2 Router via USDC_ADDRESS / UNISWAP_ROUTER_ADDRESS. On
 * hardhat/localhost (no addresses given), it deploys MockUSDC plus the
 * vendored real Uniswap V2 stack (see contracts/vendor/) and seeds a
 * WETH/USDC pool so placeBetWithETH has something to swap against.
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

  const resolverAddress = process.env.RESOLVER_ADDRESS || (isLocal ? deployer.address : undefined);
  if (!resolverAddress) {
    throw new Error(
      "Set RESOLVER_ADDRESS (CREMarketResolverReceiver's address in production, or a test signer locally) before deploying"
    );
  }

  let usdcAddress = process.env.USDC_ADDRESS;
  if (!usdcAddress) {
    if (!isLocal) throw new Error(`Set USDC_ADDRESS to a real USDC deployment for network "${network.name}"`);
    console.log("No USDC_ADDRESS set — deploying MockUSDC for local/test use");
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();
    usdcAddress = await usdc.getAddress();
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

    if (process.env.SEED_LIQUIDITY !== "false") {
      const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);
      await seedETHUSDCLiquidity(router, usdc, deployer, {
        ethAmount: ethers.parseEther("100"),
        usdcAmount: ethers.parseUnits("200000", 6),
      });
      console.log("Seeded WETH/USDC pool with 100 ETH / 200,000 USDC (~1 ETH = 2000 USDC)");
    }
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
