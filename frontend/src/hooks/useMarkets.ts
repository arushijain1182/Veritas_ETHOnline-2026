import { useReadContract, useReadContracts } from "wagmi";
import { MARKET_ABI, MARKET_ADDRESS, MarketStatus } from "../config/contracts";

export interface MarketSummary {
  id: number;
  question: string;
  options: string[];
  closeTime: bigint;
  status: MarketStatus;
  totalPool: bigint;
  winningOption: bigint;
  platformFee: bigint;
  prizePool: bigint;
  optionPools: bigint[];
}

function decodeMarket(id: number, raw: readonly unknown[] | undefined, optionPools: bigint[]): MarketSummary | null {
  if (!raw) return null;
  const [question, options, closeTime, status, totalPool, winningOption, platformFee, prizePool] = raw as [
    string,
    string[],
    bigint,
    number,
    bigint,
    bigint,
    bigint,
    bigint
  ];
  return {
    id,
    question,
    options,
    closeTime,
    status: status as MarketStatus,
    totalPool,
    winningOption,
    platformFee,
    prizePool,
    optionPools,
  };
}

/** All markets, newest first — the Market List screen. */
export function useMarkets() {
  const { data: marketCount, isLoading: countLoading } = useReadContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "marketCount",
  });

  const count = marketCount !== undefined ? Number(marketCount) : 0;
  const ids = Array.from({ length: count }, (_, i) => count - 1 - i); // newest first

  const { data, isLoading, refetch: refetchMarkets } = useReadContracts({
    contracts: ids.map((id) => ({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "getMarket",
      args: [BigInt(id)],
    })),
    query: { enabled: count > 0 },
  });

  // Both outcomes in the current two-option demo, but read per-market
  // option count so this doesn't silently break for a 3+ option market.
  const optionCounts = ids.map((_, i) => ((data?.[i]?.result as readonly unknown[] | undefined)?.[1] as string[] | undefined)?.length ?? 0);
  const poolQueries: { id: number; option: number }[] = [];
  ids.forEach((id, i) => {
    for (let option = 0; option < optionCounts[i]; option++) poolQueries.push({ id, option });
  });

  const { data: poolData, isLoading: poolsLoading, refetch: refetchPools } = useReadContracts({
    contracts: poolQueries.map(({ id, option }) => ({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "getOptionPool",
      args: [BigInt(id), BigInt(option)],
    })),
    query: { enabled: poolQueries.length > 0 },
  });

  const markets = ids
    .map((id, i) => {
      const start = poolQueries.findIndex((q) => q.id === id);
      const optionPools = start === -1 ? [] : Array.from({ length: optionCounts[i] }, (_, o) => (poolData?.[start + o]?.result as bigint) ?? 0n);
      return decodeMarket(id, data?.[i]?.result as readonly unknown[] | undefined, optionPools);
    })
    .filter((m): m is MarketSummary => m !== null);

  return {
    markets,
    isLoading: countLoading || isLoading || poolsLoading,
    refetch: () => {
      refetchMarkets();
      refetchPools();
    },
  };
}
