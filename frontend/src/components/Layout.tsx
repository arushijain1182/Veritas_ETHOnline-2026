import { Link, Outlet, useLocation } from "react-router-dom";
import { ConnectWallet } from "./ConnectWallet";
import { usePortfolio } from "../hooks/usePortfolio";

export function Layout() {
  const { entries } = usePortfolio();
  const location = useLocation();

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="app-header__brand">
          <span className="brand-icon">V</span>
          <span className="brand-name">Veritas</span>
          <span className="brand-tag">IITD Markets</span>
        </Link>
        <nav className="app-header__nav">
          <Link
            to="/"
            className={`nav-link ${location.pathname === "/" ? "nav-link--active" : ""}`}
          >
            Markets
          </Link>
          <Link
            to="/portfolio"
            className={`nav-link ${location.pathname === "/portfolio" ? "nav-link--active" : ""}`}
          >
            Portfolio
            {entries.length > 0 && <span className="portfolio-count-badge">{entries.length}</span>}
          </Link>
          <Link
            to="/create"
            className={`nav-link ${location.pathname === "/create" ? "nav-link--active" : ""}`}
          >
            + Create
          </Link>
          <div className="nav-divider" />
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
            <span className="app-footer__desc">
              Pari-mutuel prediction pools verified with Chainlink CRE &amp; Uniswap V2 secondary tokens
            </span>
          </div>
          <nav className="app-footer__links">
            <Link to="/">Live Markets</Link>
            <Link to="/portfolio">Portfolio</Link>
            <Link to="/create">Create Market</Link>
            <Link to="/terms">Terms &amp; Mechanics</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

