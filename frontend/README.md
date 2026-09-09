# IITD Markets — Frontend

Agent 2's UI for the Market contract: market list, market page (bet with
USDC or swap ETH -> USDC via Uniswap), and the results/claim screen. React
+ TypeScript + Vite, wagmi/viem for wallet + contract calls.

## Local development

From the repo root, in one terminal:

```bash
npx hardhat node
```

In another, from the repo root:

```bash
npx hardhat run scripts/deployMarket.js --network localhost
```

This deploys `MockUSDC`, a local Uniswap V2 stack (seeded with a WETH/USDC
pool), and `Market`, then writes `deployments/localhost.json`.

Then, in `frontend/`:

```bash
npm install
npm run sync-deployment -- localhost   # copies deployments/localhost.json -> src/config/deployment.json
npm run sync-abi                        # only needed if Market.sol/MockUSDC.sol changed
npm run dev
```

Open the printed URL, connect a wallet pointed at `http://127.0.0.1:8545`
(chain id `31337`) — e.g. MetaMask with a Hardhat test account imported —
and you're on the same chain the app reads from. `Market.createMarket` is
`onlyOwner`; connect with the deployer account (Hardhat's default account
`#0`) to see the "+ New Market" link.

The repo ships with `src/config/deployment.json` and `src/abi/*.json`
already populated (from a fresh local deploy — addresses are deterministic
for a fresh `hardhat node` + the deploy command above), so `npm install &&
npm run dev` works immediately without redeploying, as long as you also
have a local node running with the same state.

## Pointing at a live network

Deploy against the real network first (see the repo root README), then:

```bash
VITE_MARKET_ADDRESS=0x... VITE_USDC_ADDRESS=0x... VITE_UNISWAP_ROUTER_ADDRESS=0x... \
VITE_RPC_URL=https://... \
npm run dev   # or `npm run build`
```

These env vars override `src/config/deployment.json` — no need to run
`sync-deployment` for a live network.

## Scripts

- `npm run dev` / `npm run build` / `npm run preview`
- `npm run sync-abi` — regenerate `src/abi/*.json` from the Hardhat build
  artifacts (`../artifacts/contracts/...`) after `npx hardhat compile`.
- `npm run sync-deployment -- <network>` — copy
  `../deployments/<network>.json` (written by `scripts/deployMarket.js`)
  into `src/config/deployment.json`.
- `npm run sync` — both of the above (defaults to the `hardhat` network
  manifest; pass a network explicitly for anything else, e.g.
  `node scripts/syncDeployment.mjs localhost`).
