import { Link, Outlet } from "react-router-dom";
import { useAccount, useReadContract } from "wagmi";
import { ConnectWallet } from "./ConnectWallet";
import { usePortfolio } from "../hooks/usePortfolio";
import { MARKET_ABI, MARKET_ADDRESS, isDeploymentConfigured } from "../config/contracts";

export function Layout() {
  const { address } = useAccount();
  const { entries } = usePortfolio();
  const { data: owner } = useReadContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "owner",
    query: { enabled: isDeploymentConfigured },
  });
  const isOwner = !!address && !!owner && (owner as string).toLowerCase() === address.toLowerCase();

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="app-header__brand">
          Veritas <span className="app-header__brand-sub">IITD Markets</span>
        </Link>
        <nav className="app-header__nav">
          <Link to="/portfolio" className="btn btn--ghost portfolio-link-btn">
            Portfolio {entries.length > 0 && <span className="portfolio-count-badge">{entries.length}</span>}
          </Link>
          {isOwner && (
            <Link to="/create" className="btn btn--ghost">
              + New Market
            </Link>
          )}
          <ConnectWallet />
        </nav>
      </header>
      {!isDeploymentConfigured && (
        <div className="banner banner--warn">
          No contract deployment configured. Run <code>npx hardhat run scripts/deployMarket.js</code> from the repo
          root, then <code>npm run sync-deployment</code> in <code>frontend/</code>.
        </div>
      )}
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <div className="app-footer__content">
          <div className="app-footer__info">
            <span className="app-footer__title">Veritas &bull; IITD Campus Prediction Market</span>
            <span className="app-footer__desc">Pari-mutuel pools powered by Chainlink CRE &amp; Uniswap V2</span>
          </div>
          <nav className="app-footer__links">
            <Link to="/">Markets</Link>
            <Link to="/portfolio">Portfolio</Link>
            <Link to="/terms">Terms &amp; Economic Mechanics</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
