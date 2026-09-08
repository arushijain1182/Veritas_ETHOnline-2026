const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const fs = require("fs");
const path = require("path");
const { resolveOne } = require("../../resolver/scripts/mockResolver");

const LEDGER_PATH = path.join(__dirname, "..", "..", "resolver", "mock-result", "resolved-events.json");

describe("resolver/scripts/mockResolver (Stage 1 mock resolver, end-to-end)", function () {
  afterEach(function () {
    // keep the committed repo state clean between test runs
    if (fs.existsSync(LEDGER_PATH)) fs.unlinkSync(LEDGER_PATH);
  });

  async function deployAndCloseTwoMarkets(resolverSigner) {
    const MarketResolution = await ethers.getContractFactory("MarketResolution");
    const market = await MarketResolution.deploy(resolverSigner.address);

    const closingTime = (await time.latest()) + 3600;

    // A throwaway market first, so the real one lands on marketId 1 to match
    // the checked-in resolver/mock-result/market-registry.json example.
    await market.createMarket("Throwaway market", ["A", "B"], closingTime);
    await market.createMarket(
      "Who wins IITD Inter-Hostel Cricket Final?",
      ["HIMADRI", "KARAKORAM"],
      closingTime
    );

    await time.increaseTo(closingTime + 1);
    return market;
  }

  it("resolves marketId 1 to HIMADRI from the mock official result", async function () {
    const [, resolver] = await ethers.getSigners();
    const market = await deployAndCloseTwoMarkets(resolver);

    const { marketId, winningOption } = await resolveOne("IITD-CRICKET-2026-FINAL", {
      contractAddress: await market.getAddress(),
      signer: resolver,
    });

    expect(marketId).to.equal(1);
    expect(winningOption).to.equal(0); // HIMADRI is options[0]

    const m = await market.getMarket(1);
    expect(m.resolved).to.equal(true);
    expect(m.winningOption).to.equal(0);
  });

  it("reverts on-chain if the mock resolver's signer is not the authorized resolver", async function () {
    const [, resolver, notResolver] = await ethers.getSigners();
    const market = await deployAndCloseTwoMarkets(resolver);

    await expect(
      resolveOne("IITD-CRICKET-2026-FINAL", {
        contractAddress: await market.getAddress(),
        signer: notResolver,
      })
    ).to.be.reverted;
  });

  it("refuses to resolve the same eventId twice (duplicate result protection)", async function () {
    const [, resolver] = await ethers.getSigners();
    const market = await deployAndCloseTwoMarkets(resolver);

    await resolveOne("IITD-CRICKET-2026-FINAL", {
      contractAddress: await market.getAddress(),
      signer: resolver,
    });

    let threw = false;
    try {
      await resolveOne("IITD-CRICKET-2026-FINAL", {
        contractAddress: await market.getAddress(),
        signer: resolver,
      });
    } catch (e) {
      threw = true;
      expect(e.code).to.equal("DUPLICATE_RESULT");
    }
    expect(threw).to.equal(true);
  });
});
