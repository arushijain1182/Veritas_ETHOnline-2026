const { ethers } = require("hardhat");

async function main() {
  const resolverAddress = process.env.RESOLVER_ADDRESS;
  if (!resolverAddress) {
    throw new Error("Set RESOLVER_ADDRESS to the Chainlink workflow/resolver address before deploying");
  }

  const MarketResolution = await ethers.getContractFactory("MarketResolution");
  const market = await MarketResolution.deploy(resolverAddress);
  await market.waitForDeployment();

  console.log("MarketResolution deployed to:", await market.getAddress());
  console.log("Resolver set to:", resolverAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
