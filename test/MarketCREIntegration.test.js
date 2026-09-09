const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

/**
 * Stage 8: wires Market.sol (Agent 2) to CREMarketResolverReceiver
 * (Agent 1) — the on-chain adapter a real Chainlink CRE workflow writes to
 * via a signed report through a Forwarder — rather than a plain EOA
 * resolver. Confirms the full CREATE -> BET -> BET -> CLOSE -> CHAINLINK
 * (forwarder-relayed) RESOLUTION -> CLAIM lifecycle from the brief works
 * with the real market contract, not just Agent 1's reference
 * MarketResolution.sol (already covered by test/resolver/CREMarketResolverReceiver.test.js).
 */
describe("Market <-> CREMarketResolverReceiver integration", function () {
  const QUESTION = "Who wins IITD Inter-Hostel Cricket Final?";
  const OPTIONS = ["HIMADRI", "KARAKORAM"];
  const HIMADRI = 0;
  const KARAKORAM = 1;
  const usdcUnits = (n) => ethers.parseUnits(n.toString(), 6);

  function encodeReport(marketId, winningOption) {
    return ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [marketId, winningOption]);
  }

  async function deployFixture() {
    const [owner, forwarder, alice, bob] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    // Uniswap Router isn't exercised in this test; any non-zero address
    // satisfies Market's constructor since placeBetWithETH is never called.
    const dummyRouter = owner.address;

    const Market = await ethers.getContractFactory("Market");
    // Deploy with a placeholder resolver, then rotate to the receiver once
    // we know its address (the receiver's constructor needs the market's).
    const market = await Market.deploy(await usdc.getAddress(), dummyRouter, owner.address);
    await market.waitForDeployment();

    const Receiver = await ethers.getContractFactory("CREMarketResolverReceiver");
    const receiver = await Receiver.deploy(await market.getAddress(), forwarder.address);
    await receiver.waitForDeployment();

    await market.connect(owner).setResolver(await receiver.getAddress());

    for (const user of [alice, bob]) {
      await usdc.mint(user.address, usdcUnits(1000));
      await usdc.connect(user).approve(await market.getAddress(), ethers.MaxUint256);
    }

    const closeTime = (await time.latest()) + 3600;
    await market.connect(owner).createMarket(QUESTION, OPTIONS, closeTime, "Sports");

    return { market, usdc, receiver, owner, forwarder, alice, bob, closeTime };
  }

  it("runs CREATE -> BET -> BET -> CLOSE -> forwarder-relayed RESOLUTION -> CLAIM end to end", async function () {
    const { market, usdc, receiver, forwarder, alice, bob, closeTime } = await deployFixture();

    await market.connect(alice).placeBet(0, HIMADRI, usdcUnits(100));
    await market.connect(bob).placeBet(0, KARAKORAM, usdcUnits(300));

    await time.increaseTo(closeTime + 1);
    await market.closeMarket(0);

    // The forwarder is the only caller a real CRE deployment's Forwarder
    // contract would use; resolveMarket() is never called directly here.
    const report = encodeReport(0, HIMADRI);
    await expect(receiver.connect(forwarder).onReport("0x", report))
      .to.emit(receiver, "ReportRelayed")
      .withArgs(0, HIMADRI);

    const m = await market.getMarket(0);
    expect(m.status).to.equal(2); // RESOLVED
    expect(m.winningOption).to.equal(HIMADRI);
    expect(m.platformFee).to.equal(usdcUnits(40)); // 10% of 400
    expect(m.prizePool).to.equal(usdcUnits(360)); // 90% of 400

    const before = await usdc.balanceOf(alice.address);
    await market.connect(alice).claim(0);
    expect((await usdc.balanceOf(alice.address)) - before).to.equal(usdcUnits(360)); // sole HIMADRI backer
  });

  it("rejects a resolution relayed by anyone but the forwarder", async function () {
    const { market, receiver, owner, closeTime } = await deployFixture();
    await time.increaseTo(closeTime + 1);
    await market.closeMarket(0);

    await expect(receiver.connect(owner).onReport("0x", encodeReport(0, HIMADRI))).to.be.revertedWithCustomError(
      receiver,
      "NotForwarder"
    );
  });

  it("propagates Market's own guards (e.g. resolving before close) through the receiver", async function () {
    const { market, receiver, forwarder } = await deployFixture();
    await expect(receiver.connect(forwarder).onReport("0x", encodeReport(0, HIMADRI))).to.be.revertedWithCustomError(
      market,
      "MarketNotClosed"
    );
  });
});
