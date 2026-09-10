import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { MarketStatus } from "../config/contracts";
import { getUserInvestments, getCampusMarkets } from "../config/campusMarkets";

export interface PortfolioEntry {
  marketId: number;
  question: string;
  category: string;
  status: MarketStatus;
  options: string[];
  closeTime: bigint;
  totalPool: bigint;
  optionPools: bigint[];
  prizePool: bigint;
  platformFee: bigint;
  winningOption: bigint;
  contributions: bigint[];
  totalContribution: bigint;
  claimable: bigint;
  studentCount?: number;
  resultAnnouncement?: string;
  resultAnnouncementTime?: bigint;
  chosenOptionName?: string;
}

/** The connected/demo user's positions across every campus prediction market.
 * Resolves synchronously from local campus market data and demo investments.
 */
export function usePortfolio() {
  const { isConnected } = useAccount();
  const [, setLocalVersion] = useState(0);

  useEffect(() => {
    const onUpdate = () => setLocalVersion((v) => v + 1);
    window.addEventListener("campus-market-update", onUpdate);
    return () => window.removeEventListener("campus-market-update", onUpdate);
  }, []);

  const userInvestments = getUserInvestments();
  const campusMarkets = getCampusMarkets();

  const entries: PortfolioEntry[] = campusMarkets
    .map((cm) => {
      const userInv = userInvestments.find((inv) => inv.marketId === cm.id);
      const contributions = cm.options.map((_, optIdx) =>
        userInv && userInv.optionIndex === optIdx ? userInv.amount : 0n
      );
      const totalContribution = contributions.reduce((a, b) => a + b, 0n);
      const platformFee = (cm.totalPool * BigInt(cm.platformFeeBps)) / 10000n;
      const prizePool = cm.totalPool - platformFee;

      return {
        marketId: cm.id,
        question: cm.question,
        category: cm.category,
        status: cm.status,
        options: cm.options,
        closeTime: cm.closeTime,
        totalPool: cm.totalPool,
        optionPools: cm.optionPools,
        prizePool,
        platformFee,
        winningOption: cm.winningOption ?? 0n,
        contributions,
        totalContribution,
        claimable: 0n,
        studentCount: cm.studentCount,
        resultAnnouncement: cm.resultAnnouncement,
        resultAnnouncementTime: cm.resultAnnouncementTime,
        chosenOptionName: userInv?.optionName,
      };
    })
    .filter((e) => e.totalContribution > 0n);

  const totalInvested = entries.reduce((sum, e) => sum + e.totalContribution, 0n);
  const totalClaimable = entries.reduce((sum, e) => sum + e.claimable, 0n);
  const activeCount = entries.filter((e) => e.status !== MarketStatus.RESOLVED).length;
  const resolvedCount = entries.filter((e) => e.status === MarketStatus.RESOLVED).length;

  return {
    entries,
    totalInvested,
    totalClaimable,
    activeCount,
    resolvedCount,
    isLoading: false,
    isConnected,
    refetch: () => setLocalVersion((v) => v + 1),
  };
}
