import { useAccount, useReadContracts } from "wagmi";
import { MARKET_ABI, MARKET_ADDRESS, MarketStatus } from "../config/contracts";
import { useMarkets } from "./useMarkets";

export interface PortfolioEntry {
  marketId: number;
  question: string;
  category: string;
  status: MarketStatus;
  options: string[];
  closeTime: bigint;
  totalPool: bigint; // Total money college has invested in this market till now
  optionPools: bigint[]; // Money invested in each option across the college
  prizePool: bigint;
  platformFee: bigint;
  winningOption: bigint;
  contributions: bigint[]; // per option, this user's original stake
  totalContribution: bigint;
  claimable: bigint; // previewClaim — 0 if not resolved, not a winner, or already claimed
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** The connected user's positions across every market — "check your
 * balance / winnings" in one place, rather than having to open each
 * market individually. */
export function usePortfolio() {
  const { address } = useAccount();
  const { markets, isLoading: marketsLoading, refetch: refetchMarkets } = useMarkets();

  const marketsWithBets = markets; // filtered client-side below once contributions are known

  const {
    data,
    isLoading: positionsLoading,
    refetch: refetchPositions,
  } = useReadContracts({
    contracts: [
      ...marketsWithBets.flatMap((m) =>
        m.options.map((_, option) => ({
          address: MARKET_ADDRESS,
          abi: MARKET_ABI,
          functionName: "userContribution",
          args: [address ?? ZERO, BigInt(m.id), BigInt(option)],
        }))
      ),
      ...marketsWithBets.map((m) => ({
        address: MARKET_ADDRESS,
        abi: MARKET_ABI,
        functionName: "previewClaim",
        args: [BigInt(m.id), address ?? ZERO],
      })),
    ],
    query: { enabled: !!address && marketsWithBets.length > 0 },
  });

  let entries: PortfolioEntry[] = [];
  if (data && address) {
    let cursor = 0;
    const perMarketContributions = marketsWithBets.map((m) => {
      const contributions = m.options.map(() => (data[cursor++]?.result as bigint) ?? 0n);
      return contributions;
    });
    const claimables = marketsWithBets.map((_, i) => (data[cursor + i]?.result as bigint) ?? 0n);

    entries = marketsWithBets
      .map((m, i) => {
        const contributions = perMarketContributions[i];
        const totalContribution = contributions.reduce((a, b) => a + b, 0n);
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
          claimable: claimables[i],
        };
      })
      .filter((e) => e.totalContribution > 0n || e.claimable > 0n);
  }

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
    isLoading: marketsLoading || positionsLoading,
    refetch: () => {
      refetchMarkets();
      refetchPositions();
    },
  };
}
