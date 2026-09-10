import { Link, Outlet } from "react-router-dom";
import { ConnectWallet } from "./ConnectWallet";
import { usePortfolio } from "../hooks/usePortfolio";

export function Layout() {
  const { entries } = usePortfolio();

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
          <ConnectWallet />
        </nav>
      </header>
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
