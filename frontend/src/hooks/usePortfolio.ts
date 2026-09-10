import { useState, useEffect } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { MARKET_ABI, MARKET_ADDRESS, MarketStatus } from "../config/contracts";
import { useMarkets } from "./useMarkets";
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

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** The connected user's positions across every market — "check your
 * balance / winnings" in one place, combining verified campus investments
 * with any on-chain wallet positions. */
export function usePortfolio() {
  const { address, isConnected } = useAccount();
  const { markets, isLoading: marketsLoading, refetch: refetchMarkets } = useMarkets();
  const [, setLocalVersion] = useState(0);

  useEffect(() => {
    const onUpdate = () => setLocalVersion((v) => v + 1);
    window.addEventListener("campus-market-update", onUpdate);
    return () => window.removeEventListener("campus-market-update", onUpdate);
  }, []);

  const {
    data: onChainData,
    isLoading: positionsLoading,
    refetch: refetchPositions,
  } = useReadContracts({
    contracts: [
      ...markets.flatMap((m) =>
        m.options.map((_, option) => ({
          address: MARKET_ADDRESS,
          abi: MARKET_ABI,
          functionName: "userContribution",
          args: [address ?? ZERO, BigInt(m.id), BigInt(option)],
        }))
      ),
      ...markets.map((m) => ({
        address: MARKET_ADDRESS,
        abi: MARKET_ABI,
        functionName: "previewClaim",
        args: [BigInt(m.id), address ?? ZERO],
      })),
    ],
    query: { enabled: !!address && markets.length > 0 },
  });

  const userInvestments = getUserInvestments();
  const campusMarkets = getCampusMarkets();

  let cursor = 0;
  const onChainPerMarketContributions = markets.map((m) => {
    return m.options.map(() => (onChainData?.[cursor++]?.result as bigint) ?? 0n);
  });
  const onChainClaimables = markets.map((_, i) => (onChainData?.[cursor + i]?.result as bigint) ?? 0n);

  const entries: PortfolioEntry[] = markets
    .map((m, i) => {
      const onChainContribs = onChainPerMarketContributions[i] ?? m.options.map(() => 0n);
      const userInv = userInvestments.find((inv) => inv.marketId === m.id);

      // Merge on-chain stake with campus investment if on-chain is 0
      const contributions = m.options.map((_, optIdx) => {
        const onChainAmount = onChainContribs[optIdx] ?? 0n;
        if (onChainAmount > 0n) return onChainAmount;
        if (userInv && userInv.optionIndex === optIdx) return userInv.amount;
        return 0n;
      });

      const totalContribution = contributions.reduce((a, b) => a + b, 0n);
      const claimable = onChainClaimables[i] ?? 0n;

      const chosenOptionIndex = contributions.findIndex((c) => c > 0n);
      const chosenOptionName = chosenOptionIndex !== -1 ? m.options[chosenOptionIndex] : undefined;

      const campusM = campusMarkets.find((cm) => cm.id === m.id);

      return {
        marketId: m.id,
        question: m.question,
        category: m.category,
        status: m.status,
        options: m.options,
        closeTime: m.closeTime,
        totalPool: m.totalPool,
        optionPools: m.optionPools,
        prizePool: m.prizePool,
        platformFee: m.platformFee,
        winningOption: m.winningOption,
        contributions,
        totalContribution,
        claimable,
        studentCount: m.studentCount ?? campusM?.studentCount,
        resultAnnouncement: m.resultAnnouncement ?? campusM?.resultAnnouncement,
        resultAnnouncementTime: m.resultAnnouncementTime ?? campusM?.resultAnnouncementTime,
        chosenOptionName,
      };
    })
    .filter((e) => e.totalContribution > 0n || e.claimable > 0n);

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
    isLoading: marketsLoading || (!!address && positionsLoading),
    isConnected,
    refetch: () => {
      refetchMarkets();
      refetchPositions();
      setLocalVersion((v) => v + 1);
    },
  };
}
