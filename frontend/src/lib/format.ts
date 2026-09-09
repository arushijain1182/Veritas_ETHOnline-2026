import { formatUnits, parseUnits } from "viem";
import { USDC_DECIMALS } from "../config/contracts";

export function formatUsdc(amount: bigint | undefined, opts: { withSuffix?: boolean } = {}): string {
  if (amount === undefined) return "-";
  const value = Number(formatUnits(amount, USDC_DECIMALS));
  const formatted = value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  return opts.withSuffix === false ? formatted : `${formatted} USDC`;
}

export function parseUsdc(amount: string): bigint {
  return parseUnits(amount || "0", USDC_DECIMALS);
}

export function formatPercent(part: bigint, whole: bigint): string {
  if (whole === 0n) return "0%";
  // scale to basis points first to keep this integer-only
  const bps = (part * 10000n) / whole;
  return `${(Number(bps) / 100).toFixed(1)}%`;
}

export function formatCloseTime(closeTime: bigint): string {
  return new Date(Number(closeTime) * 1000).toLocaleString();
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
