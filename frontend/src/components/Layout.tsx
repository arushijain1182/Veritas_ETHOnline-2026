import { Link, Outlet } from "react-router-dom";
import { useAccount, useReadContract } from "wagmi";
import { ConnectWallet } from "./ConnectWallet";
import { MARKET_ABI, MARKET_ADDRESS, isDeploymentConfigured } from "../config/contracts";

export function Layout() {
  const { address } = useAccount();
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
          IITD Markets
        </Link>
        <nav className="app-header__nav">
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
    </div>
  );
}
