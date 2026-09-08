const { ethers, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { resolveOne } = require("./mockResolver");

/**
 * Stage 7 deterministic demo.
 *
 * Market: "Who wins IITD Inter-Hostel Cricket Final?" — Himadri vs Karakoram.
 * Official result (resolver/mock-result/results.json): Himadri won.
 *
 * Run: npx hardhat run resolver/scripts/demo.js
 */
async function main() {
  const [deployer, resolver, alice, bob] = await ethers.getSigners();

  console.log("== Deploying MarketResolution ==");
  const MarketResolution = await ethers.getContractFactory("MarketResolution");
  const market = await MarketResolution.deploy(resolver.address);
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log(`MarketResolution deployed to ${marketAddress}`);
  console.log(`Authorized resolver: ${resolver.address}`);

  const closingTime = (await time.latest()) + 3600;

  // Throwaway market so the real one lands on marketId 1, matching
  // resolver/mock-result/market-registry.json's example mapping.
  await (await market.connect(deployer).createMarket("Throwaway", ["A", "B"], closingTime)).wait();

  console.log("\n== Creating market (marketId 1) ==");
  const createTx = await market
    .connect(deployer)
    .createMarket("Who wins IITD Inter-Hostel Cricket Final?", ["HIMADRI", "KARAKORAM"], closingTime);
  await createTx.wait();
  console.log('Market: "Who wins IITD Inter-Hostel Cricket Final?" [HIMADRI, KARAKORAM]');

  console.log("\n== Students place predictions ==");
  await (await market.connect(alice).placeBet(1, 0, { value: ethers.parseEther("2") })).wait();
  console.log(`Alice staked 2 ETH on HIMADRI`);
  await (await market.connect(bob).placeBet(1, 1, { value: ethers.parseEther("1") })).wait();
  console.log(`Bob staked 1 ETH on KARAKORAM`);

  console.log("\n== Market closes ==");
  await time.increaseTo(closingTime + 1);
  console.log(`block.timestamp advanced past closingTime (${closingTime})`);

  console.log("\n== Official result arrives: Himadri won ==");
  console.log('(In production: Chainlink CRE workflow fetches + confidentially validates this.');
  console.log(" Here: Stage 1 mock resolver, same resolveMarket() call the CRE workflow makes.)");

  const { marketId, winningOption, txHash } = await resolveOne("IITD-CRICKET-2026-FINAL", {
    contractAddress: marketAddress,
    signer: resolver,
  });

  console.log("\n== Market resolved on-chain ==");
  const m = await market.getMarket(marketId);
  console.log(`marketId=${marketId} winningOption=${winningOption} (${m.options[winningOption]})`);
  console.log(`resolved=${m.resolved} tx=${txHash}`);

  console.log("\n== Winner claims payout ==");
  const aliceBefore = await ethers.provider.getBalance(alice.address);
  const claimTx = await market.connect(alice).claim(1);
  const receipt = await claimTx.wait();
  const gasCost = receipt.gasUsed * receipt.gasPrice;
  const aliceAfter = await ethers.provider.getBalance(alice.address);
  const payout = aliceAfter - aliceBefore + gasCost;
  console.log(
    `Alice claimed ${ethers.formatEther(payout)} ETH (staked 2 of the 2 ETH HIMADRI pool, entire 3 ETH total pool is hers)`
  );

  console.log("\nDemo complete: OPEN -> CLOSED -> CRE-style resolution -> RESOLVED -> claimed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
