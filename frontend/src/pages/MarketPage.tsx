import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAccount } from "wagmi";
import { useMarket } from "../hooks/useMarket";
import { useTx } from "../hooks/useTx";
import { StatusBadge } from "../components/StatusBadge";
import { BetForm } from "../components/BetForm";
import { SwapBetForm } from "../components/SwapBetForm";
import { ClaimPanel } from "../components/ClaimPanel";
import { TxStatus } from "../components/TxStatus";
import { formatCloseTime, formatPercent, formatUsdc } from "../lib/format";
import { MARKET_ABI, MARKET_ADDRESS, MarketStatus, isDeploymentConfigured } from "../config/contracts";

export function MarketPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const id = marketId !== undefined ? Number(marketId) : undefined;
  const { market, isLoading, refetch } = useMarket(id);
  const { isConnected } = useAccount();
  const [betTab, setBetTab] = useState<"usdc" | "eth">("usdc");
  const closeTx = useTx();

  if (!isDeploymentConfigured) return null;
  if (isLoading || !market) return <p className="empty-state">Loading market...</p>;

  const canClose = market.status === MarketStatus.OPEN && Date.now() >= Number(market.closeTime) * 1000;

  async function handleClose() {
    await closeTx.send({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "closeMarket",
      args: [BigInt(market!.id)],
    });
    refetch();
  }

  return (
    <div className="market-page">
      <Link to="/" className="back-link">
        &larr; All markets
      </Link>

      <div className="market-page__header">
        <h1>{market.question}</h1>
        <StatusBadge status={market.status} />
      </div>

      <div className="market-page__pools">
        {market.options.map((option, i) => (
          <div className="market-page__pool" key={option}>
            <div className="market-page__pool-label">
              <span>{option}</span>
              <span>{formatPercent(market.optionPools[i] ?? 0n, market.totalPool)}</span>
            </div>
            <div className="market-page__pool-bar">
              <div
                className="market-page__pool-bar-fill"
                style={{ width: market.totalPool > 0n ? `${Number((market.optionPools[i] ?? 0n) * 100n) / Number(market.totalPool)}%` : "0%" }}
              />
            </div>
            <div className="market-page__pool-amount">{formatUsdc(market.optionPools[i] ?? 0n)}</div>
          </div>
        ))}
      </div>

      <div className="market-page__meta">
        <span>Pool: {formatUsdc(market.totalPool)}</span>
        <span>Closes: {formatCloseTime(market.closeTime)}</span>
      </div>

      {isConnected && market.userContributions.some((c) => c > 0n) && (
        <div className="market-page__position">
          <h3>Your position</h3>
          {market.options.map(
            (option, i) =>
              (market.userContributions[i] ?? 0n) > 0n && (
                <div key={option}>
                  {option}: {formatUsdc(market.userContributions[i])}
                </div>
              )
          )}
        </div>
      )}

      {market.status === MarketStatus.OPEN && (
        <div className="market-page__bet">
          <div className="tabs">
            <button className={`tabs__tab ${betTab === "usdc" ? "tabs__tab--active" : ""}`} onClick={() => setBetTab("usdc")}>
              Bet USDC
            </button>
            <button className={`tabs__tab ${betTab === "eth" ? "tabs__tab--active" : ""}`} onClick={() => setBetTab("eth")}>
              Swap ETH -&gt; USDC (Uniswap)
            </button>
          </div>
          {betTab === "usdc" ? (
            <BetForm marketId={market.id} options={market.options} onDone={refetch} />
          ) : (
            <SwapBetForm marketId={market.id} options={market.options} onDone={refetch} />
          )}
        </div>
      )}

      {canClose && (
        <div className="market-page__close">
          <p>Betting has closed. Anyone can close this market to allow resolution.</p>
          <button className="btn btn--secondary" onClick={handleClose} disabled={closeTx.phase === "signing" || closeTx.phase === "confirming"}>
            Close Market
          </button>
          <TxStatus phase={closeTx.phase} error={closeTx.error} hash={closeTx.hash} />
        </div>
      )}

      {market.status === MarketStatus.CLOSED && !canClose && (
        <p className="empty-state">Market closed. Waiting for the official result via Chainlink resolution...</p>
      )}

      {market.status === MarketStatus.RESOLVED && <ClaimPanel market={market} onDone={refetch} />}
    </div>
  );
}
