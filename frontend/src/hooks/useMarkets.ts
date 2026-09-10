import { useState, useEffect } from "react";
import { MarketStatus } from "../config/contracts";
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
  isDemo?: boolean;
}

/** Demo Markets hook for the Market List screen.
 * Synchronously reads the 8 campus prediction markets from the local campus data store.
 * Operates purely on frontend state without making wagmi/blockchain network calls,
 * ensuring immediate rendering on Vercel deployments.
 */
export function useMarkets() {
  const [, setLocalVersion] = useState(0);

  useEffect(() => {
    const onUpdate = () => setLocalVersion((v) => v + 1);
    window.addEventListener("campus-market-update", onUpdate);
    return () => window.removeEventListener("campus-market-update", onUpdate);
  }, []);

  const campusMarkets = getCampusMarkets();
  const userInvestments = getUserInvestments();

  const markets: MarketSummary[] = campusMarkets.map((cm) => {
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
      isDemo: true,
    };
  });

  return {
    markets,
    isLoading: false,
    refetch: () => {
      setLocalVersion((v) => v + 1);
    },
  };
}
