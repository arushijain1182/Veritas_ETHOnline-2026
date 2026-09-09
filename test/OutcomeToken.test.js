const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployUniswapV2, seedETHUSDCLiquidity, seedTokenUSDCLiquidity } = require("../scripts/lib/deployUniswapV2");

/**
 * Stage 6 stretch goal: transferable YES/NO-style position tokens, listed
 * on a Uniswap V2 pair against USDC. Verifies the token side (mint on bet,
 * transferability, burn-on-claim, access control) and the Uniswap side
 * (pair actually created at market creation, and actually tradeable).
 */
describe("OutcomeToken (Stage 6 stretch goal)", function () {
  const QUESTION = "Who wins IITD Inter-Hostel Cricket Final?";
  const OPTIONS = ["HIMADRI", "KARAKORAM"];
  const HIMADRI = 0;
  const KARAKORAM = 1;
  const usdcUnits = (n) => ethers.parseUnits(n.toString(), 6);

  async function deployFixture() {
    const [owner, resolver, alice, bob, carol] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const { router } = await deployUniswapV2(owner);
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
    await market.connect(owner).createMarket(QUESTION, OPTIONS, closeTime, "Sports");

    const [himadriTokenAddr, himadriPair] = await market.getOutcomeToken(0, HIMADRI);
    const [karakoramTokenAddr] = await market.getOutcomeToken(0, KARAKORAM);
    const himadriToken = await ethers.getContractAt("OutcomeToken", himadriTokenAddr);
    const karakoramToken = await ethers.getContractAt("OutcomeToken", karakoramTokenAddr);

    return {
      market,
      usdc,
      router,
      owner,
      resolver,
      alice,
      bob,
      carol,
      closeTime,
      himadriToken,
      karakoramToken,
      himadriPair,
    };
  }

  async function closeAndResolve(market, resolver, marketId, winningOption) {
    await time.increaseTo((await market.getMarket(marketId)).closeTime + 1n);
    await market.closeMarket(marketId);
    await market.connect(resolver).resolveMarket(marketId, winningOption);
  }

  describe("token creation at market creation", function () {
    it("deploys one ERC20 per option and lists it on a real Uniswap V2 pair against USDC", async function () {
      const { market, usdc, himadriToken, karakoramToken, himadriPair } = await deployFixture();

      expect(await himadriToken.symbol()).to.equal("HIMADRI-M0");
      expect(await himadriToken.name()).to.equal("HIMADRI-M0");
      expect(await himadriToken.decimals()).to.equal(6); // matches MockUSDC, 1:1 no rescaling
      expect(await himadriToken.market()).to.equal(await market.getAddress());
      expect(await karakoramToken.symbol()).to.equal("KARAKORAM-M0");

      // A real, non-placeholder Uniswap V2 pair address, distinct per option.
      expect(himadriPair).to.not.equal(ethers.ZeroAddress);
      const [, karakoramPair] = await market.getOutcomeToken(0, KARAKORAM);
      expect(karakoramPair).to.not.equal(ethers.ZeroAddress);
      expect(karakoramPair).to.not.equal(himadriPair);

      const pair = await ethers.getContractAt("IUniswapV2Pair", himadriPair);
      const [t0, t1] = [(await pair.token0()).toLowerCase(), (await pair.token1()).toLowerCase()];
      expect([t0, t1]).to.include.members([
        (await himadriToken.getAddress()).toLowerCase(),
        (await usdc.getAddress()).toLowerCase(),
      ]);
    });

    it("emits OutcomeTokenCreated for each option", async function () {
      const { market, owner } = await deployFixture();
      const closeTime = (await time.latest()) + 3600;
      const tx = await market.connect(owner).createMarket("Q2", OPTIONS, closeTime, "Sports");
      await expect(tx).to.emit(market, "OutcomeTokenCreated");
      const receipt = await tx.wait();
      const events = receipt.logs.map((l) => {
        try {
          return market.interface.parseLog(l);
        } catch {
          return null;
        }
      });
      const created = events.filter((e) => e && e.name === "OutcomeTokenCreated");
      expect(created.length).to.equal(2);
      expect(created[0].args.uniswapPair).to.not.equal(ethers.ZeroAddress);
    });

    it("still creates a market (with a pairless token) if the Uniswap router has no code", async function () {
      const [owner, resolver] = await ethers.getSigners();
      const MockUSDC = await ethers.getContractFactory("MockUSDC");
      const usdc = await MockUSDC.deploy();
      const Market = await ethers.getContractFactory("Market");
      // owner.address is an EOA -- no code -- standing in for "no real Router configured".
      const market = await Market.deploy(await usdc.getAddress(), owner.address, resolver.address);
      const closeTime = (await time.latest()) + 3600;

      await expect(market.createMarket(QUESTION, OPTIONS, closeTime, "Sports")).to.not.be.reverted;

      const [token, pair] = await market.getOutcomeToken(0, HIMADRI);
      expect(token).to.not.equal(ethers.ZeroAddress); // token still exists
      expect(pair).to.equal(ethers.ZeroAddress); // just not listed
    });
  });

  describe("minting on bet", function () {
    it("mints outcome tokens 1:1 with the USDC staked", async function () {
      const { market, alice, himadriToken } = await deployFixture();
      await market.connect(alice).placeBet(0, HIMADRI, usdcUnits(100));
      expect(await himadriToken.balanceOf(alice.address)).to.equal(usdcUnits(100));
    });

    it("mints from the Uniswap ETH-swap bet path too", async function () {
      const { market, alice, karakoramToken } = await deployFixture();
      const tx = await market.connect(alice).placeBetWithETH(0, KARAKORAM, 0, { value: ethers.parseEther("1") });
      const receipt = await tx.wait();
      const swapped = receipt.logs
        .map((l) => {
          try {
            return market.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "SwappedETHForUSDC");
      expect(await karakoramToken.balanceOf(alice.address)).to.equal(swapped.args.usdcOut);
    });
  });

  describe("transferability + claim follows the token, not the original bettor", function () {
    it("lets a buyer who never placed a bet claim after acquiring the winning token", async function () {
      const { market, usdc, resolver, alice, bob, carol, himadriToken } = await deployFixture();
      await market.connect(alice).placeBet(0, HIMADRI, usdcUnits(100));
      await market.connect(bob).placeBet(0, KARAKORAM, usdcUnits(300));

      // Alice sells her entire winning position to Carol, who never bet at all.
      await himadriToken.connect(alice).transfer(carol.address, usdcUnits(100));
      expect(await himadriToken.balanceOf(alice.address)).to.equal(0);
      expect(await himadriToken.balanceOf(carol.address)).to.equal(usdcUnits(100));

      await closeAndResolve(market, resolver, 0, HIMADRI);

      // Alice has 0 tokens now -- originally staked the winning side, but no longer holds the claim.
      expect(await market.previewClaim(0, alice.address)).to.equal(0);
      await expect(market.connect(alice).claim(0)).to.be.revertedWithCustomError(market, "NoWinningStake");

      // Carol, who never placed a bet, holds the position and can claim it.
      const expectedPayout = usdcUnits(360); // 400 total, 10% fee -> 360 prize pool, Carol holds the entire HIMADRI supply
      expect(await market.previewClaim(0, carol.address)).to.equal(expectedPayout);
      const before = await usdc.balanceOf(carol.address);
      await market.connect(carol).claim(0);
      expect((await usdc.balanceOf(carol.address)) - before).to.equal(expectedPayout);
    });

    it("splits a transferred position: seller and buyer each claim their own remaining share", async function () {
      const { market, usdc, resolver, alice, bob, carol } = await deployFixture();
      await market.connect(alice).placeBet(0, HIMADRI, usdcUnits(100));
      const [himadriTokenAddr] = await market.getOutcomeToken(0, HIMADRI);
      const himadriToken = await ethers.getContractAt("OutcomeToken", himadriTokenAddr);

      // Alice keeps 40, sells 60 to Carol.
      await himadriToken.connect(alice).transfer(carol.address, usdcUnits(60));

      await closeAndResolve(market, resolver, 0, HIMADRI);
      // totalPool 100 (sole bettor), fee 10, prize 90; Alice 40/100 -> 36, Carol 60/100 -> 54.
      const aliceBefore = await usdc.balanceOf(alice.address);
      const carolBefore = await usdc.balanceOf(carol.address);
      await market.connect(alice).claim(0);
      await market.connect(carol).claim(0);
      expect((await usdc.balanceOf(alice.address)) - aliceBefore).to.equal(usdcUnits(36));
      expect((await usdc.balanceOf(carol.address)) - carolBefore).to.equal(usdcUnits(54));
      void bob;
    });

    it("does not permanently lock out claiming: a fresh balance acquired after a first claim is claimable too", async function () {
      const { market, usdc, resolver, alice, bob } = await deployFixture();
      const [himadriTokenAddr] = await market.getOutcomeToken(0, HIMADRI);
      const himadriToken = await ethers.getContractAt("OutcomeToken", himadriTokenAddr);

      await market.connect(alice).placeBet(0, HIMADRI, usdcUnits(50));
      await market.connect(bob).placeBet(0, HIMADRI, usdcUnits(50));

      await closeAndResolve(market, resolver, 0, HIMADRI);

      // Alice claims her own 50.
      await market.connect(alice).claim(0);
      expect(await market.previewClaim(0, alice.address)).to.equal(0);

      // Bob then transfers his still-unclaimed 50 tokens to Alice post-resolution.
      await himadriToken.connect(bob).transfer(alice.address, usdcUnits(50));
      expect(await market.previewClaim(0, alice.address)).to.equal(usdcUnits(45)); // 50/100 * 90 prize pool

      const before = await usdc.balanceOf(alice.address);
      await expect(market.connect(alice).claim(0)).to.not.be.reverted;
      expect((await usdc.balanceOf(alice.address)) - before).to.equal(usdcUnits(45));
    });
  });

  describe("access control", function () {
    it("only the Market contract can mint or burn an OutcomeToken", async function () {
      const { alice, himadriToken } = await deployFixture();
      await expect(himadriToken.connect(alice).mint(alice.address, 1)).to.be.revertedWithCustomError(
        himadriToken,
        "NotMarket"
      );
      await expect(himadriToken.connect(alice).burn(alice.address, 1)).to.be.revertedWithCustomError(
        himadriToken,
        "NotMarket"
      );
    });
  });

  describe("secondary market: actually tradeable via Uniswap", function () {
    it("lets a holder sell their pre-resolution position for USDC through the real Router", async function () {
      const { market, usdc, router, alice, bob, himadriToken, himadriPair } = await deployFixture();
      void himadriPair;

      // Alice bets 1000, keeps 500 to LP with, leaving 500 free to later sell.
      await market.connect(alice).placeBet(0, HIMADRI, usdcUnits(1000));

      // Alice herself seeds the HIMADRI/USDC pool -- in practice any holder
      // of the position token can LP it, including the original bettor.
      await seedTokenUSDCLiquidity(router, himadriToken, usdc, alice, {
        tokenAmount: usdcUnits(500),
        usdcAmount: usdcUnits(500),
      });
      expect(await himadriToken.balanceOf(alice.address)).to.equal(usdcUnits(500));

      // Alice exits 200 of her remaining 500 HIMADRI tokens for USDC,
      // pre-resolution, without ever calling Market at all -- a pure
      // secondary-market exit.
      const routerAddress = await router.getAddress();
      await himadriToken.connect(alice).approve(routerAddress, usdcUnits(200));
      const path = [await himadriToken.getAddress(), await usdc.getAddress()];
      const aliceUsdcBefore = await usdc.balanceOf(alice.address);

      await router.connect(alice).swapExactTokensForTokens(usdcUnits(200), 0, path, alice.address, (await time.latest()) + 3600);

      expect(await himadriToken.balanceOf(alice.address)).to.equal(usdcUnits(300));
      expect(await usdc.balanceOf(alice.address)).to.be.gt(aliceUsdcBefore);
      void bob;
    });

    it("a buyer with no bet history can buy in on the secondary market and later claim", async function () {
      const { market, usdc, router, resolver, alice, carol, himadriToken } = await deployFixture();
      await market.connect(alice).placeBet(0, HIMADRI, usdcUnits(1000));
      await seedTokenUSDCLiquidity(router, himadriToken, usdc, alice, {
        tokenAmount: usdcUnits(500),
        usdcAmount: usdcUnits(500),
      });

      // Carol buys HIMADRI position tokens with USDC on the open market.
      const routerAddress = await router.getAddress();
      await usdc.mint(carol.address, usdcUnits(500));
      await usdc.connect(carol).approve(routerAddress, usdcUnits(500));
      const path = [await usdc.getAddress(), await himadriToken.getAddress()];
      await router.connect(carol).swapExactTokensForTokens(usdcUnits(500), 0, path, carol.address, (await time.latest()) + 3600);

      const carolTokens = await himadriToken.balanceOf(carol.address);
      expect(carolTokens).to.be.gt(0);

      await closeAndResolve(market, resolver, 0, HIMADRI);

      const before = await usdc.balanceOf(carol.address);
      await expect(market.connect(carol).claim(0)).to.not.be.reverted;
      expect(await usdc.balanceOf(carol.address)).to.be.gt(before);
    });
  });
});
