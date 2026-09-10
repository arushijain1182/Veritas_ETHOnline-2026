import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMarket } from "../hooks/useMarket";
import { useTx } from "../hooks/useTx";
import { StatusBadge } from "../components/StatusBadge";
import { BetForm } from "../components/BetForm";
import { SwapBetForm } from "../components/SwapBetForm";
import { ClaimPanel } from "../components/ClaimPanel";
import { TxStatus } from "../components/TxStatus";
import { formatAddress, formatCloseTime, formatPercent, formatUsdc, formatRelativeTime } from "../lib/format";
import { MARKET_ABI, MARKET_ADDRESS, MarketStatus, CATEGORY_ICON, isDeploymentConfigured } from "../config/contracts";

const OPTION_COLORS = [
  "#3182ce", // Blue
  "#e53e3e", // Red
  "#38a169", // Green
  "#805ad5", // Purple
  "#dd6b20", // Orange
  "#319795", // Teal
  "#d53f8c", // Pink
];

export function MarketPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const id = marketId !== undefined ? Number(marketId) : undefined;
  const { market, isLoading, refetch } = useMarket(id);
  const [betTab, setBetTab] = useState<"usdc" | "eth">("usdc");
  const closeTx = useTx();

  if (!isDeploymentConfigured) return null;
  if (isLoading || !market) return <p className="empty-state">Loading market details...</p>;

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

  // Calculate user position
  const userTotalContribution = market.userContributions.reduce((a, b) => a + b, 0n);
  const hasUserInvested = (market.userInvestedAmount ?? 0n) > 0n || userTotalContribution > 0n;
  const userInvestedAmount = market.userInvestedAmount && market.userInvestedAmount > 0n
    ? market.userInvestedAmount
    : userTotalContribution;

  const chosenOptionIndex = market.userInvestedOption !== undefined
    ? market.userInvestedOption
    : market.userContributions.findIndex((c) => c > 0n);

  const chosenOptionName = chosenOptionIndex !== -1 && market.options[chosenOptionIndex]
    ? market.options[chosenOptionIndex]
    : market.userInvestedOptionName ?? "Selected Option";

  // Calculate estimated potential payout if chosen option wins:
  let estimatedPayoutStr = "-";
  let payoutMultiplierStr = "-";
  if (hasUserInvested && chosenOptionIndex !== -1) {
    const chosenPool = market.optionPools[chosenOptionIndex] ?? 0n;
    if (chosenPool > 0n && market.totalPool > 0n) {
      const prizePool = market.prizePool > 0n ? market.prizePool : (market.totalPool * 90n) / 100n;
      const payout = (userInvestedAmount * prizePool) / chosenPool;
      estimatedPayoutStr = formatUsdc(payout);
      const mult = Number(payout) / Number(userInvestedAmount);
      payoutMultiplierStr = `${mult.toFixed(2)}x`;
    }
  }

  const resultTime = market.resultAnnouncementTime ?? market.closeTime;

  return (
    <div className="market-page">
      <Link to="/" className="back-link">
        &larr; All markets
      </Link>

      {/* Header */}
      <div className="market-page__header">
        <div className="market-page__header-left">
          <div className="market-card__badge-row">
            {market.category && (
              <span className="category-badge">
                {CATEGORY_ICON[market.category] ?? "\u{1F4CC}"} {market.category}
              </span>
            )}
            <span className="oracle-badge">
              🔗 {market.resolutionOracle ?? "Chainlink CRE Verified"}
            </span>
          </div>
          <h1>{market.question}</h1>
        </div>
        <StatusBadge status={market.status} />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1. USER'S INVESTMENT CARD */}
      {/* ------------------------------------------------------------- */}
      {hasUserInvested ? (
        <div className="market-page__user-card market-page__user-card--invested">
          <div className="user-card__top">
            <span className="user-card__tag">🎯 YOUR ACTIVE INVESTMENT</span>
            <span className="user-card__badge">Verified Stake</span>
          </div>
          <div className="user-card__grid">
            <div className="user-card__item">
              <span className="user-card__label">Hostel Backed:</span>
              <strong className="user-card__value user-card__value--highlight">
                {chosenOptionName}
              </strong>
            </div>
            <div className="user-card__item">
              <span className="user-card__label">Your Money Invested:</span>
              <strong className="user-card__value">{formatUsdc(userInvestedAmount)}</strong>
            </div>
            <div className="user-card__item">
              <span className="user-card__label">Your Pool Share:</span>
              <strong className="user-card__value">
                {formatPercent(userInvestedAmount, market.optionPools[chosenOptionIndex] ?? userInvestedAmount)}
              </strong>
            </div>
            <div className="user-card__item">
              <span className="user-card__label">Estimated Payout if Won:</span>
              <strong className="user-card__value user-card__value--payout">
                {estimatedPayoutStr} <span className="payout-mult">({payoutMultiplierStr})</span>
              </strong>
            </div>
          </div>
          <p className="user-card__footnote">
            Your stake is secured in the smart contract pool. Winnings will be distributed automatically
            proportional to your share upon official result verification.
          </p>
        </div>
      ) : (
        <div className="market-page__user-card market-page__user-card--uninvested">
          <div className="uninvested-icon">💡</div>
          <div className="uninvested-content">
            <h4>You haven't invested in this market yet</h4>
            <p>
              Join <strong>{market.studentCount ?? 0} students</strong> in predicting this outcome.
              Select an option below to invest your prediction!
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. WHEN THAT MARKET RESULT WILL BE ANNOUNCED */}
      {/* ------------------------------------------------------------- */}
      <div className="market-page__announcement-card">
        <div className="announcement-card__header">
          <span className="announcement-icon">📅</span>
          <div>
            <h3>Result Announcement &amp; Resolution</h3>
            <span className="announcement-relative">
              Countdown: <strong>{formatRelativeTime(resultTime)}</strong>
            </span>
          </div>
        </div>
        <div className="announcement-card__details">
          <div className="announcement-row">
            <span className="announcement-label">Scheduled Announcement:</span>
            <strong className="announcement-val">{formatCloseTime(resultTime)}</strong>
          </div>
          {market.resultAnnouncement && (
            <div className="announcement-row">
              <span className="announcement-label">Event &amp; Ceremony Context:</span>
              <span className="announcement-context">{market.resultAnnouncement}</span>
            </div>
          )}
          <div className="announcement-row">
            <span className="announcement-label">Resolution Mechanism:</span>
            <span className="announcement-oracle">
              {market.resolutionOracle ?? "Chainlink CRE Verified Oracle & Official Council"}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. KEY METRICS: TOTAL MONEY & NO. OF STUDENTS INVESTED */}
      {/* ------------------------------------------------------------- */}
      <div className="market-page__metrics-grid">
        <div className="metric-box">
          <span className="metric-box__label">Total Money on Market</span>
          <strong className="metric-box__val">{formatUsdc(market.totalPool)}</strong>
          <span className="metric-box__hint">Total college prediction pool</span>
        </div>
        <div className="metric-box">
          <span className="metric-box__label">Students Invested</span>
          <strong className="metric-box__val">👥 {market.studentCount ?? "—"}</strong>
          <span className="metric-box__hint">Total student participants</span>
        </div>
        <div className="metric-box">
          <span className="metric-box__label">Prize Pool (90%)</span>
          <strong className="metric-box__val">
            {formatUsdc(market.prizePool > 0n ? market.prizePool : (market.totalPool * 90n) / 100n)}
          </strong>
          <span className="metric-box__hint">Distributed to winning backers</span>
        </div>
        <div className="metric-box">
          <span className="metric-box__label">Hostels Competing</span>
          <strong className="metric-box__val">{market.options.length} Hostels</strong>
          <span className="metric-box__hint">10% platform maintenance fee</span>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. % DISTRIBUTION & OPTIONS BREAKDOWN */}
      {/* ------------------------------------------------------------- */}
      <div className="market-page__distribution-section">
        <div className="distribution-section__header">
          <h3>📊 Pool % Distribution &amp; Campus Consensus</h3>
          <span className="distribution-section__sub">
            Real-time percentage allocation of money across hostels
          </span>
        </div>

        {/* Visual composite segmented distribution bar */}
        <div className="distribution-composite-bar">
          {market.options.map((opt, i) => {
            const pool = market.optionPools[i] ?? 0n;
            const pct = market.totalPool > 0n ? Number((pool * 1000n) / market.totalPool) / 10 : 0;
            if (pct <= 0) return null;
            return (
              <div
                key={opt}
                className="composite-segment"
                style={{
                  width: `${pct}%`,
                  backgroundColor: OPTION_COLORS[i % OPTION_COLORS.length],
                }}
                title={`${opt}: ${pct.toFixed(1)}%`}
              />
            );
          })}
        </div>

        {/* Detailed Breakdown Card for Each Option */}
        <div className="options-distribution-list">
          {market.options.map((option, i) => {
            const pool = market.optionPools[i] ?? 0n;
            const pct = formatPercent(pool, market.totalPool);
            const isUserPick = hasUserInvested && chosenOptionIndex === i;
            const optionStudents = market.optionStudentCounts?.[i] ?? 0;

            let multiplier = "-";
            if (pool > 0n && market.totalPool > 0n) {
              const prize = (market.totalPool * 90n) / 100n;
              const mult = Number(prize) / Number(pool);
              multiplier = `${mult.toFixed(2)}x`;
            }

            return (
              <div
                className={`option-distribution-card ${isUserPick ? "option-distribution-card--user-pick" : ""}`}
                key={option}
              >
                <div className="option-dist-top">
                  <div className="option-dist-name-row">
                    <span
                      className="option-color-dot"
                      style={{ backgroundColor: OPTION_COLORS[i % OPTION_COLORS.length] }}
                    />
                    <strong className="option-dist-name">{option}</strong>
                    {isUserPick && <span className="user-pick-tag">Your Pick ✨</span>}
                  </div>
                  <div className="option-dist-pct-badge">{pct}</div>
                </div>

                <div className="option-dist-bar-wrapper">
                  <div
                    className="option-dist-bar-fill"
                    style={{
                      width: market.totalPool > 0n ? `${Number((pool * 100n) / market.totalPool)}%` : "0%",
                      backgroundColor: OPTION_COLORS[i % OPTION_COLORS.length],
                    }}
                  />
                </div>

                <div className="option-dist-stats-row">
                  <div className="stat-pill">
                    <span className="stat-pill-label">Money Staked:</span>
                    <strong>{formatUsdc(pool)}</strong>
                  </div>
                  <div className="stat-pill">
                    <span className="stat-pill-label">Students Invested:</span>
                    <strong>👥 {optionStudents > 0 ? `${optionStudents} students` : "—"}</strong>
                  </div>
                  <div className="stat-pill">
                    <span className="stat-pill-label">Payout Multiplier:</span>
                    <strong className="mult-highlight">{multiplier}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 5. BET / INVESTMENT FORM */}
      {/* ------------------------------------------------------------- */}
      {market.status === MarketStatus.OPEN && (
        <div className="market-page__bet-section">
          <h3>Invest in this Market</h3>
          <p className="bet-section__sub">
            Back your hostel before the market closes. Staked USDC mints 1:1 transferable outcome tokens.
          </p>

          <div className="tabs">
            <button
              className={`tabs__tab ${betTab === "usdc" ? "tabs__tab--active" : ""}`}
              onClick={() => setBetTab("usdc")}
            >
              Direct USDC Prediction
            </button>
            <button
              className={`tabs__tab ${betTab === "eth" ? "tabs__tab--active" : ""}`}
              onClick={() => setBetTab("eth")}
            >
              Swap ETH -&gt; USDC (Uniswap V2)
            </button>
          </div>
          {betTab === "usdc" ? (
            <BetForm marketId={market.id} options={market.options} onDone={refetch} />
          ) : (
            <SwapBetForm marketId={market.id} options={market.options} onDone={refetch} />
          )}
        </div>
      )}

      {/* Close & Resolution handlers */}
      {canClose && (
        <div className="market-page__close">
          <p>Betting has closed. Anyone can close this market to allow resolution.</p>
          <button
            className="btn btn--secondary"
            onClick={handleClose}
            disabled={closeTx.phase === "signing" || closeTx.phase === "confirming"}
          >
            Close Market
          </button>
          <TxStatus phase={closeTx.phase} error={closeTx.error} hash={closeTx.hash} />
        </div>
      )}

      {market.status === MarketStatus.CLOSED && !canClose && (
        <p className="empty-state">
          Market closed. Waiting for the official result via Chainlink resolution...
        </p>
      )}

      {market.status === MarketStatus.RESOLVED && <ClaimPanel market={market} onDone={refetch} />}

      {/* Secondary Market info */}
      <div className="market-page__tokens">
        <h3>Position Tokens (Uniswap Secondary Market)</h3>
        <p className="market-page__tokens-hint">
          Every investment mints a transferable ERC20 outcome token, 1:1 with the USDC staked. You can hold
          to claim upon resolution, or trade positions on Uniswap prior to announcement.
        </p>
        {market.options.map((option, i) => {
          const info = market.outcomeTokens[i];
          if (!info) return null;
          return (
            <div className="market-page__token-row" key={option}>
              <span className="token-name">
                <span
                  className="option-color-dot"
                  style={{ backgroundColor: OPTION_COLORS[i % OPTION_COLORS.length] }}
                />
                {option}
              </span>
              <span title={info.token} className="token-addr">
                Token: {info.token === "0x0000000000000000000000000000000000000000" ? `${option}-M${market.id}` : formatAddress(info.token)}
              </span>
              <span title={info.pair} className="token-pair">
                Uniswap Pair: {info.pair === "0x0000000000000000000000000000000000000000" ? "Campus Liquidity Pool" : formatAddress(info.pair)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
