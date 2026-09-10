import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { usePortfolio } from "../hooks/usePortfolio";
import { useUsdc } from "../hooks/useUsdc";
import { useTx } from "../hooks/useTx";
import { StatusBadge } from "../components/StatusBadge";
import { CATEGORY_ICON, isDeploymentConfigured, MARKET_ABI, MARKET_ADDRESS, MarketStatus } from "../config/contracts";
import { formatCloseTime, formatPercent, formatRelativeTime, formatUsdc } from "../lib/format";

type FilterTab = "all" | "active" | "claimable" | "resolved";

const OPTION_COLORS = [
  "#3182ce", // Blue
  "#e53e3e", // Red
  "#38a169", // Green
  "#805ad5", // Purple
  "#dd6b20", // Orange
  "#319795", // Teal
  "#d53f8c", // Pink
];

export function PortfolioPage() {
  const { isConnected } = useAccount();
  const { usdcBalance, refetch: refetchUsdc } = useUsdc();
  const { entries, totalInvested, totalClaimable, activeCount, resolvedCount, isLoading, refetch } = usePortfolio();

  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const claimTx = useTx();

  if (!isDeploymentConfigured) return null;

  function toggleExpand(id: number) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleClaim(marketId: number, e: React.MouseEvent) {
    e.stopPropagation();
    setClaimingId(marketId);
    await claimTx.send({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "claim",
      args: [BigInt(marketId)],
    });
    refetch();
    refetchUsdc();
  }

  // Calculate total potential payout across all active investments
  const totalPotentialReturn = entries.reduce((acc, e) => {
    let entryMaxPayout = 0n;
    e.options.forEach((_, optIdx) => {
      const stake = e.contributions[optIdx] ?? 0n;
      const optPool = e.optionPools[optIdx] ?? 0n;
      if (stake > 0n && optPool > 0n && e.totalPool > 0n) {
        const prizePool = (e.totalPool * 90n) / 100n;
        const payout = (stake * prizePool) / optPool;
        if (payout > entryMaxPayout) entryMaxPayout = payout;
      }
    });
    return acc + entryMaxPayout;
  }, 0n);

  const filteredEntries = entries.filter((e) => {
    if (activeTab === "active") return e.status !== MarketStatus.RESOLVED;
    if (activeTab === "claimable") return e.claimable > 0n;
    if (activeTab === "resolved") return e.status === MarketStatus.RESOLVED;
    return true;
  });

  return (
    <div className="portfolio-view">
      {/* Portfolio Header */}
      <div className="portfolio-header">
        <div className="portfolio-header__titles">
          <h1 className="portfolio-header__title">Student Portfolio</h1>
          <p className="portfolio-header__desc">
            Monitor your campus prediction stakes, active odds, estimated payouts, and settlement claims.
          </p>
        </div>

        {/* Status Chip */}
        <div className="portfolio-status-chip">
          <span className="status-chip__dot" />
          <span className="status-chip__text">
            {isConnected ? "Wallet Connected" : "Campus Profile Active"}
          </span>
          <span className="status-chip__balance">Balance: {formatUsdc(usdcBalance)}</span>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="portfolio-summary-grid">
        <div className="summary-card">
          <span className="summary-card__label">Total Invested</span>
          <strong className="summary-card__value">{formatUsdc(totalInvested)}</strong>
          <span className="summary-card__meta">{entries.length} campus positions</span>
        </div>

        <div className="summary-card summary-card--highlight-green">
          <span className="summary-card__label">Est. Potential Return</span>
          <strong className="summary-card__value summary-card__value--green">
            {formatUsdc(totalPotentialReturn)}
          </strong>
          <span className="summary-card__meta">If current backed hostels win</span>
        </div>

        <div className={`summary-card ${totalClaimable > 0n ? "summary-card--claimable" : ""}`}>
          <span className="summary-card__label">Unclaimed Winnings</span>
          <strong className="summary-card__value summary-card__value--claimable">
            {formatUsdc(totalClaimable)}
          </strong>
          <span className="summary-card__meta">
            {totalClaimable > 0n ? "Available to claim now" : "No pending payouts"}
          </span>
        </div>

        <div className="summary-card">
          <span className="summary-card__label">Active Predictions</span>
          <strong className="summary-card__value">{activeCount}</strong>
          <span className="summary-card__meta">{resolvedCount} settled</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="portfolio-filter-bar">
        <div className="portfolio-tabs">
          <button
            type="button"
            className={`portfolio-tab ${activeTab === "all" ? "portfolio-tab--active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            <span>All Positions</span>
            <span className="portfolio-tab__count">{entries.length}</span>
          </button>
          <button
            type="button"
            className={`portfolio-tab ${activeTab === "active" ? "portfolio-tab--active" : ""}`}
            onClick={() => setActiveTab("active")}
          >
            <span>Active</span>
            <span className="portfolio-tab__count">{activeCount}</span>
          </button>
          <button
            type="button"
            className={`portfolio-tab ${activeTab === "claimable" ? "portfolio-tab--active" : ""}`}
            onClick={() => setActiveTab("claimable")}
          >
            <span>Claimable</span>
            <span className="portfolio-tab__count">{entries.filter((e) => e.claimable > 0n).length}</span>
          </button>
          <button
            type="button"
            className={`portfolio-tab ${activeTab === "resolved" ? "portfolio-tab--active" : ""}`}
            onClick={() => setActiveTab("resolved")}
          >
            <span>Settled</span>
            <span className="portfolio-tab__count">{resolvedCount}</span>
          </button>
        </div>
      </div>

      {/* Positions List */}
      {isLoading ? (
        <div className="loading-container">
          <div className="loading-spinner" />
          <p className="loading-text">Loading portfolio positions...</p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="empty-state-card">
          <h3>No positions found</h3>
          <p>
            {activeTab === "all"
              ? "You haven't participated in any prediction markets yet."
              : `No bets found in the "${activeTab}" filter.`}
          </p>
          <Link to="/" className="btn btn--primary" style={{ marginTop: "1rem" }}>
            Explore Live Campus Markets
          </Link>
        </div>
      ) : (
        <div className="positions-list">
          {filteredEntries.map((e) => {
            const isExpanded = expandedId === e.marketId;
            const chosenOptionIndices = e.options
              .map((_, i) => i)
              .filter((i) => e.contributions[i] > 0n);

            const resultTime = e.resultAnnouncementTime ?? e.closeTime;

            return (
              <div
                key={e.marketId}
                className={`position-row-card ${isExpanded ? "position-row-card--expanded" : ""} ${
                  e.claimable > 0n ? "position-row-card--claimable" : ""
                }`}
              >
                {/* Main Card Summary */}
                <div className="position-row-main" onClick={() => toggleExpand(e.marketId)}>
                  <div className="position-row-top">
                    <div className="position-row-badges">
                      <span className="tag-pill tag-pill--category">
                        {CATEGORY_ICON[e.category] ?? "\u{1F4CC}"} {e.category}
                      </span>
                      <StatusBadge status={e.status} />
                      <span className="position-countdown">
                        Announces {formatRelativeTime(resultTime)}
                      </span>
                    </div>

                    {e.claimable > 0n ? (
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={(evt) => handleClaim(e.marketId, evt)}
                        disabled={claimTx.phase === "signing" || claimTx.phase === "confirming"}
                      >
                        {claimingId === e.marketId && (claimTx.phase === "signing" || claimTx.phase === "confirming")
                          ? "Claiming..."
                          : `Claim ${formatUsdc(e.claimable)} Winnings`}
                      </button>
                    ) : (
                      <span className="position-expand-toggle">
                        {isExpanded ? "Collapse Details ↑" : "Breakdown ↓"}
                      </span>
                    )}
                  </div>

                  <h3 className="position-row-question">{e.question}</h3>

                  {/* Position Metrics Strip */}
                  <div className="position-metrics-strip">
                    <div className="position-metric">
                      <span className="position-metric__label">Your Stake:</span>
                      <strong className="position-metric__val">
                        {formatUsdc(e.totalContribution)} on{" "}
                        <span className="position-metric__hostel">{e.chosenOptionName}</span>
                      </strong>
                    </div>

                    <div className="position-metric">
                      <span className="position-metric__label">Market Pool:</span>
                      <strong className="position-metric__val">{formatUsdc(e.totalPool)}</strong>
                    </div>

                    <div className="position-metric">
                      <span className="position-metric__label">Predictors:</span>
                      <strong className="position-metric__val">{e.studentCount ?? "—"}</strong>
                    </div>

                    <div className="position-metric position-metric--action">
                      <Link
                        to={`/market/${e.marketId}`}
                        className="position-trade-link"
                        onClick={(evt) => evt.stopPropagation()}
                      >
                        View Market &rarr;
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Expanded Drawer */}
                {isExpanded && (
                  <div className="position-drawer">
                    <div className="position-drawer__section">
                      <h4 className="position-drawer__title">Your Selection &amp; Return Breakdown</h4>
                      <div className="drawer-options-list">
                        {chosenOptionIndices.map((optIdx) => {
                          const userStake = e.contributions[optIdx];
                          const optPool = e.optionPools[optIdx] ?? 0n;
                          const ongoingPct = formatPercent(optPool, e.totalPool);
                          const userPoolShare = formatPercent(userStake, optPool);

                          let estimatedPayout = 0n;
                          let multiplierStr = "-";
                          if (optPool > 0n && e.totalPool > 0n) {
                            const prizePoolEst = (e.totalPool * 90n) / 100n;
                            estimatedPayout = (userStake * prizePoolEst) / optPool;
                            if (userStake > 0n) {
                              const mult = Number(estimatedPayout) / Number(userStake);
                              multiplierStr = `${mult.toFixed(2)}x`;
                            }
                          }

                          return (
                            <div key={optIdx} className="drawer-option-card">
                              <div className="drawer-option-card__header">
                                <span className="drawer-option-badge">Backed: {e.options[optIdx]}</span>
                                <strong className="drawer-option-stake">{formatUsdc(userStake)}</strong>
                              </div>

                              <div className="drawer-option-card__progress">
                                <div className="drawer-progress-labels">
                                  <span>Market Probability: <strong>{ongoingPct}</strong></span>
                                  <span>Pool: {formatUsdc(optPool)} ({userPoolShare} yours)</span>
                                </div>
                                <div className="composite-bar-wrapper">
                                  <div className="composite-bar">
                                    <div
                                      className="composite-bar__segment"
                                      style={{
                                        width: e.totalPool > 0n ? `${Number((optPool * 100n) / e.totalPool)}%` : "0%",
                                        backgroundColor: OPTION_COLORS[optIdx % OPTION_COLORS.length],
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>

                              {e.status !== MarketStatus.RESOLVED && (
                                <div className="drawer-payout-row">
                                  <span>Potential Return if {e.options[optIdx]} wins:</span>
                                  <strong className="drawer-payout-val">
                                    {formatUsdc(estimatedPayout)} <span className="mult-text">({multiplierStr})</span>
                                  </strong>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Announcement & Oracle Context */}
                    <div className="position-drawer__section">
                      <h4 className="position-drawer__title">Announcement &amp; Oracle Verification</h4>
                      <div className="drawer-info-grid">
                        <div className="drawer-info-item">
                          <span className="drawer-info-label">Scheduled Date:</span>
                          <span className="drawer-info-val">{formatCloseTime(resultTime)}</span>
                        </div>
                        <div className="drawer-info-item">
                          <span className="drawer-info-label">Event Context:</span>
                          <span className="drawer-info-val">
                            {e.resultAnnouncement ?? "Official declaration upon event completion"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Resolution Settlement */}
                    {e.status === MarketStatus.RESOLVED && (
                      <div className="position-drawer__section">
                        <h4 className="position-drawer__title">Settlement Status</h4>
                        <div className="drawer-settlement-card">
                          <p>
                            Official Winner: <strong>{e.options[Number(e.winningOption)]}</strong>
                          </p>
                          {e.claimable > 0n ? (
                            <div className="settlement-claim-box">
                              <span>Congratulations! Unclaimed payout of <strong>{formatUsdc(e.claimable)}</strong>.</span>
                              <button
                                type="button"
                                className="btn btn--primary"
                                disabled={claimTx.phase === "signing" || claimTx.phase === "confirming"}
                                onClick={(evt) => handleClaim(e.marketId, evt)}
                              >
                                Claim Winnings
                              </button>
                            </div>
                          ) : (
                            <p className="settlement-note">
                              {chosenOptionIndices.includes(Number(e.winningOption))
                                ? "Winnings have been claimed for this position."
                                : "You did not back the winning option for this market."}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
