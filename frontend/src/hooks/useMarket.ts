import { useState, useEffect } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { MARKET_ABI, MARKET_ADDRESS, MarketStatus } from "../config/contracts";
import type { MarketSummary } from "./useMarkets";
import { getCampusMarket, getUserInvestmentForMarket } from "../config/campusMarkets";

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
 * Results screen. Combines on-chain data with campus market details,
 * student participation counts, result announcement timelines, and user investments. */
export function useMarket(marketId: number | undefined) {
  const { address } = useAccount();
  const [, setLocalVersion] = useState(0);

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ marketId?: number }>;
      if (!customEvent.detail?.marketId || customEvent.detail.marketId === marketId) {
        setLocalVersion((v) => v + 1);
      }
    };
    window.addEventListener("campus-market-update", onUpdate);
    return () => window.removeEventListener("campus-market-update", onUpdate);
  }, [marketId]);

  const enabled = marketId !== undefined;

  const { data: marketRaw, isLoading: marketLoading, refetch: refetchMarket } = useReadContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "getMarket",
    args: enabled ? [BigInt(marketId)] : undefined,
    query: { enabled },
  });

  const onChainOptions = (marketRaw as readonly unknown[] | undefined)?.[1] as string[] | undefined;
  const optionCount = onChainOptions?.length ?? 0;

  const { data: poolsAndPosition, refetch: refetchPools } = useReadContracts({
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

  // Check campus market data
  const campusMarket = marketId !== undefined ? getCampusMarket(marketId) : undefined;
  const userInv = marketId !== undefined ? getUserInvestmentForMarket(marketId) : undefined;

  let market: MarketDetail | null = null;

  if (marketRaw && poolsAndPosition && marketId !== undefined) {
    const [question, opts, closeTime, status, totalPool, winningOption, platformFee, prizePool, category] = marketRaw as [
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
    const optionPools = poolsAndPosition.slice(0, optionCount).map((r) => (r.result as bigint) ?? 0n);
    let userContributions = poolsAndPosition.slice(optionCount, optionCount * 2).map((r) => (r.result as bigint) ?? 0n);

    // If on-chain user contribution is 0 but we have local campus investment, overlay it
    if (userInv && userContributions.every((c) => c === 0n)) {
      userContributions = opts.map((_, idx) => (idx === userInv.optionIndex ? userInv.amount : 0n));
    }

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
      category,
      optionPools,
      userContributions,
      previewClaim,
      outcomeTokens,
      studentCount: campusMarket?.studentCount ?? 1,
      optionStudentCounts: campusMarket?.optionStudentCounts ?? opts.map(() => 0),
      resultAnnouncement: campusMarket?.resultAnnouncement ?? "Upon official match/election declaration",
      resultAnnouncementTime: campusMarket?.resultAnnouncementTime ?? closeTime,
      resolutionOracle: campusMarket?.resolutionOracle ?? "Chainlink CRE Verified Oracle",
      userInvested: !!userInv || userContributions.some((c) => c > 0n),
      userInvestedAmount: userInv?.amount ?? userContributions.reduce((a, b) => a + b, 0n),
      userInvestedOption: userInv?.optionIndex,
      userInvestedOptionName: userInv?.optionName,
    };
  } else if (campusMarket) {
    // Fallback or standalone campus market
    const platformFee = (campusMarket.totalPool * BigInt(campusMarket.platformFeeBps)) / 10000n;
    const prizePool = campusMarket.totalPool - platformFee;

    const userContributions = campusMarket.options.map((_, idx) =>
      userInv && userInv.optionIndex === idx ? userInv.amount : 0n
    );

    const outcomeTokens: OutcomeTokenInfo[] = campusMarket.options.map(() => ({
      token: ZERO,
      pair: ZERO,
    }));

    market = {
      id: campusMarket.id,
      question: campusMarket.question,
      options: campusMarket.options,
      closeTime: campusMarket.closeTime,
      status: campusMarket.status,
      totalPool: campusMarket.totalPool,
      winningOption: campusMarket.winningOption ?? 0n,
      platformFee,
      prizePool,
      category: campusMarket.category,
      optionPools: campusMarket.optionPools,
      userContributions,
      previewClaim: 0n,
      outcomeTokens,
      studentCount: campusMarket.studentCount,
      optionStudentCounts: campusMarket.optionStudentCounts,
      resultAnnouncement: campusMarket.resultAnnouncement,
      resultAnnouncementTime: campusMarket.resultAnnouncementTime,
      resolutionOracle: campusMarket.resolutionOracle,
      userInvested: !!userInv,
      userInvestedAmount: userInv?.amount,
      userInvestedOption: userInv?.optionIndex,
      userInvestedOptionName: userInv?.optionName,
    };
  }

  const refetch = () => {
    refetchMarket();
    refetchPools();
    setLocalVersion((v) => v + 1);
  };

  return { market, isLoading: marketLoading && !market, refetch };
}
