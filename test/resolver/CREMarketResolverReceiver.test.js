const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("CREMarketResolverReceiver", function () {
  async function deployFixture() {
    const [owner, forwarder, notForwarder] = await ethers.getSigners();

    const MarketResolution = await ethers.getContractFactory("MarketResolution");
    // Receiver will be the market's resolver, so deploy the market with a
    // placeholder resolver first, then point it at the receiver once we know
    // the receiver's address (receiver's constructor needs the market address).
    const market = await MarketResolution.deploy(owner.address);

    const Receiver = await ethers.getContractFactory("CREMarketResolverReceiver");
    const receiver = await Receiver.deploy(await market.getAddress(), forwarder.address);

    await market.connect(owner).setResolver(await receiver.getAddress());

    const closingTime = (await time.latest()) + 3600;
    await market.connect(owner).createMarket("Who wins?", ["HIMADRI", "KARAKORAM"], closingTime);
    await time.increaseTo(closingTime + 1);

    return { market, receiver, owner, forwarder, notForwarder };
  }

  function encodeReport(marketId, winningOption) {
    return ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [marketId, winningOption]);
  }

  it("relays a report from the forwarder into resolveMarket", async function () {
    const { market, receiver, forwarder } = await deployFixture();

    const report = encodeReport(0, 0);
    await expect(receiver.connect(forwarder).onReport("0x", report))
      .to.emit(receiver, "ReportRelayed")
      .withArgs(0, 0);

    const m = await market.getMarket(0);
    expect(m.resolved).to.equal(true);
    expect(m.winningOption).to.equal(0);
  });

  it("rejects onReport from anyone but the forwarder", async function () {
    const { receiver, notForwarder } = await deployFixture();
    const report = encodeReport(0, 0);
    await expect(receiver.connect(notForwarder).onReport("0x", report)).to.be.revertedWithCustomError(
      receiver,
      "NotForwarder"
    );
  });

  it("rejects a malformed (wrong-length) report body", async function () {
    const { receiver, forwarder } = await deployFixture();
    await expect(receiver.connect(forwarder).onReport("0x", "0x1234")).to.be.revertedWithCustomError(
      receiver,
      "InvalidReportLength"
    );
  });

  it("propagates the market contract's own guards (e.g. double resolution)", async function () {
    const { receiver, forwarder } = await deployFixture();
    const report = encodeReport(0, 0);
    await receiver.connect(forwarder).onReport("0x", report);

    await expect(receiver.connect(forwarder).onReport("0x", report)).to.be.reverted; // MarketAlreadyResolved
  });

  it("owner can rotate the forwarder address", async function () {
    const { receiver, owner, forwarder, notForwarder } = await deployFixture();
    await receiver.connect(owner).setForwarder(notForwarder.address);

    const report = encodeReport(0, 0);
    await expect(receiver.connect(forwarder).onReport("0x", report)).to.be.revertedWithCustomError(
      receiver,
      "NotForwarder"
    );
    await expect(receiver.connect(notForwarder).onReport("0x", report)).to.not.be.reverted;
  });
});
