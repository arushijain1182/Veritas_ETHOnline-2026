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

export function formatRelativeTime(closeTime: bigint): string {
  const diffMs = Number(closeTime) * 1000 - Date.now();
  const absDiff = Math.abs(diffMs);
  const diffMinutes = Math.floor(absDiff / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMs > 0) {
    if (diffMinutes < 60) return `Closes in ${diffMinutes}m`;
    if (diffHours < 24) return `Closes in ${diffHours}h ${diffMinutes % 60}m`;
    return `Closes in ${diffDays}d ${diffHours % 24}h`;
  } else {
    if (diffMinutes < 60) return `Closed ${diffMinutes}m ago`;
    if (diffHours < 24) return `Closed ${diffHours}h ago`;
    return `Closed ${diffDays}d ago`;
  }
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
