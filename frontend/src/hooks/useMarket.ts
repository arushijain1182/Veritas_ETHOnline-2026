import { useState, useEffect } from "react";
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

/** A single demo market plus the user's position for the Market Page / Results screen.
 * Resolves synchronously from local campus market data without blockchain network calls.
 */
export function useMarket(marketId: number | undefined) {
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

  if (marketId === undefined) {
    return { market: null, isLoading: false, refetch: () => {} };
  }

  const campusMarket = getCampusMarket(marketId);
  const userInv = getUserInvestmentForMarket(marketId);

  if (!campusMarket) {
    return { market: null, isLoading: false, refetch: () => {} };
  }

  const platformFee = (campusMarket.totalPool * BigInt(campusMarket.platformFeeBps)) / 10000n;
  const prizePool = campusMarket.totalPool - platformFee;

  const userContributions = campusMarket.options.map((_, idx) =>
    userInv && userInv.optionIndex === idx ? userInv.amount : 0n
  );

  const outcomeTokens: OutcomeTokenInfo[] = campusMarket.options.map(() => ({
    token: ZERO,
    pair: ZERO,
  }));

  const market: MarketDetail = {
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
    isDemo: true,
  };

  return {
    market,
    isLoading: false,
    refetch: () => setLocalVersion((v) => v + 1),
  };
}
