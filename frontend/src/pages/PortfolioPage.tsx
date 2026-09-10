import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { usePortfolio } from "../hooks/usePortfolio";
import { useUsdc } from "../hooks/useUsdc";
import { useTx } from "../hooks/useTx";
import { StatusBadge } from "../components/StatusBadge";
import { TxStatus } from "../components/TxStatus";
import { ConnectWallet } from "../components/ConnectWallet";
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

  const filteredEntries = entries.filter((e) => {
    if (activeTab === "active") return e.status !== MarketStatus.RESOLVED;
    if (activeTab === "claimable") return e.claimable > 0n;
    if (activeTab === "resolved") return e.status === MarketStatus.RESOLVED;
    return true;
  });

  return (
    <div className="portfolio">
      <div className="portfolio__header">
        <h1>User Portfolio &amp; Activity</h1>
        <p className="portfolio__subtitle">
          Track your campus prediction investments, active odds, result announcement dates, and claim winnings in real time.
        </p>
      </div>

      {/* Connection state banner */}
      {!isConnected ? (
        <div className="portfolio__mode-banner">
          <div className="mode-banner__left">
            <span className="mode-banner__icon">🎓</span>
            <div>
              <strong>Campus Student Profile Active</strong>
              <p>Displaying your campus prediction market investments and tracking results.</p>
            </div>
          </div>
          <ConnectWallet />
        </div>
      ) : (
        <div className="portfolio__mode-banner portfolio__mode-banner--connected">
          <div className="mode-banner__left">
            <span className="mode-banner__icon">🟢</span>
            <div>
              <strong>Web3 Wallet Connected</strong>
              <p>On-chain positions and smart contract settlements are synchronized.</p>
            </div>
          </div>
          <span className="mode-banner__balance">Balance: {formatUsdc(usdcBalance)}</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TOP-LEVEL METRICS SUMMARY GRID */}
      {/* ------------------------------------------------------------- */}
      <div className="portfolio__stats-grid">
        <div className="portfolio__stat-card">
          <span className="portfolio__stat-label">Total Money Invested</span>
          <span className="portfolio__stat-value">{formatUsdc(totalInvested)}</span>
          <span className="portfolio__stat-meta">{entries.length} campus markets backed</span>
        </div>

        <div className="portfolio__stat-card portfolio__stat-card--highlight">
          <span className="portfolio__stat-label">Unclaimed Winnings</span>
          <span className="portfolio__stat-value portfolio__stat-value--claimable">{formatUsdc(totalClaimable)}</span>
          <span className="portfolio__stat-meta">
            {totalClaimable > 0n ? "Ready to claim below" : "No pending payouts"}
          </span>
        </div>

        <div className="portfolio__stat-card">
          <span className="portfolio__stat-label">Active Predictions</span>
          <span className="portfolio__stat-value">{activeCount}</span>
          <span className="portfolio__stat-meta">{resolvedCount} settled</span>
        </div>

        <div className="portfolio__stat-card">
          <span className="portfolio__stat-label">USDC Wallet Balance</span>
          <span className="portfolio__stat-value">{formatUsdc(usdcBalance)}</span>
          <span className="portfolio__stat-meta">Liquid capital</span>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* FILTER TABS */}
      {/* ------------------------------------------------------------- */}
      <div className="portfolio__filter-bar">
        <div className="portfolio__filter-tabs">
          <button
            className={`filter-tab ${activeTab === "all" ? "filter-tab--active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All Bets ({entries.length})
          </button>
          <button
            className={`filter-tab ${activeTab === "active" ? "filter-tab--active" : ""}`}
            onClick={() => setActiveTab("active")}
          >
            Active ({activeCount})
          </button>
          <button
            className={`filter-tab ${activeTab === "claimable" ? "filter-tab--active" : ""}`}
            onClick={() => setActiveTab("claimable")}
          >
            Claimable ({entries.filter((e) => e.claimable > 0n).length})
          </button>
          <button
            className={`filter-tab ${activeTab === "resolved" ? "filter-tab--active" : ""}`}
            onClick={() => setActiveTab("resolved")}
          >
            Resolved ({resolvedCount})
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* PARTICIPATED BETS LIST */}
      {/* ------------------------------------------------------------- */}
      {isLoading ? (
        <p className="empty-state">Loading your portfolio positions...</p>
      ) : filteredEntries.length === 0 ? (
        <div className="portfolio__empty">
          <p className="empty-state">
            {activeTab === "all"
              ? "You haven't participated in any prediction markets yet."
              : `No bets found in the "${activeTab}" category.`}
          </p>
          <Link to="/" className="btn btn--primary">
            Explore Live Campus Markets
          </Link>
        </div>
      ) : (
        <div className="portfolio__bets-list">
          {filteredEntries.map((e) => {
            const isExpanded = expandedId === e.marketId;
            const chosenOptionIndices = e.options
              .map((_, i) => i)
              .filter((i) => e.contributions[i] > 0n);

            const resultTime = e.resultAnnouncementTime ?? e.closeTime;

            return (
              <div
                key={e.marketId}
                className={`portfolio-card ${isExpanded ? "portfolio-card--expanded" : ""}`}
                onClick={() => toggleExpand(e.marketId)}
              >
                {/* CARD HEADER */}
                <div className="portfolio-card__top">
                  <div className="portfolio-card__badges">
                    <span className="category-badge">
                      {CATEGORY_ICON[e.category] ?? "\u{1F4CC}"} {e.category}
                    </span>
                    <StatusBadge status={e.status} />
                  </div>
                  <span className="portfolio-card__toggle-hint">
                    {isExpanded ? "Click to collapse &uarr;" : "Click for % distribution & details &darr;"}
                  </span>
                </div>

                <h3 className="portfolio-card__question">{e.question}</h3>

                {/* QUICK SUMMARY ROW */}
                <div className="portfolio-card__quick-summary">
                  <div className="portfolio-card__quick-stat">
                    <span className="quick-stat-label">Your Stake:</span>
                    <span className="quick-stat-val">
                      <strong>{formatUsdc(e.totalContribution)}</strong> on{" "}
                      <strong>{e.chosenOptionName ?? "Selected Option"}</strong>
                    </span>
                  </div>
                  <div className="portfolio-card__quick-stat">
                    <span className="quick-stat-label">Total Market Money:</span>
                    <span className="quick-stat-val">{formatUsdc(e.totalPool)}</span>
                  </div>
                  <div className="portfolio-card__quick-stat">
                    <span className="quick-stat-label">Students Invested:</span>
                    <span className="quick-stat-val">👥 {e.studentCount ?? "—"}</span>
                  </div>
                  <div className="portfolio-card__quick-stat">
                    <span className="quick-stat-label">Result Announcement:</span>
                    <span className="quick-stat-val" title={e.resultAnnouncement}>
                      📅 {formatRelativeTime(resultTime)}
                    </span>
                  </div>
                </div>

                {/* EXPANDABLE DETAILS DRAWER */}
                {isExpanded && (
                  <div className="portfolio-card__drawer" onClick={(evt) => evt.stopPropagation()}>
                    <div className="drawer-section">
                      <h4 className="drawer-title">1. Your Selected Prediction &amp; Money Invested</h4>
                      <div className="drawer-options">
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
                            <div key={optIdx} className="chosen-option-card">
                              <div className="chosen-option-card__header">
                                <span className="chosen-pill">Your Pick: {e.options[optIdx]}</span>
                                <span className="chosen-stake">Invested: {formatUsdc(userStake)}</span>
                              </div>

                              <div className="chosen-option-card__progress">
                                <div className="chosen-progress-meta">
                                  <span>Market % Distribution: <strong>{ongoingPct}</strong></span>
                                  <span>Option Pool: {formatUsdc(optPool)} ({userPoolShare} yours)</span>
                                </div>
                                <div className="market-page__pool-bar">
                                  <div
                                    className="market-page__pool-bar-fill"
                                    style={{
                                      width: e.totalPool > 0n ? `${Number((optPool * 100n) / e.totalPool)}%` : "0%",
                                      backgroundColor: OPTION_COLORS[optIdx % OPTION_COLORS.length],
                                    }}
                                  />
                                </div>
                              </div>

                              {e.status !== MarketStatus.RESOLVED && (
                                <div className="chosen-potential-payout">
                                  <span>Estimated Return if {e.options[optIdx]} wins:</span>
                                  <span className="potential-val">
                                    {formatUsdc(estimatedPayout)} ({multiplierStr})
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* MARKET & COLLEGE-WIDE TOTAL METRICS */}
                    <div className="drawer-section">
                      <h4 className="drawer-title">2. Market Statistics &amp; Result Announcement</h4>
                      <dl className="drawer-stats-grid">
                        <div className="drawer-stat-item">
                          <dt>Total Money on Market</dt>
                          <dd>
                            <strong>{formatUsdc(e.totalPool)}</strong> across campus
                          </dd>
                        </div>
                        <div className="drawer-stat-item">
                          <dt>Students Invested</dt>
                          <dd>
                            <strong>👥 {e.studentCount ?? "—"} students</strong>
                          </dd>
                        </div>
                        <div className="drawer-stat-item">
                          <dt>Result Announcement Date</dt>
                          <dd>
                            {formatCloseTime(resultTime)} ({formatRelativeTime(resultTime)})
                          </dd>
                        </div>
                        <div className="drawer-stat-item">
                          <dt>Announcement Context</dt>
                          <dd>{e.resultAnnouncement ?? "Official declaration upon event completion"}</dd>
                        </div>
                      </dl>
                    </div>

                    {/* RESOLUTION STATUS & CLAIM */}
                    {e.status === MarketStatus.RESOLVED && (
                      <div className="drawer-section drawer-section--settlement">
                        <h4 className="drawer-title">3. Settlement &amp; Payout</h4>
                        <div className="settlement-box">
                          <p>
                            Official Winner: <strong>{e.options[Number(e.winningOption)]}</strong>
                          </p>
                          {e.claimable > 0n ? (
                            <div className="settlement-claim-action">
                              <span className="settlement-win-msg">
                                Congratulations! You have an unclaimed payout of{" "}
                                <strong>{formatUsdc(e.claimable)}</strong>.
                              </span>
                              <button
                                className="btn btn--primary portfolio-claim-btn"
                                disabled={claimTx.phase === "signing" || claimTx.phase === "confirming"}
                                onClick={(evt) => handleClaim(e.marketId, evt)}
                              >
                                {claimTx.phase === "signing" && claimingId === e.marketId
                                  ? "Signing Claim..."
                                  : claimTx.phase === "confirming" && claimingId === e.marketId
                                  ? "Confirming..."
                                  : `Claim ${formatUsdc(e.claimable)} Now`}
                              </button>
                              {claimingId === e.marketId && (
                                <TxStatus phase={claimTx.phase} error={claimTx.error} hash={claimTx.hash} />
                              )}
                            </div>
                          ) : (
                            <p className="settlement-claimed-msg">
                              {chosenOptionIndices.includes(Number(e.winningOption))
                                ? "Winnings have been claimed for this market."
                                : "You did not back the winning option for this market."}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* DRAWER FOOTER ACTIONS */}
                    <div className="drawer-footer">
                      <Link to={`/market/${e.marketId}`} className="btn btn--secondary btn--sm">
                        View Full Market Page &rarr;
                      </Link>
                    </div>
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
