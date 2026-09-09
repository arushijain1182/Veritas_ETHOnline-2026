const { ethers } = require("hardhat");

/**
 * Deploys the real, vendored Uniswap V2 stack (Factory + canonical WETH9 +
 * Router02 — see contracts/vendor/) for local/test/demo use. On a live
 * network you would instead point Market.sol's constructor at the already-
 * deployed official Router address and skip this entirely.
 */
async function deployUniswapV2(deployer) {
  const Factory = await ethers.getContractFactory("UniswapV2Factory");
  const factory = await Factory.deploy(deployer.address);
  await factory.waitForDeployment();

  const WETH9 = await ethers.getContractFactory("WETH9");
  const weth = await WETH9.deploy();
  await weth.waitForDeployment();

  const Router = await ethers.getContractFactory("UniswapV2Router02");
  const router = await Router.deploy(await factory.getAddress(), await weth.getAddress());
  await router.waitForDeployment();

  return { factory, weth, router };
}

/**
 * Seeds a WETH/USDC pool so swapExactETHForTokens (Market.sol's Uniswap
 * betting path) has liquidity to swap against.
 */
async function seedETHUSDCLiquidity(router, usdc, provider, { ethAmount, usdcAmount }) {
  await (await usdc.mint(provider.address, usdcAmount)).wait();
  await (await usdc.connect(provider).approve(await router.getAddress(), usdcAmount)).wait();

  const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
  await (
    await router
      .connect(provider)
      .addLiquidityETH(await usdc.getAddress(), usdcAmount, 0, 0, provider.address, deadline, {
        value: ethAmount,
      })
  ).wait();
}

/**
 * Seeds an arbitrary ERC20/USDC pool (e.g. an OutcomeToken/USDC pair) so it
 * can actually be traded via the Router — used for the Stage 6 stretch
 * goal's secondary market. `token` must already be held by `provider` (for
 * OutcomeToken that means `provider` staked/won a bet, since mint is
 * Market-only) or otherwise obtainable; USDC is minted directly since it's
 * a MockUSDC faucet.
 */
async function seedTokenUSDCLiquidity(router, token, usdc, provider, { tokenAmount, usdcAmount }) {
  await (await usdc.mint(provider.address, usdcAmount)).wait();
  const routerAddress = await router.getAddress();
  await (await token.connect(provider).approve(routerAddress, tokenAmount)).wait();
  await (await usdc.connect(provider).approve(routerAddress, usdcAmount)).wait();

  const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
  await (
    await router
      .connect(provider)
      .addLiquidity(
        await token.getAddress(),
        await usdc.getAddress(),
        tokenAmount,
        usdcAmount,
        0,
        0,
        provider.address,
        deadline
      )
  ).wait();
}

module.exports = { deployUniswapV2, seedETHUSDCLiquidity, seedTokenUSDCLiquidity };
