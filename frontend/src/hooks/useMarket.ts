import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { MARKET_ABI, MARKET_ADDRESS, MarketStatus } from "../config/contracts";
import type { MarketSummary } from "./useMarkets";

export interface OutcomeTokenInfo {
  token: `0x${string}`;
  pair: `0x${string}`;
}

export interface MarketDetail extends MarketSummary {
  optionPools: bigint[];
  userContributions: bigint[];
  previewClaim: bigint;
  outcomeTokens: OutcomeTokenInfo[];
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** A single market plus the connected user's position — the Market Page /
 * Results screen. Polled by the QueryClient's default refetchInterval so
 * the pool and status update live as other users bet/close/resolve. */
export function useMarket(marketId: number | undefined) {
  const { address } = useAccount();
  const enabled = marketId !== undefined;

  const { data: marketRaw, isLoading: marketLoading, refetch: refetchMarket } = useReadContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "getMarket",
    args: enabled ? [BigInt(marketId)] : undefined,
    query: { enabled },
  });

  const options = (marketRaw as readonly unknown[] | undefined)?.[1] as string[] | undefined;
  const optionCount = options?.length ?? 0;

  const { data: poolsAndPosition, isLoading: poolsLoading, refetch: refetchPools } = useReadContracts({
    contracts: [
      ...Array.from({ length: optionCount }, (_, option) => ({
        address: MARKET_ADDRESS,
        abi: MARKET_ABI,
        functionName: "getOptionPool",
        args: [BigInt(marketId ?? 0), BigInt(option)],
      })),
      ...Array.from({ length: optionCount }, (_, option) => ({
        address: MARKET_ADDRESS,
        abi: MARKET_ABI,
        functionName: "userContribution",
        args: [address ?? ZERO, BigInt(marketId ?? 0), BigInt(option)],
      })),
      ...Array.from({ length: optionCount }, (_, option) => ({
        address: MARKET_ADDRESS,
        abi: MARKET_ABI,
        functionName: "getOutcomeToken",
        args: [BigInt(marketId ?? 0), BigInt(option)],
      })),
      {
        address: MARKET_ADDRESS,
        abi: MARKET_ABI,
        functionName: "previewClaim",
        args: [BigInt(marketId ?? 0), address ?? ZERO],
      },
    ],
    query: { enabled: enabled && optionCount > 0 },
  });

  let market: MarketDetail | null = null;
  if (marketRaw && poolsAndPosition && marketId !== undefined) {
    const [question, opts, closeTime, status, totalPool, winningOption, platformFee, prizePool] = marketRaw as [
      string,
      string[],
      bigint,
      number,
      bigint,
      bigint,
      bigint,
      bigint
    ];
    const optionPools = poolsAndPosition.slice(0, optionCount).map((r) => (r.result as bigint) ?? 0n);
    const userContributions = poolsAndPosition.slice(optionCount, optionCount * 2).map((r) => (r.result as bigint) ?? 0n);
    const outcomeTokens = poolsAndPosition.slice(optionCount * 2, optionCount * 3).map((r) => {
      const result = r.result as [string, string] | undefined;
      return { token: (result?.[0] ?? ZERO) as `0x${string}`, pair: (result?.[1] ?? ZERO) as `0x${string}` };
    });
    const previewClaim = (poolsAndPosition[optionCount * 3]?.result as bigint) ?? 0n;

    market = {
      id: marketId,
      question,
      options: opts,
      closeTime,
      status: status as MarketStatus,
      totalPool,
      winningOption,
      platformFee,
      prizePool,
      optionPools,
      userContributions,
      previewClaim,
      outcomeTokens,
    };
  }

  const refetch = () => {
    refetchMarket();
    refetchPools();
  };

  return { market, isLoading: marketLoading || poolsLoading, refetch };
}
