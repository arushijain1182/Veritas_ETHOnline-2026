import { http, createConfig } from "wagmi";
import { sepolia, type Chain } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// In Demo Mode, configure Wagmi against Sepolia public transport so wallet
// connection works smoothly without probing localhost:8545 in deployed environments.
export const activeChain: Chain = sepolia;

const rpcUrl = import.meta.env.VITE_RPC_URL || undefined;

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(rpcUrl),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
