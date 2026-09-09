import type { Abi, Address } from "viem";
import deployment from "./deployment.json";
import marketAbi from "../abi/Market.json";
import usdcAbi from "../abi/MockUSDC.json";

// VITE_* env vars override the synced deployment manifest — useful for
// pointing at a live network without regenerating deployment.json.
export const MARKET_ADDRESS = (import.meta.env.VITE_MARKET_ADDRESS || deployment.market) as Address;
export const USDC_ADDRESS = (import.meta.env.VITE_USDC_ADDRESS || deployment.usdc) as Address;
export const UNISWAP_ROUTER_ADDRESS = (import.meta.env.VITE_UNISWAP_ROUTER_ADDRESS || deployment.uniswapRouter) as Address;

// JSON imports don't carry the literal ABI item types wagmi/viem expect
// (e.g. `type: "function"` narrows to `type: string`) — this repo's
// contracts aren't going to change shape under the frontend's feet, so a
// straight assertion is fine here.
export const MARKET_ABI = marketAbi as unknown as Abi;
export const USDC_ABI = usdcAbi as unknown as Abi;

export const USDC_DECIMALS = 6;

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

export const isDeploymentConfigured = MARKET_ADDRESS !== ZERO_ADDRESS && USDC_ADDRESS !== ZERO_ADDRESS;

export const MarketStatus = {
  OPEN: 0,
  CLOSED: 1,
  RESOLVED: 2,
} as const;
export type MarketStatus = (typeof MarketStatus)[keyof typeof MarketStatus];

export const MARKET_STATUS_LABEL: Record<MarketStatus, string> = {
  [MarketStatus.OPEN]: "OPEN",
  [MarketStatus.CLOSED]: "CLOSED",
  [MarketStatus.RESOLVED]: "RESOLVED",
};

// Curated category list offered on the Create Market form — category
// itself is a free-text string on-chain, but a fixed picker keeps the
// list page's grouping tidy rather than accumulating one-off strings.
export const CATEGORIES = ["Sports", "Cultural", "Academic", "Elections", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_ICON: Record<string, string> = {
  Sports: "\u{1F3C6}", // 🏆
  Cultural: "\u{1F3AD}", // 🎭
  Academic: "\u{1F393}", // 🎓
  Elections: "\u{1F5F3}\u{FE0F}", // 🗳️
  Other: "\u{2728}", // ✨
};
