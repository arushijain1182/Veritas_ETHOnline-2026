import { useState } from "react";
import { Link } from "react-router-dom";
import { useMarkets } from "../hooks/useMarkets";
import { StatusBadge } from "../components/StatusBadge";
import { formatPercent, formatUsdc, formatRelativeTime } from "../lib/format";
import { CATEGORY_ICON, isDeploymentConfigured } from "../config/contracts";

const OPTION_COLORS = [
  "#3182ce", // Blue
  "#e53e3e", // Red
  "#38a169", // Green
  "#805ad5", // Purple
  "#dd6b20", // Orange
  "#319795", // Teal
  "#d53f8c", // Pink
];

export function MarketListPage() {
  const { markets, isLoading } = useMarkets();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  if (!isDeploymentConfigured) {
    return null; // Layout already shows the banner
  }

  if (isLoading) {
    return <p className="empty-state">Loading campus prediction markets...</p>;
  }

  if (markets.length === 0) {
    return <p className="empty-state">No markets available.</p>;
  }

  const categories = Array.from(new Set(markets.map((m) => m.category).filter(Boolean)));
  const visibleMarkets = activeCategory ? markets.filter((m) => m.category === activeCategory) : markets;

  return (
    <div className="market-list-page">
      {/* Category Navigation Pills */}
      {categories.length > 0 && (
        <div className="category-filter">
          <button
            className={`category-pill ${activeCategory === null ? "category-pill--active" : ""}`}
            onClick={() => setActiveCategory(null)}
          >
            All Markets ({markets.length})
          </button>
          {categories.map((c) => (
            <button
              key={c}
              className={`category-pill ${activeCategory === c ? "category-pill--active" : ""}`}
              onClick={() => setActiveCategory(c)}
            >
              <span>{CATEGORY_ICON[c] ?? "\u{1F4CC}"}</span> {c} (
              {markets.filter((m) => m.category === c).length})
            </button>
          ))}
        </div>
      )}

      {visibleMarkets.length === 0 ? (
        <p className="empty-state">No markets in this category yet.</p>
      ) : (
        <div className="market-list">
          {visibleMarkets.map((m) => {
            const hasUserInvested = !!m.userInvested && (m.userInvestedAmount ?? 0n) > 0n;

            return (
              <Link to={`/market/${m.id}`} key={m.id} className="market-card">
                {/* Header */}
                <div className="market-card__header">
                  <div className="market-card__title">
                    <div className="market-card__badge-row">
                      {m.category && (
                        <span className="category-badge">
                          {CATEGORY_ICON[m.category] ?? "\u{1F4CC}"} {m.category}
                        </span>
                      )}
                      <span className="market-card__announcement-tag" title={m.resultAnnouncement}>
                        📅 Result: {formatRelativeTime(m.resultAnnouncementTime ?? m.closeTime)}
                      </span>
                    </div>
                    <h2>{m.question}</h2>
                  </div>
                  <StatusBadge status={m.status} />
                </div>

                {/* Highlight banner if user invested in this market */}
                {hasUserInvested && (
                  <div className="market-card__user-invested-banner">
                    <span className="user-invested-badge">🎯 YOUR INVESTMENT</span>
                    <span className="user-invested-details">
                      <strong>{formatUsdc(m.userInvestedAmount)}</strong> on{" "}
                      <strong>{m.userInvestedOptionName}</strong>
                    </span>
                  </div>
                )}

                {/* % DISTRIBUTION Visual Segmented Bar */}
                <div className="market-card__distribution-bar" title="Pool % Distribution">
                  {m.options.map((opt, i) => {
                    const pool = m.optionPools[i] ?? 0n;
                    const pct = m.totalPool > 0n ? Number((pool * 1000n) / m.totalPool) / 10 : 0;
                    if (pct <= 0) return null;
                    return (
                      <div
                        key={opt}
                        className="market-card__distribution-segment"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: OPTION_COLORS[i % OPTION_COLORS.length],
                        }}
                        title={`${opt}: ${pct.toFixed(1)}%`}
                      />
                    );
                  })}
                </div>

                {/* Options List with % DISTRIBUTION */}
                <div className="market-card__options">
                  {m.options.map((option, i) => {
                    const pool = m.optionPools[i] ?? 0n;
                    const pct = formatPercent(pool, m.totalPool);
                    const isUserPick = hasUserInvested && m.userInvestedOption === i;

                    return (
                      <div
                        className={`market-card__option ${isUserPick ? "market-card__option--user-pick" : ""}`}
                        key={option}
                      >
                        <div className="market-card__option-left">
                          <span
                            className="option-color-dot"
                            style={{ backgroundColor: OPTION_COLORS[i % OPTION_COLORS.length] }}
                          />
                          <span className="option-name">{option}</span>
                          {isUserPick && <span className="user-pick-tag">Your Pick ✨</span>}
                        </div>
                        <div className="market-card__option-right">
                          <span className="market-card__option-amount">{formatUsdc(pool)}</span>
                          <span className="market-card__option-pct">
                            {m.status === 2 && Number(m.winningOption) === i ? "WON" : pct}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer: Total Money & No. of Students Invested */}
                <div className="market-card__footer">
                  <div className="market-card__footer-stat">
                    <span className="stat-label">Total Money on Market:</span>
                    <strong className="stat-value">{formatUsdc(m.totalPool)}</strong>
                  </div>
                  <div className="market-card__footer-stat">
                    <span className="stat-label">Students Invested:</span>
                    <strong className="stat-value">
                      👥 {m.studentCount ? `${m.studentCount} students` : "—"}
                    </strong>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
