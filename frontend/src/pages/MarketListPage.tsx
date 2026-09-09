import { useState } from "react";
import { Link } from "react-router-dom";
import { useMarkets } from "../hooks/useMarkets";
import { StatusBadge } from "../components/StatusBadge";
import { formatPercent, formatUsdc } from "../lib/format";
import { CATEGORY_ICON, isDeploymentConfigured } from "../config/contracts";

export function MarketListPage() {
  const { markets, isLoading } = useMarkets();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  if (!isDeploymentConfigured) {
    return null; // Layout already shows the "no deployment configured" banner
  }

  if (isLoading) {
    return <p className="empty-state">Loading markets...</p>;
  }

  if (markets.length === 0) {
    return <p className="empty-state">No markets yet.</p>;
  }

  const categories = Array.from(new Set(markets.map((m) => m.category).filter(Boolean)));
  const visibleMarkets = activeCategory ? markets.filter((m) => m.category === activeCategory) : markets;

  return (
    <div>
      {categories.length > 0 && (
        <div className="category-filter">
          <button
            className={`category-pill ${activeCategory === null ? "category-pill--active" : ""}`}
            onClick={() => setActiveCategory(null)}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              className={`category-pill ${activeCategory === c ? "category-pill--active" : ""}`}
              onClick={() => setActiveCategory(c)}
            >
              <span>{CATEGORY_ICON[c] ?? "\u{1F4CC}"}</span> {c}
            </button>
          ))}
        </div>
      )}

      {visibleMarkets.length === 0 ? (
        <p className="empty-state">No markets in this category yet.</p>
      ) : (
        <div className="market-list">
          {visibleMarkets.map((m) => (
            <Link to={`/market/${m.id}`} key={m.id} className="market-card">
              <div className="market-card__header">
                <div className="market-card__title">
                  {m.category && (
                    <span className="category-badge">
                      {CATEGORY_ICON[m.category] ?? "\u{1F4CC}"} {m.category}
                    </span>
                  )}
                  <h2>{m.question}</h2>
                </div>
                <StatusBadge status={m.status} />
              </div>
              <div className="market-card__options">
                {m.options.map((option, i) => (
                  <div className="market-card__option" key={option}>
                    <span>{option}</span>
                    <span className="market-card__option-pct">
                      {m.status === 2 && Number(m.winningOption) === i ? "WON" : formatPercent(m.optionPools[i] ?? 0n, m.totalPool)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="market-card__footer">
                <span>Pool: {formatUsdc(m.totalPool)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
