import { useState } from "react";
import { Link } from "react-router-dom";
import { useMarkets } from "../hooks/useMarkets";
import { StatusBadge } from "../components/StatusBadge";
import { formatPercent, formatUsdc, formatRelativeTime } from "../lib/format";
import { CATEGORY_ICON } from "../config/contracts";

const OPTION_COLORS = [
  "#2563eb", // Blue
  "#dc2626", // Red
  "#059669", // Emerald
  "#7c3aed", // Violet
  "#d97706", // Amber
  "#0891b2", // Cyan
  "#db2777", // Pink
];

export function MarketListPage() {
  const { markets, isLoading } = useMarkets();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p className="loading-text">Loading campus prediction markets...</p>
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="empty-state-card">
        <h3>No markets available</h3>
        <p>No active prediction markets were found at this time.</p>
      </div>
    );
  }

  const categories = Array.from(new Set(markets.map((m) => m.category).filter(Boolean)));
  const visibleMarkets = activeCategory ? markets.filter((m) => m.category === activeCategory) : markets;

  return (
    <div className="market-list-page">
      {/* Hero Header */}
      <div className="page-hero">
        <div className="page-hero__badge">IIT Delhi Campus Prediction Protocol</div>
        <h1 className="page-hero__title">Explore Campus Markets</h1>
        <p className="page-hero__sub">
          Predict outcomes across inter-hostel championships, sports tournaments, and student council elections.
          Stakes are pooled in pari-mutuel smart contracts and settled via Chainlink oracles.
        </p>
      </div>

      {/* Category Navigation Bar */}
      {categories.length > 0 && (
        <div className="category-filter-wrapper">
          <div className="category-filter" role="tablist">
            <button
              type="button"
              className={`category-pill ${activeCategory === null ? "category-pill--active" : ""}`}
              onClick={() => setActiveCategory(null)}
            >
              <span>All Markets</span>
              <span className="category-pill__count">{markets.length}</span>
            </button>
            {categories.map((c) => {
              const count = markets.filter((m) => m.category === c).length;
              return (
                <button
                  key={c}
                  type="button"
                  className={`category-pill ${activeCategory === c ? "category-pill--active" : ""}`}
                  onClick={() => setActiveCategory(c)}
                >
                  <span className="category-pill__icon">{CATEGORY_ICON[c] ?? "\u{1F4CC}"}</span>
                  <span>{c}</span>
                  <span className="category-pill__count">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Markets Grid */}
      {visibleMarkets.length === 0 ? (
        <div className="empty-state-card">
          <h3>No markets found</h3>
          <p>There are no markets currently open under the selected category.</p>
        </div>
      ) : (
        <div className="markets-grid">
          {visibleMarkets.map((m) => {
            const hasUserInvested = !!m.userInvested && (m.userInvestedAmount ?? 0n) > 0n;

            // Compute potential return for user's position
            let userEstReturnStr = "";
            let userReturnMultiplierStr = "";
            if (hasUserInvested && m.userInvestedOption !== undefined) {
              const chosenPool = m.optionPools[m.userInvestedOption] ?? 0n;
              if (chosenPool > 0n && m.totalPool > 0n && (m.userInvestedAmount ?? 0n) > 0n) {
                const prizePool = (m.totalPool * 90n) / 100n;
                const payout = (m.userInvestedAmount! * prizePool) / chosenPool;
                userEstReturnStr = formatUsdc(payout);
                const mult = Number(payout) / Number(m.userInvestedAmount!);
                userReturnMultiplierStr = `${mult.toFixed(2)}x`;
              }
            }

            const resultTime = m.resultAnnouncementTime ?? m.closeTime;

            return (
              <Link to={`/market/${m.id}`} key={m.id} className="market-card">
                {/* Top Meta Bar */}
                <div className="market-card__meta-bar">
                  <div className="market-card__tags">
                    {m.category && (
                      <span className="tag-pill tag-pill--category">
                        {CATEGORY_ICON[m.category] ?? "\u{1F4CC}"} {m.category}
                      </span>
                    )}
                    <StatusBadge status={m.status} />
                  </div>
                  <span className="market-card__countdown" title={m.resultAnnouncement}>
                    Announces {formatRelativeTime(resultTime)}
                  </span>
                </div>

                {/* Question */}
                <h2 className="market-card__question">{m.question}</h2>

                {/* User Position Indicator (Compact, Premium) */}
                {hasUserInvested && (
                  <div className="market-card__position-chip">
                    <div className="position-chip__left">
                      <span className="position-chip__indicator" />
                      <span className="position-chip__text">
                        <strong>{formatUsdc(m.userInvestedAmount)}</strong> on{" "}
                        <span className="position-chip__hostel">{m.userInvestedOptionName}</span>
                      </span>
                    </div>
                    {userEstReturnStr && (
                      <div className="position-chip__right">
                        <span className="position-chip__payout-label">Est. Win:</span>
                        <strong className="position-chip__payout-val">{userEstReturnStr}</strong>
                        <span className="position-chip__mult">({userReturnMultiplierStr})</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Horizontal Probability Distribution Bar */}
                <div className="market-card__distribution-bar" title="Probability Distribution">
                  {m.options.map((opt, i) => {
                    const pool = m.optionPools[i] ?? 0n;
                    const pct = m.totalPool > 0n ? Number((pool * 1000n) / m.totalPool) / 10 : 0;
                    if (pct <= 0) return null;
                    return (
                      <div
                        key={opt}
                        className="distribution-bar__segment"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: OPTION_COLORS[i % OPTION_COLORS.length],
                        }}
                        title={`${opt}: ${pct.toFixed(1)}%`}
                      />
                    );
                  })}
                </div>

                {/* Outcomes Breakdown */}
                <div className="market-card__outcomes">
                  {m.options.map((option, i) => {
                    const pool = m.optionPools[i] ?? 0n;
                    const pct = formatPercent(pool, m.totalPool);
                    const isUserPick = hasUserInvested && m.userInvestedOption === i;

                    return (
                      <div
                        className={`outcome-row ${isUserPick ? "outcome-row--user-pick" : ""}`}
                        key={option}
                      >
                        <div className="outcome-row__left">
                          <span
                            className="outcome-dot"
                            style={{ backgroundColor: OPTION_COLORS[i % OPTION_COLORS.length] }}
                          />
                          <span className="outcome-name">{option}</span>
                          {isUserPick && <span className="outcome-pick-badge">Your Pick</span>}
                        </div>
                        <div className="outcome-row__right">
                          <span className="outcome-pool">{formatUsdc(pool)}</span>
                          <span className="outcome-pct">
                            {m.status === 2 && Number(m.winningOption) === i ? "WON" : pct}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Card Footer: Metrics & CTA */}
                <div className="market-card__footer">
                  <div className="market-card__metrics">
                    <div className="metric-item">
                      <span className="metric-item__label">Total Pool:</span>
                      <strong className="metric-item__val">{formatUsdc(m.totalPool)}</strong>
                    </div>
                    <span className="metric-dot">&bull;</span>
                    <div className="metric-item">
                      <span className="metric-item__label">Predictors:</span>
                      <strong className="metric-item__val">{m.studentCount ?? 0}</strong>
                    </div>
                  </div>
                  <span className="market-card__cta">
                    View Market <span className="cta-arrow">&rarr;</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

