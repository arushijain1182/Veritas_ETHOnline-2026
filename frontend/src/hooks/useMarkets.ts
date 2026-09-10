import { useState, useEffect } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { MARKET_ABI, MARKET_ADDRESS, MarketStatus } from "../config/contracts";
import { getCampusMarkets, getUserInvestments } from "../config/campusMarkets";

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
  category: string;
  optionPools: bigint[];
  // Campus & UI enrichment fields
  studentCount?: number;
  optionStudentCounts?: number[];
  resultAnnouncement?: string;
  resultAnnouncementTime?: bigint;
  resolutionOracle?: string;
  userInvested?: boolean;
  userInvestedAmount?: bigint;
  userInvestedOption?: number;
  userInvestedOptionName?: string;
}

function decodeMarket(id: number, raw: readonly unknown[] | undefined, optionPools: bigint[]): MarketSummary | null {
  if (!raw) return null;
  const [question, options, closeTime, status, totalPool, winningOption, platformFee, prizePool, category] = raw as [
    string,
    string[],
    bigint,
    number,
    bigint,
    bigint,
    bigint,
    bigint,
    string
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
    category,
    optionPools,
  };
}

/** All markets, newest first — the Market List screen.
 * Seamlessly integrates verified campus markets (Women's FGC, BRCA Trophy, CAIC, Dance Secy, etc.)
 * with user investment tracking and on-chain prediction pools.
 */
export function useMarkets() {
  const [, setLocalVersion] = useState(0);

  useEffect(() => {
    const onUpdate = () => setLocalVersion((v) => v + 1);
    window.addEventListener("campus-market-update", onUpdate);
    return () => window.removeEventListener("campus-market-update", onUpdate);
  }, []);

  const { data: marketCount, isLoading: countLoading, refetch: refetchCount } = useReadContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "marketCount",
  });

  const count = marketCount !== undefined ? Number(marketCount) : 0;
  const ids = Array.from({ length: count }, (_, i) => count - 1 - i);

  const { data, refetch: refetchMarkets } = useReadContracts({
    contracts: ids.map((id) => ({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "getMarket",
      args: [BigInt(id)],
    })),
    query: { enabled: count > 0 },
  });

  const optionCounts = ids.map((_, i) => ((data?.[i]?.result as readonly unknown[] | undefined)?.[1] as string[] | undefined)?.length ?? 0);
  const poolQueries: { id: number; option: number }[] = [];
  ids.forEach((id, i) => {
    for (let option = 0; option < optionCounts[i]; option++) poolQueries.push({ id, option });
  });

  const { data: poolData, refetch: refetchPools } = useReadContracts({
    contracts: poolQueries.map(({ id, option }) => ({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "getOptionPool",
      args: [BigInt(id), BigInt(option)],
    })),
    query: { enabled: poolQueries.length > 0 },
  });

  // On-chain markets
  const onChainMarkets = ids
    .map((id, i) => {
      const start = poolQueries.findIndex((q) => q.id === id);
      const optionPools = start === -1 ? [] : Array.from({ length: optionCounts[i] }, (_, o) => (poolData?.[start + o]?.result as bigint) ?? 0n);
      return decodeMarket(id, data?.[i]?.result as readonly unknown[] | undefined, optionPools);
    })
    .filter((m): m is MarketSummary => m !== null);

  // Read campus markets and user investments from local store
  const campusMarkets = getCampusMarkets();
  const userInvestments = getUserInvestments();

  // Combine / enrich markets so the campus markets are always present and visible
  const campusMarketSummaries: MarketSummary[] = campusMarkets.map((cm) => {
    const userInv = userInvestments.find((inv) => inv.marketId === cm.id);
    const platformFee = (cm.totalPool * BigInt(cm.platformFeeBps)) / 10000n;
    const prizePool = cm.totalPool - platformFee;

    return {
      id: cm.id,
      question: cm.question,
      options: cm.options,
      closeTime: cm.closeTime,
      status: cm.status,
      totalPool: cm.totalPool,
      winningOption: cm.winningOption ?? 0n,
      platformFee,
      prizePool,
      category: cm.category,
      optionPools: cm.optionPools,
      studentCount: cm.studentCount,
      optionStudentCounts: cm.optionStudentCounts,
      resultAnnouncement: cm.resultAnnouncement,
      resultAnnouncementTime: cm.resultAnnouncementTime,
      resolutionOracle: cm.resolutionOracle,
      userInvested: !!userInv,
      userInvestedAmount: userInv?.amount,
      userInvestedOption: userInv?.optionIndex,
      userInvestedOptionName: userInv?.optionName,
    };
  });

  // If on-chain markets exist, overlay them or append them
  const marketsMap = new Map<number, MarketSummary>();
  // Start with campus markets
  for (const cm of campusMarketSummaries) {
    marketsMap.set(cm.id, cm);
  }
  // If on-chain markets are present and configured, overlay
  for (const oc of onChainMarkets) {
    const existing = marketsMap.get(oc.id);
    const userInv = userInvestments.find((inv) => inv.marketId === oc.id);
    marketsMap.set(oc.id, {
      ...oc,
      studentCount: existing?.studentCount ?? 1,
      optionStudentCounts: existing?.optionStudentCounts ?? oc.options.map(() => 0),
      resultAnnouncement: existing?.resultAnnouncement ?? `Resolves upon official declaration`,
      resultAnnouncementTime: existing?.resultAnnouncementTime ?? oc.closeTime,
      resolutionOracle: existing?.resolutionOracle ?? "Chainlink CRE Verified Oracle",
      userInvested: !!userInv,
      userInvestedAmount: userInv?.amount,
      userInvestedOption: userInv?.optionIndex,
      userInvestedOptionName: userInv?.optionName,
    });
  }

  const markets = Array.from(marketsMap.values()).sort((a, b) => a.id - b.id);

  return {
    markets,
    isLoading: countLoading && markets.length === 0,
    refetch: () => {
      refetchCount();
      refetchMarkets();
      refetchPools();
      setLocalVersion((v) => v + 1);
    },
  };
}
