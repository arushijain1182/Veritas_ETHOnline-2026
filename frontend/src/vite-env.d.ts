/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string;
  readonly VITE_MARKET_ADDRESS?: string;
  readonly VITE_USDC_ADDRESS?: string;
  readonly VITE_UNISWAP_ROUTER_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
