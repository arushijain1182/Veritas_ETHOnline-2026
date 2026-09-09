import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { usePortfolio } from "../hooks/usePortfolio";
import { useUsdc } from "../hooks/useUsdc";
import { StatusBadge } from "../components/StatusBadge";
import { CATEGORY_ICON, isDeploymentConfigured, MarketStatus } from "../config/contracts";
import { formatUsdc } from "../lib/format";

export function PortfolioPage() {
  const { isConnected } = useAccount();
  const { usdcBalance } = useUsdc();
  const { entries, totalClaimable, isLoading } = usePortfolio();

  if (!isDeploymentConfigured) return null;

  if (!isConnected) {
    return <p className="empty-state">Connect your wallet to see your balance and positions.</p>;
  }

  return (
    <div className="portfolio">
      <h1>Your Portfolio</h1>

      <div className="portfolio__summary">
        <div className="portfolio__stat">
          <span className="portfolio__stat-label">USDC balance</span>
          <span className="portfolio__stat-value">{formatUsdc(usdcBalance)}</span>
        </div>
        <div className="portfolio__stat portfolio__stat--highlight">
          <span className="portfolio__stat-label">Unclaimed winnings</span>
          <span className="portfolio__stat-value">{formatUsdc(totalClaimable)}</span>
        </div>
      </div>

      {isLoading ? (
        <p className="empty-state">Loading positions...</p>
      ) : entries.length === 0 ? (
        <p className="empty-state">No positions yet — place a prediction to see it here.</p>
      ) : (
        <div className="portfolio__positions">
          {entries.map((e) => (
            <Link to={`/market/${e.marketId}`} key={e.marketId} className="portfolio__position">
              <div className="portfolio__position-header">
                <span className="category-badge">
                  {CATEGORY_ICON[e.category] ?? "\u{1F4CC}"} {e.category}
                </span>
                <StatusBadge status={e.status} />
              </div>
              <h3>{e.question}</h3>
              <div className="portfolio__position-rows">
                {e.options.map(
                  (option, i) =>
                    e.contributions[i] > 0n && (
                      <div key={option} className="portfolio__position-row">
                        <span>{option}</span>
                        <span>{formatUsdc(e.contributions[i])} staked</span>
                      </div>
                    )
                )}
              </div>
              {e.status === MarketStatus.RESOLVED && (
                <div className="portfolio__position-footer">
                  {e.claimable > 0n ? (
                    <span className="portfolio__claimable">Claimable: {formatUsdc(e.claimable)}</span>
                  ) : (
                    <span className="portfolio__claimed">Nothing left to claim</span>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
