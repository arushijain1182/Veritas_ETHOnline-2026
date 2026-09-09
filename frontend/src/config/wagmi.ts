import { http, createConfig } from "wagmi";
import { hardhat, sepolia, mainnet, type Chain } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import deployment from "./deployment.json";

const CHAINS_BY_ID: Record<number, Chain> = {
  [hardhat.id]: hardhat,
  [sepolia.id]: sepolia,
  [mainnet.id]: mainnet,
};

// The chain the currently-synced deployment targets (see
// scripts/deployMarket.js + frontend/scripts/syncDeployment.mjs). Falls
// back to the local Hardhat network, which is what `npm run dev` targets
// out of the box. wagmi's `createConfig` wants each configured chain's id
// as a literal type for its `transports` map; since the active chain is
// only known at runtime (from deployment.json), that's asserted below
// rather than statically provable — the actual chain id used at runtime is
// always correct.
export const activeChain: Chain = CHAINS_BY_ID[deployment.chainId] ?? hardhat;

const rpcUrl = import.meta.env.VITE_RPC_URL || (activeChain.id === hardhat.id ? "http://127.0.0.1:8545" : undefined);

export const wagmiConfig = createConfig({
  chains: [activeChain] as unknown as readonly [Chain, ...Chain[]],
  connectors: [injected()],
  transports: {
    [activeChain.id]: http(rpcUrl),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
