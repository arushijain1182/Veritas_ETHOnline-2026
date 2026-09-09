const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployUniswapV2, seedETHUSDCLiquidity } = require("../scripts/lib/deployUniswapV2");

describe("Market", function () {
  const QUESTION = "Who wins IITD Inter-Hostel Cricket Final?";
  const OPTIONS = ["HIMADRI", "KARAKORAM"];
  const CATEGORY = "Sports";
  const HIMADRI = 0;
  const KARAKORAM = 1;

  const usdcUnits = (n) => ethers.parseUnits(n.toString(), 6);

  async function deployFixture() {
    const [owner, resolver, alice, bob, carol, stranger] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const { router } = await deployUniswapV2(owner);
    // 1 ETH ~= 2000 USDC pool, deep enough that a few-ETH swap has small slippage.
    await seedETHUSDCLiquidity(router, usdc, owner, {
      ethAmount: ethers.parseEther("100"),
      usdcAmount: usdcUnits(200_000),
    });

    const Market = await ethers.getContractFactory("Market");
    const market = await Market.deploy(await usdc.getAddress(), await router.getAddress(), resolver.address);
    await market.waitForDeployment();

    for (const user of [alice, bob, carol]) {
      await usdc.mint(user.address, usdcUnits(1000));
      await usdc.connect(user).approve(await market.getAddress(), ethers.MaxUint256);
    }

    const closeTime = (await time.latest()) + 3600;
    await market.connect(owner).createMarket(QUESTION, OPTIONS, closeTime, CATEGORY);

    return { market, usdc, router, owner, resolver, alice, bob, carol, stranger, closeTime };
  }

  async function closeAndResolve(market, resolver, marketId, winningOption) {
    await time.increaseTo((await market.getMarket(marketId)).closeTime + 1n);
    await market.closeMarket(marketId);
    await market.connect(resolver).resolveMarket(marketId, winningOption);
  }

  // -------------------------------------------------------------------
  // Market: create / view / close
  // -------------------------------------------------------------------
  describe("createMarket", function () {
    it("stores market fields correctly", async function () {
      const { market, closeTime } = await deployFixture();
      const m = await market.getMarket(0);
      expect(m.question).to.equal(QUESTION);
      expect(m.options).to.deep.equal(OPTIONS);
      expect(m.closeTime).to.equal(closeTime);
      expect(m.status).to.equal(0); // OPEN
      expect(m.totalPool).to.equal(0);
      expect(m.category).to.equal(CATEGORY);
      expect(await market.marketCount()).to.equal(1);
    });

    it("emits MarketCreated", async function () {
      const { market, owner } = await deployFixture();
      const closeTime = (await time.latest()) + 3600;
      await expect(market.connect(owner).createMarket("Q2", OPTIONS, closeTime, "Cultural"))
        .to.emit(market, "MarketCreated")
        .withArgs(1, "Q2", OPTIONS, closeTime, "Cultural");
    });

    it("reverts with fewer than two options", async function () {
      const { market, owner } = await deployFixture();
      const closeTime = (await time.latest()) + 3600;
      await expect(
        market.connect(owner).createMarket("Bad market", ["OnlyOne"], closeTime, CATEGORY)
      ).to.be.revertedWithCustomError(market, "InvalidOption");
    });

    it("reverts if closeTime is not in the future", async function () {
      const { market, owner } = await deployFixture();
      const past = (await time.latest()) - 1;
      await expect(
        market.connect(owner).createMarket("Bad market", OPTIONS, past, CATEGORY)
      ).to.be.revertedWithCustomError(market, "InvalidCloseTime");
    });

    it("reverts when called by non-owner", async function () {
      const { market, alice } = await deployFixture();
      const closeTime = (await time.latest()) + 3600;
      await expect(market.connect(alice).createMarket("Q", OPTIONS, closeTime, CATEGORY)).to.be.reverted;
    });
  });

  describe("invalid market id", function () {
    it("reverts getMarket / placeBet / closeMarket for a market that doesn't exist", async function () {
      const { market, alice } = await deployFixture();
      await expect(market.getMarket(99)).to.be.revertedWithCustomError(market, "MarketDoesNotExist");
      await expect(market.connect(alice).placeBet(99, HIMADRI, usdcUnits(10))).to.be.revertedWithCustomError(
        market,
        "MarketDoesNotExist"
      );
      await expect(market.closeMarket(99)).to.be.revertedWithCustomError(market, "MarketDoesNotExist");
    });
  });

  describe("closeMarket", function () {
    it("reverts before the close time has passed", async function () {
      const { market } = await deployFixture();
      await expect(market.closeMarket(0)).to.be.revertedWithCustomError(market, "CloseTimeNotReached");
    });

    it("closes and emits MarketClosed once the close time has passed", async function () {
      const { market, closeTime } = await deployFixture();
      await time.increaseTo(closeTime + 1);
      await expect(market.closeMarket(0)).to.emit(market, "MarketClosed").withArgs(0);
      const m = await market.getMarket(0);
      expect(m.status).to.equal(1); // CLOSED
    });

    it("reverts closing an already-closed market", async function () {
      const { market, closeTime } = await deployFixture();
      await time.increaseTo(closeTime + 1);
      await market.closeMarket(0);
      await expect(market.closeMarket(0)).to.be.revertedWithCustomError(market, "MarketNotOpen");
    });

    it("can be called by anyone, not just the owner", async function () {
      const { market, closeTime, stranger } = await deployFixture();
      await time.increaseTo(closeTime + 1);
      await expect(market.connect(stranger).closeMarket(0)).to.not.be.reverted;
    });
  });

  // -------------------------------------------------------------------
  // Betting
  // -------------------------------------------------------------------
  describe("placeBet", function () {
    it("accumulates stakes and pool totals, emits BetPlaced", async function () {
      const { market, usdc, alice } = await deployFixture();
      const marketAddr = await market.getAddress();

      await expect(market.connect(alice).placeBet(0, HIMADRI, usdcUnits(100)))
        .to.emit(market, "BetPlaced")
        .withArgs(0, alice.address, HIMADRI, usdcUnits(100));

      expect(await usdc.balanceOf(marketAddr)).to.equal(usdcUnits(100));
      const m = await market.getMarket(0);
      expect(m.totalPool).to.equal(usdcUnits(100));
      expect(await market.getOptionPool(0, HIMADRI)).to.equal(usdcUnits(100));
      expect(await market.userContribution(alice.address, 0, HIMADRI)).to.equal(usdcUnits(100));
    });

    it("reverts on zero-amount bets", async function () {
      const { market, alice } = await deployFixture();
      await expect(market.connect(alice).placeBet(0, HIMADRI, 0)).to.be.revertedWithCustomError(
        market,
        "ZeroAmount"
      );
    });

    it("reverts on an invalid option index", async function () {
      const { market, alice } = await deployFixture();
      await expect(market.connect(alice).placeBet(0, 2, usdcUnits(10))).to.be.revertedWithCustomError(
        market,
        "InvalidOption"
      );
    });

    it("reverts on insufficient balance / allowance", async function () {
      const { market, usdc, stranger } = await deployFixture();
      // stranger has no USDC and no approval at all
      await expect(market.connect(stranger).placeBet(0, HIMADRI, usdcUnits(10))).to.be.reverted;

      // funded but never approved
      await usdc.mint(stranger.address, usdcUnits(1000));
      await expect(market.connect(stranger).placeBet(0, HIMADRI, usdcUnits(10))).to.be.reverted;
    });

    it("reverts once the close time has passed, even before closeMarket() is called", async function () {
      const { market, closeTime, alice } = await deployFixture();
      await time.increaseTo(closeTime + 1);
      await expect(market.connect(alice).placeBet(0, HIMADRI, usdcUnits(10))).to.be.revertedWithCustomError(
        market,
        "MarketClosedForBetting"
      );
    });

    it("reverts betting after the market is explicitly closed", async function () {
      const { market, closeTime, alice } = await deployFixture();
      await time.increaseTo(closeTime + 1);
      await market.closeMarket(0);
      await expect(market.connect(alice).placeBet(0, HIMADRI, usdcUnits(10))).to.be.revertedWithCustomError(
        market,
        "MarketNotOpen"
      );
    });
  });

  // -------------------------------------------------------------------
  // Resolution (access control / fee accounting side owned by Agent 2)
  // -------------------------------------------------------------------
  describe("resolveMarket", function () {
    it("can only be called by the authorized resolver", async function () {
      const { market, closeTime, owner } = await deployFixture();
      await time.increaseTo(closeTime + 1);
      await market.closeMarket(0);
      await expect(market.connect(owner).resolveMarket(0, HIMADRI)).to.be.revertedWithCustomError(
        market,
        "NotResolver"
      );
    });

    it("reverts before the market is closed", async function () {
      const { market, resolver } = await deployFixture();
      await expect(market.connect(resolver).resolveMarket(0, HIMADRI)).to.be.revertedWithCustomError(
        market,
        "MarketNotClosed"
      );
    });

    it("reverts on an out-of-range winningOption", async function () {
      const { market, closeTime, resolver } = await deployFixture();
      await time.increaseTo(closeTime + 1);
      await market.closeMarket(0);
      await expect(market.connect(resolver).resolveMarket(0, 5)).to.be.revertedWithCustomError(
        market,
        "InvalidOption"
      );
    });

    it("resolves once and rejects a second resolution", async function () {
      const { market, closeTime, resolver } = await deployFixture();
      await time.increaseTo(closeTime + 1);
      await market.closeMarket(0);
      await market.connect(resolver).resolveMarket(0, HIMADRI);
      await expect(market.connect(resolver).resolveMarket(0, HIMADRI)).to.be.revertedWithCustomError(
        market,
        "MarketAlreadyResolved"
      );
    });

    it("owner can rotate the resolver address", async function () {
      const { market, owner, resolver, stranger, closeTime } = await deployFixture();
      await expect(market.connect(owner).setResolver(stranger.address))
        .to.emit(market, "ResolverUpdated")
        .withArgs(resolver.address, stranger.address);

      await time.increaseTo(closeTime + 1);
      await market.closeMarket(0);
      await expect(market.connect(resolver).resolveMarket(0, HIMADRI)).to.be.revertedWithCustomError(
        market,
        "NotResolver"
      );
      await expect(market.connect(stranger).resolveMarket(0, HIMADRI)).to.not.be.reverted;
    });
  });

  // -------------------------------------------------------------------
  // Payout / fee / claim
  // -------------------------------------------------------------------
  describe("claim (fee + proportional payout)", function () {
    it("splits 1000/700/100 exactly as the spec example (128.57 USDC)", async function () {
      const { market, usdc, owner, resolver, alice, bob, carol } = await deployFixture();

      // Himadri pool: alice 100 + bob 600 = 700; Karakoram pool: carol 300. Total = 1000.
      await market.connect(alice).placeBet(0, HIMADRI, usdcUnits(100));
      await market.connect(bob).placeBet(0, HIMADRI, usdcUnits(600));
      await market.connect(carol).placeBet(0, KARAKORAM, usdcUnits(300));

      await closeAndResolve(market, resolver, 0, HIMADRI);

      const m = await market.getMarket(0);
      expect(m.totalPool).to.equal(usdcUnits(1000));
      expect(m.platformFee).to.equal(usdcUnits(100)); // 10%
      expect(m.prizePool).to.equal(usdcUnits(900)); // 90%

      // feeRecipient defaults to the deployer (owner).
      expect(await usdc.balanceOf(owner.address)).to.equal(usdcUnits(100));

      const expectedAlicePayout = (usdcUnits(100) * usdcUnits(900)) / usdcUnits(700); // 900 * 100/700
      expect(await market.previewClaim(0, alice.address)).to.equal(expectedAlicePayout);
      expect(expectedAlicePayout).to.equal(128571428n); // 128.571428 USDC (6 decimals)

      const before = await usdc.balanceOf(alice.address);
      await expect(market.connect(alice).claim(0))
        .to.emit(market, "Claimed")
        .withArgs(0, alice.address, expectedAlicePayout);
      expect(await usdc.balanceOf(alice.address)).to.equal(before + expectedAlicePayout);
    });

    it("losing bettors cannot claim", async function () {
      const { market, resolver, alice, carol } = await deployFixture();
      await market.connect(alice).placeBet(0, HIMADRI, usdcUnits(100));
      await market.connect(carol).placeBet(0, KARAKORAM, usdcUnits(300));

      await closeAndResolve(market, resolver, 0, HIMADRI);

      expect(await market.previewClaim(0, carol.address)).to.equal(0);
      await expect(market.connect(carol).claim(0)).to.be.revertedWithCustomError(market, "NoWinningStake");
    });

    it("pays multiple winners proportionally and blocks double claims (via burned tokens, not a claimed flag)", async function () {
      const { market, usdc, resolver, alice, bob, carol } = await deployFixture();
      await market.connect(alice).placeBet(0, HIMADRI, usdcUnits(100));
      await market.connect(bob).placeBet(0, HIMADRI, usdcUnits(300));
      await market.connect(carol).placeBet(0, KARAKORAM, usdcUnits(200));

      await closeAndResolve(market, resolver, 0, HIMADRI);

      const aliceBefore = await usdc.balanceOf(alice.address);
      const bobBefore = await usdc.balanceOf(bob.address);
      await market.connect(alice).claim(0);
      await market.connect(bob).claim(0);

      // total pool 600, fee 60, prize 540; alice 1/4 -> 135, bob 3/4 -> 405
      expect((await usdc.balanceOf(alice.address)) - aliceBefore).to.equal(usdcUnits(135));
      expect((await usdc.balanceOf(bob.address)) - bobBefore).to.equal(usdcUnits(405));

      await expect(market.connect(alice).claim(0)).to.be.revertedWithCustomError(market, "NoWinningStake");
    });

    it("reverts claim before the market is resolved", async function () {
      const { market, alice } = await deployFixture();
      await market.connect(alice).placeBet(0, HIMADRI, usdcUnits(100));
      await expect(market.connect(alice).claim(0)).to.be.revertedWithCustomError(market, "MarketNotResolved");
    });

    it("handles rounding: total claimed never exceeds prizePool, dust stays in contract", async function () {
      const { market, usdc, resolver, alice, bob, carol } = await deployFixture();
      // 3-way split of the winning pool that doesn't divide evenly.
      await market.connect(alice).placeBet(0, HIMADRI, usdcUnits(1)); // 1e6 units
      await market.connect(bob).placeBet(0, HIMADRI, usdcUnits(1));
      await market.connect(carol).placeBet(0, HIMADRI, usdcUnits(1));
      // add a tiny losing stake so totalPool isn't a round number relative to fee math
      const [, , , , , dave] = await ethers.getSigners();
      await usdc.mint(dave.address, usdcUnits(10));
      await usdc.connect(dave).approve(await market.getAddress(), ethers.MaxUint256);
      await market.connect(dave).placeBet(0, KARAKORAM, usdcUnits(7));

      await closeAndResolve(market, resolver, 0, HIMADRI);

      const m = await market.getMarket(0);
      const marketAddr = await market.getAddress();

      const a = await market.previewClaim(0, alice.address);
      const b = await market.previewClaim(0, bob.address);
      const c = await market.previewClaim(0, carol.address);
      expect(a + b + c).to.be.lte(m.prizePool);

      await market.connect(alice).claim(0);
      await market.connect(bob).claim(0);
      await market.connect(carol).claim(0);

      // contract should hold exactly the rounding dust after fee was paid out and all winners claimed
      const dust = m.prizePool - (a + b + c);
      expect(await usdc.balanceOf(marketAddr)).to.equal(dust);
    });

    it("previewClaim mirrors the actual claimable amount before/after claiming", async function () {
      const { market, resolver, alice, carol } = await deployFixture();
      await market.connect(alice).placeBet(0, HIMADRI, usdcUnits(100));
      await market.connect(carol).placeBet(0, KARAKORAM, usdcUnits(50));
      await closeAndResolve(market, resolver, 0, HIMADRI);

      const expected = await market.previewClaim(0, alice.address);
      expect(expected).to.be.gt(0);
      await market.connect(alice).claim(0);
      expect(await market.previewClaim(0, alice.address)).to.equal(0);
    });

    it("scales to many independent claimers without the resolver looping over them", async function () {
      const { market, resolver, owner } = await deployFixture();
      const signers = await ethers.getSigners();
      const usdc = await ethers.getContractAt("MockUSDC", await market.usdc());
      const bettors = signers.slice(6, 16); // 10 independent bettors

      for (const b of bettors) {
        await usdc.mint(b.address, usdcUnits(10));
        await usdc.connect(b).approve(await market.getAddress(), ethers.MaxUint256);
        await market.connect(b).placeBet(0, HIMADRI, usdcUnits(10));
      }

      const closeTime = (await market.getMarket(0)).closeTime;
      await time.increaseTo(closeTime + 1n);
      const resolveTx = await market.closeMarket(0).then(() => market.connect(resolver).resolveMarket(0, HIMADRI));
      const resolveReceipt = await resolveTx.wait();
      // resolution cost doesn't scale with staker count (no loop over winners)
      expect(resolveReceipt.gasUsed).to.be.lt(150_000n);

      for (const b of bettors) {
        await expect(market.connect(b).claim(0)).to.not.be.reverted;
      }
    });
  });

  // -------------------------------------------------------------------
  // Uniswap integration
  // -------------------------------------------------------------------
  describe("placeBetWithETH (Uniswap swap-and-bet)", function () {
    it("swaps ETH for USDC via the real Uniswap V2 Router and records the bet", async function () {
      const { market, usdc, alice } = await deployFixture();
      const quoted = await market.quoteETHForUSDC(ethers.parseEther("1"));
      expect(quoted).to.be.gt(0);

      const minOut = (quoted * 99n) / 100n; // 1% slippage tolerance

      await expect(
        market.connect(alice).placeBetWithETH(0, HIMADRI, minOut, { value: ethers.parseEther("1") })
      ).to.emit(market, "SwappedETHForUSDC");

      const contribution = await market.userContribution(alice.address, 0, HIMADRI);
      expect(contribution).to.be.gte(minOut);
      expect(await usdc.balanceOf(await market.getAddress())).to.be.gte(minOut);

      const m = await market.getMarket(0);
      expect(m.totalPool).to.equal(contribution);
    });

    it("reverts with zero ETH sent", async function () {
      const { market, alice } = await deployFixture();
      await expect(
        market.connect(alice).placeBetWithETH(0, HIMADRI, 0, { value: 0 })
      ).to.be.revertedWithCustomError(market, "ZeroAmount");
    });

    it("reverts (fails) when minUSDCOut is set above what the pool can return (slippage protection)", async function () {
      const { market, alice } = await deployFixture();
      const quoted = await market.quoteETHForUSDC(ethers.parseEther("1"));
      const impossibleMin = quoted * 2n;
      await expect(
        market.connect(alice).placeBetWithETH(0, HIMADRI, impossibleMin, { value: ethers.parseEther("1") })
      ).to.be.reverted; // Uniswap Router: INSUFFICIENT_OUTPUT_AMOUNT
    });

    it("reverts when there is no liquidity for the pair (failed swap)", async function () {
      const { usdc, resolver, alice } = await deployFixture();
      const { router: emptyRouter } = await deployUniswapV2((await ethers.getSigners())[0]);
      const Market = await ethers.getContractFactory("Market");
      const brokeMarket = await Market.deploy(await usdc.getAddress(), await emptyRouter.getAddress(), resolver.address);
      await brokeMarket.waitForDeployment();
      const closeTime = (await time.latest()) + 3600;
      await brokeMarket.createMarket(QUESTION, OPTIONS, closeTime, CATEGORY);

      await expect(
        brokeMarket.connect(alice).placeBetWithETH(0, HIMADRI, 0, { value: ethers.parseEther("1") })
      ).to.be.reverted;
    });

    it("credits the bet with the actual USDC received from the swap, not the ETH amount", async function () {
      const { market, usdc, alice } = await deployFixture();
      const before = await usdc.balanceOf(await market.getAddress());
      const tx = await market.connect(alice).placeBetWithETH(0, HIMADRI, 0, { value: ethers.parseEther("1") });
      const receipt = await tx.wait();
      const event = receipt.logs
        .map((log) => {
          try {
            return market.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "SwappedETHForUSDC");
      const usdcOut = event.args.usdcOut;

      const after = await usdc.balanceOf(await market.getAddress());
      expect(after - before).to.equal(usdcOut);
      expect(await market.userContribution(alice.address, 0, HIMADRI)).to.equal(usdcOut);
    });
  });

  describe("setFeeRecipient", function () {
    it("only owner can update, and resolution pays the new recipient", async function () {
      const { market, usdc, owner, resolver, alice, stranger, closeTime } = await deployFixture();
      await expect(market.connect(alice).setFeeRecipient(stranger.address)).to.be.reverted;

      await expect(market.connect(owner).setFeeRecipient(stranger.address))
        .to.emit(market, "FeeRecipientUpdated")
        .withArgs(owner.address, stranger.address);

      await market.connect(alice).placeBet(0, HIMADRI, usdcUnits(100));
      await time.increaseTo(closeTime + 1);
      await market.closeMarket(0);
      await market.connect(resolver).resolveMarket(0, HIMADRI);

      expect(await usdc.balanceOf(stranger.address)).to.equal(usdcUnits(10));
    });
  });
});
