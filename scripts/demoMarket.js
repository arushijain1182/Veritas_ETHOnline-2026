const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployUniswapV2, seedETHUSDCLiquidity, seedTokenUSDCLiquidity } = require("./lib/deployUniswapV2");
const { resolveOne } = require("../resolver/scripts/mockResolver");

/**
 * Agent 2 Stage 10 deterministic demo — the full lifecycle from the brief,
 * plus the Stage 6 stretch goal:
 *   CREATE -> BET (direct + via Uniswap) -> Alice lists her HIMADRI position
 *   on Uniswap -> Carol buys in on the secondary market (never places a bet
 *   at all) -> CLOSE -> CHAINLINK-style RESOLUTION -> both Alice and Carol
 *   CLAIM their share of the winning position they each hold.
 *
 * Market: "Who wins IITD Inter-Hostel Cricket Final?" — Himadri vs
 * Karakoram. Official result (resolver/mock-result/results.json, shared
 * with Agent 1's demo): Himadri won. Reuses Agent 1's mock resolver
 * (resolver/scripts/mockResolver.js) for the CLOSED -> RESOLVED step, the
 * same call path the real Chainlink CRE workflow uses.
 *
 * Run: npx hardhat run scripts/demoMarket.js
 */
async function main() {
  const usdcUnits = (n) => ethers.parseUnits(n.toString(), 6);
  const [deployer, resolver, alice, bob, carol] = await ethers.getSigners();

  console.log("== Deploying MockUSDC + local Uniswap V2 stack ==");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  console.log(`MockUSDC deployed to ${await usdc.getAddress()}`);

  const { router } = await deployUniswapV2(deployer);
  await seedETHUSDCLiquidity(router, usdc, deployer, {
    ethAmount: ethers.parseEther("100"),
    usdcAmount: usdcUnits(200_000),
  });
  console.log(`Uniswap V2 Router deployed to ${await router.getAddress()} (WETH/USDC pool seeded, ~1 ETH = 2000 USDC)`);

  console.log("\n== Deploying Market ==");
  const Market = await ethers.getContractFactory("Market");
  const market = await Market.deploy(await usdc.getAddress(), await router.getAddress(), resolver.address);
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log(`Market deployed to ${marketAddress}`);
  console.log(`Authorized resolver: ${resolver.address}`);

  const closeTime = (await time.latest()) + 3600;

  // Throwaway market so the real one lands on marketId 1, matching
  // resolver/mock-result/market-registry.json's eventId -> marketId mapping.
  await (await market.connect(deployer).createMarket("Throwaway", ["A", "B"], closeTime)).wait();

  console.log("\n== Creating market (marketId 1) ==");
  await (
    await market
      .connect(deployer)
      .createMarket("Who wins IITD Inter-Hostel Cricket Final?", ["HIMADRI", "KARAKORAM"], closeTime)
  ).wait();
  console.log('Market: "Who wins IITD Inter-Hostel Cricket Final?" [HIMADRI, KARAKORAM]');

  console.log("\n== Students obtain USDC and place predictions ==");
  await (await usdc.mint(alice.address, usdcUnits(500))).wait();
  await (await usdc.connect(alice).approve(marketAddress, ethers.MaxUint256)).wait();
  await (await market.connect(alice).placeBet(1, 0, usdcUnits(500))).wait();
  console.log("Alice bet 500 USDC directly on HIMADRI");

  console.log("Bob obtains USDC via the Uniswap integration instead of already holding it:");
  const quote = await market.quoteETHForUSDC(ethers.parseEther("0.1"));
  console.log(`  quoteETHForUSDC(0.1 ETH) = ${ethers.formatUnits(quote, 6)} USDC`);
  const minOut = (quote * 99n) / 100n; // 1% slippage tolerance
  const bobTx = await market
    .connect(bob)
    .placeBetWithETH(1, 1, minOut, { value: ethers.parseEther("0.1") });
  const bobReceipt = await bobTx.wait();
  const swapEvent = bobReceipt.logs
    .map((log) => {
      try {
        return market.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "SwappedETHForUSDC");
  console.log(
    `Bob swapped 0.1 ETH -> ${ethers.formatUnits(swapEvent.args.usdcOut, 6)} USDC via the real Uniswap V2 Router, bet it all on KARAKORAM`
  );

  const afterBets = await market.getMarket(1);
  console.log(
    `\nPool: ${ethers.formatUnits(afterBets.totalPool, 6)} USDC total ` +
      `(HIMADRI ${ethers.formatUnits(await market.getOptionPool(1, 0), 6)}, ` +
      `KARAKORAM ${ethers.formatUnits(await market.getOptionPool(1, 1), 6)})`
  );

  console.log("\n== Stage 6 stretch goal: Alice's HIMADRI position is a real, tradeable token ==");
  const [himadriTokenAddr, himadriPairAddr] = await market.getOutcomeToken(1, 0);
  const himadriToken = await ethers.getContractAt("OutcomeToken", himadriTokenAddr);
  console.log(`HIMADRI-M1 outcome token: ${himadriTokenAddr}`);
  console.log(`Listed on Uniswap V2 pair (vs USDC): ${himadriPairAddr}`);

  await seedTokenUSDCLiquidity(router, himadriToken, usdc, alice, {
    tokenAmount: usdcUnits(200),
    usdcAmount: usdcUnits(200),
  });
  console.log("Alice LPs 200 HIMADRI + 200 USDC into the pair (anyone can do this, not just Market itself)");

  await (await usdc.mint(carol.address, usdcUnits(100))).wait();
  await (await usdc.connect(carol).approve(await router.getAddress(), usdcUnits(100))).wait();
  const carolPath = [await usdc.getAddress(), himadriTokenAddr];
  await (
    await router.connect(carol).swapExactTokensForTokens(usdcUnits(100), 0, carolPath, carol.address, closeTime)
  ).wait();
  const carolTokens = await himadriToken.balanceOf(carol.address);
  console.log(
    `Carol buys ${ethers.formatUnits(carolTokens, 6)} HIMADRI tokens with 100 USDC on the secondary market -- she never placed a bet through Market at all`
  );

  console.log("\n== Market closes ==");
  await time.increaseTo(closeTime + 1);
  await (await market.closeMarket(1)).wait();
  console.log(`block.timestamp advanced past closeTime (${closeTime}); market CLOSED`);

  console.log("\n== Official result arrives: Himadri won ==");
  console.log('(In production: Chainlink CRE workflow fetches + confidentially validates this.');
  console.log(" Here: Agent 1's Stage 1 mock resolver, same resolveMarket() call the CRE workflow makes.)");

  const { marketId, winningOption, txHash } = await resolveOne("IITD-CRICKET-2026-FINAL", {
    contractAddress: marketAddress,
    signer: resolver,
  });

  console.log("\n== Market resolved on-chain ==");
  const resolved = await market.getMarket(marketId);
  console.log(`marketId=${marketId} winningOption=${winningOption} (${resolved.options[winningOption]}) tx=${txHash}`);
  console.log(`Total pool:   ${ethers.formatUnits(resolved.totalPool, 6)} USDC`);
  console.log(`Platform fee: ${ethers.formatUnits(resolved.platformFee, 6)} USDC (10%)`);
  console.log(`Winner pool:  ${ethers.formatUnits(resolved.prizePool, 6)} USDC (90%)`);

  console.log("\n== Winners claim payout -- by token balance, not by who originally bet ==");
  const aliceTokensBeforeClaim = await himadriToken.balanceOf(alice.address);
  const alicePayout = await market.previewClaim(1, alice.address);
  const aliceBefore = await usdc.balanceOf(alice.address);
  await (await market.connect(alice).claim(1)).wait();
  const aliceAfter = await usdc.balanceOf(alice.address);
  console.log(
    `Alice claimed ${ethers.formatUnits(aliceAfter - aliceBefore, 6)} USDC for her remaining ${ethers.formatUnits(
      aliceTokensBeforeClaim,
      6
    )} HIMADRI tokens (previewClaim matched: ${alicePayout === aliceAfter - aliceBefore})`
  );

  const carolPayout = await market.previewClaim(1, carol.address);
  const carolBefore = await usdc.balanceOf(carol.address);
  await (await market.connect(carol).claim(1)).wait();
  const carolAfter = await usdc.balanceOf(carol.address);
  console.log(
    `Carol claimed ${ethers.formatUnits(carolAfter - carolBefore, 6)} USDC for her ${ethers.formatUnits(
      carolTokens,
      6
    )} HIMADRI tokens (previewClaim matched: ${carolPayout === carolAfter - carolBefore}) -- she claims a real payout despite never having called placeBet.`
  );

  console.log(
    "\nDemo complete: OPEN -> BET (direct + Uniswap) -> position token listed + traded on Uniswap -> CLOSED -> CRE-style resolution -> RESOLVED -> claimed by token holders."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
