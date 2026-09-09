import { Link } from "react-router-dom";
import { useMarkets } from "../hooks/useMarkets";
import { StatusBadge } from "../components/StatusBadge";
import { formatPercent, formatUsdc } from "../lib/format";
import { isDeploymentConfigured } from "../config/contracts";

export function MarketListPage() {
  const { markets, isLoading } = useMarkets();

  if (!isDeploymentConfigured) {
    return null; // Layout already shows the "no deployment configured" banner
  }

  if (isLoading) {
    return <p className="empty-state">Loading markets...</p>;
  }

  if (markets.length === 0) {
    return <p className="empty-state">No markets yet.</p>;
  }

  return (
    <div className="market-list">
      {markets.map((m) => (
        <Link to={`/market/${m.id}`} key={m.id} className="market-card">
          <div className="market-card__header">
            <h2>{m.question}</h2>
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
  );
}
