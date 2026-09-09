const { keccak256 } = require("ethers");

/**
 * Prints keccak256(UniswapV2Pair creation bytecode) as compiled by *this*
 * repo's Hardhat config. UniswapV2Library.pairFor() (vendored under
 * contracts/vendor/uniswap-v2-periphery/libraries/UniswapV2Library.sol)
 * hardcodes this hash to derive a pair's CREATE2 address without an
 * external call — it must match exactly, or every Router call resolves to
 * the wrong (non-contract) address. Run `npx hardhat compile` first, then:
 *   node scripts/lib/computeInitCodeHash.js
 * and paste the result into that library's `pairFor`.
 */
function main() {
  // eslint-disable-next-line global-require
  const artifact = require("../../artifacts/@uniswap/v2-core/contracts/UniswapV2Pair.sol/UniswapV2Pair.json");
  console.log(keccak256(artifact.bytecode));
}

if (require.main === module) {
  main();
}
