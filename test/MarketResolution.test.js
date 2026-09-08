const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("MarketResolution", function () {
  const QUESTION = "Who wins the ETHOnline demo award?";
  const OPTIONS = ["Himadri", "Someone Else"];
  const HIMADRI = 0;
  const SOMEONE_ELSE = 1;

  async function deployFixture() {
    const [owner, resolver, alice, bob, carol, stranger] = await ethers.getSigners();

    const MarketResolution = await ethers.getContractFactory("MarketResolution");
    const market = await MarketResolution.deploy(resolver.address);

    const closingTime = (await time.latest()) + 3600;
    await market.connect(owner).createMarket(QUESTION, OPTIONS, closingTime);

    return { market, owner, resolver, alice, bob, carol, stranger, closingTime };
  }

  describe("createMarket", function () {
    it("stores market fields correctly", async function () {
      const { market, closingTime } = await deployFixture();

      const m = await market.getMarket(0);
      expect(m.question).to.equal(QUESTION);
      expect(m.options).to.deep.equal(OPTIONS);
      expect(m.closingTime).to.equal(closingTime);
      expect(m.resolved).to.equal(false);
      expect(m.totalPool).to.equal(0);
      expect(await market.marketCount()).to.equal(1);
    });

    it("reverts with fewer than two options", async function () {
      const { market, owner } = await deployFixture();
      const closingTime = (await time.latest()) + 3600;
      await expect(
        market.connect(owner).createMarket("Bad market", ["OnlyOne"], closingTime)
      ).to.be.revertedWithCustomError(market, "InvalidOption");
    });

    it("reverts if closingTime is in the past", async function () {
      const { market, owner } = await deployFixture();
      await expect(
        market.connect(owner).createMarket("Bad market", OPTIONS, 1)
      ).to.be.revertedWithCustomError(market, "InvalidClosingTime");
    });

    it("reverts when called by non-owner", async function () {
      const { market, stranger } = await deployFixture();
      const closingTime = (await time.latest()) + 3600;
      await expect(
        market.connect(stranger).createMarket(QUESTION, OPTIONS, closingTime)
      ).to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
    });
  });

  describe("placeBet", function () {
    it("accumulates stakes and pool totals", async function () {
      const { market, alice, bob } = await deployFixture();

      await market.connect(alice).placeBet(0, HIMADRI, { value: ethers.parseEther("1") });
      await market.connect(bob).placeBet(0, SOMEONE_ELSE, { value: ethers.parseEther("3") });

      expect(await market.optionPool(0, HIMADRI)).to.equal(ethers.parseEther("1"));
      expect(await market.optionPool(0, SOMEONE_ELSE)).to.equal(ethers.parseEther("3"));
      const m = await market.getMarket(0);
      expect(m.totalPool).to.equal(ethers.parseEther("4"));
    });

    it("reverts on zero-value bets", async function () {
      const { market, alice } = await deployFixture();
      await expect(
        market.connect(alice).placeBet(0, HIMADRI, { value: 0 })
      ).to.be.revertedWithCustomError(market, "ZeroAmount");
    });

    it("reverts on invalid option index", async function () {
      const { market, alice } = await deployFixture();
      await expect(
        market.connect(alice).placeBet(0, 5, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(market, "InvalidOption");
    });

    it("reverts once the market has closed", async function () {
      const { market, alice, closingTime } = await deployFixture();
      await time.increaseTo(closingTime + 1);
      await expect(
        market.connect(alice).placeBet(0, HIMADRI, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(market, "MarketClosed");
    });

    it("reverts for a market that does not exist", async function () {
      const { market, alice } = await deployFixture();
      await expect(
        market.connect(alice).placeBet(99, HIMADRI, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(market, "MarketDoesNotExist");
    });
  });

  describe("resolveMarket", function () {
    it("can only be called by the authorized resolver", async function () {
      const { market, owner, alice, closingTime } = await deployFixture();
      await time.increaseTo(closingTime + 1);
      await expect(
        market.connect(owner).resolveMarket(0, HIMADRI)
      ).to.be.revertedWithCustomError(market, "NotResolver");
      await expect(
        market.connect(alice).resolveMarket(0, HIMADRI)
      ).to.be.revertedWithCustomError(market, "NotResolver");
    });

    it("reverts before the market closes", async function () {
      const { market, resolver } = await deployFixture();
      await expect(
        market.connect(resolver).resolveMarket(0, HIMADRI)
      ).to.be.revertedWithCustomError(market, "MarketNotClosed");
    });

    it("resolves once and rejects a second resolution", async function () {
      const { market, resolver, closingTime } = await deployFixture();
      await time.increaseTo(closingTime + 1);

      await expect(market.connect(resolver).resolveMarket(0, HIMADRI))
        .to.emit(market, "MarketResolved")
        .withArgs(0, HIMADRI, 0);

      const m = await market.getMarket(0);
      expect(m.resolved).to.equal(true);
      expect(m.winningOption).to.equal(HIMADRI);

      await expect(
        market.connect(resolver).resolveMarket(0, SOMEONE_ELSE)
      ).to.be.revertedWithCustomError(market, "MarketAlreadyResolved");
    });

    it("owner can rotate the resolver address", async function () {
      const { market, owner, resolver, stranger, closingTime } = await deployFixture();
      await market.connect(owner).setResolver(stranger.address);
      await time.increaseTo(closingTime + 1);

      await expect(
        market.connect(resolver).resolveMarket(0, HIMADRI)
      ).to.be.revertedWithCustomError(market, "NotResolver");

      await expect(market.connect(stranger).resolveMarket(0, HIMADRI)).to.not.be.reverted;
    });

    it("reverts on an out-of-range winningOption", async function () {
      const { market, resolver, closingTime } = await deployFixture();
      await time.increaseTo(closingTime + 1);
      await expect(
        market.connect(resolver).resolveMarket(0, 5)
      ).to.be.revertedWithCustomError(market, "InvalidOption");
    });

    it("reverts when resolving a market that doesn't exist", async function () {
      const { market, resolver, closingTime } = await deployFixture();
      await time.increaseTo(closingTime + 1);
      await expect(
        market.connect(resolver).resolveMarket(99, HIMADRI)
      ).to.be.revertedWithCustomError(market, "MarketDoesNotExist");
    });
  });

  describe("claim (pull-payment payouts)", function () {
    it("pays winners proportionally and blocks losers / double claims", async function () {
      const { market, resolver, alice, bob, carol, closingTime } = await deployFixture();

      // Alice and Bob back Himadri, Carol backs the other side.
      await market.connect(alice).placeBet(0, HIMADRI, { value: ethers.parseEther("1") });
      await market.connect(bob).placeBet(0, HIMADRI, { value: ethers.parseEther("3") });
      await market.connect(carol).placeBet(0, SOMEONE_ELSE, { value: ethers.parseEther("4") });

      await time.increaseTo(closingTime + 1);
      await market.connect(resolver).resolveMarket(0, HIMADRI);

      // Total pool = 8 ETH, winning pool = 4 ETH -> 2x multiplier for Himadri backers.
      const aliceBefore = await ethers.provider.getBalance(alice.address);
      const tx = await market.connect(alice).claim(0);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const aliceAfter = await ethers.provider.getBalance(alice.address);

      expect(aliceAfter).to.equal(aliceBefore + ethers.parseEther("2") - gasCost);

      const bobBefore = await ethers.provider.getBalance(bob.address);
      const tx2 = await market.connect(bob).claim(0);
      const receipt2 = await tx2.wait();
      const gasCost2 = receipt2.gasUsed * receipt2.gasPrice;
      const bobAfter = await ethers.provider.getBalance(bob.address);
      expect(bobAfter).to.equal(bobBefore + ethers.parseEther("6") - gasCost2);

      // Carol backed the losing option -> nothing to claim.
      await expect(market.connect(carol).claim(0)).to.be.revertedWithCustomError(
        market,
        "NoWinningStake"
      );

      // Alice cannot claim twice.
      await expect(market.connect(alice).claim(0)).to.be.revertedWithCustomError(
        market,
        "AlreadyClaimed"
      );
    });

    it("reverts claim before the market is resolved", async function () {
      const { market, alice } = await deployFixture();
      await market.connect(alice).placeBet(0, HIMADRI, { value: ethers.parseEther("1") });
      await expect(market.connect(alice).claim(0)).to.be.revertedWithCustomError(
        market,
        "MarketNotResolved"
      );
    });

    it("previewClaim mirrors the actual payout without a transaction", async function () {
      const { market, resolver, alice, bob, closingTime } = await deployFixture();
      await market.connect(alice).placeBet(0, HIMADRI, { value: ethers.parseEther("1") });
      await market.connect(bob).placeBet(0, SOMEONE_ELSE, { value: ethers.parseEther("1") });

      await time.increaseTo(closingTime + 1);
      await market.connect(resolver).resolveMarket(0, HIMADRI);

      expect(await market.previewClaim(0, alice.address)).to.equal(ethers.parseEther("2"));
      expect(await market.previewClaim(0, bob.address)).to.equal(0);
    });

    it("scales to many independent claimers without pushing funds in one tx", async function () {
      // Sanity check the claim-pull design: resolving the market touches storage for the
      // market only, not for every staker, and each user pulls their own payout later.
      const { market, resolver, closingTime } = await deployFixture();
      const wallets = await Promise.all(
        Array.from({ length: 15 }, () => ethers.Wallet.createRandom().connect(ethers.provider))
      );
      const [funder] = await ethers.getSigners();
      for (const w of wallets) {
        await funder.sendTransaction({ to: w.address, value: ethers.parseEther("2") });
        await market.connect(w).placeBet(0, HIMADRI, { value: ethers.parseEther("1") });
      }

      await time.increaseTo(closingTime + 1);
      const resolveTx = await market.connect(resolver).resolveMarket(0, HIMADRI);
      const resolveReceipt = await resolveTx.wait();
      // Resolution cost stays flat regardless of staker count.
      expect(resolveReceipt.gasUsed).to.be.below(100_000n);

      for (const w of wallets) {
        await expect(market.connect(w).claim(0)).to.changeEtherBalance(
          w,
          ethers.parseEther("1")
        );
      }
    });
  });
});
