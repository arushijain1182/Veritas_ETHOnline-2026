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
import { IS_DEMO_MODE, MARKET_ABI, MARKET_ADDRESS, MarketStatus, CATEGORY_ICON } from "../config/contracts";

const OPTION_COLORS = [
  "#2563eb", // Blue
  "#dc2626", // Red
  "#059669", // Emerald
  "#7c3aed", // Violet
  "#d97706", // Amber
  "#0891b2", // Cyan
  "#db2777", // Pink
];

export function MarketPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const id = marketId !== undefined ? Number(marketId) : undefined;
  const { market, isLoading, refetch } = useMarket(id);
  const [betTab, setBetTab] = useState<"usdc" | "eth">("usdc");
  const [selectedOption, setSelectedOption] = useState<number>(0);
  const closeTx = useTx();

  if (isLoading || !market) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p className="loading-text">Loading market data...</p>
      </div>
    );
  }

  const canClose = market.status === MarketStatus.OPEN && Date.now() >= Number(market.closeTime) * 1000;

  async function handleClose() {
    if (!IS_DEMO_MODE) {
      await closeTx.send({
        address: MARKET_ADDRESS,
        abi: MARKET_ABI,
        functionName: "closeMarket",
        args: [BigInt(market!.id)],
      });
    }
    refetch();
  }

  // Calculate user position
  const userTotalContribution = market.userContributions.reduce((a, b) => a + b, 0n);
  const hasUserInvested = (market.userInvestedAmount ?? 0n) > 0n || userTotalContribution > 0n;
  const userInvestedAmount =
    market.userInvestedAmount && market.userInvestedAmount > 0n
      ? market.userInvestedAmount
      : userTotalContribution;

  const chosenOptionIndex =
    market.userInvestedOption !== undefined
      ? market.userInvestedOption
      : market.userContributions.findIndex((c) => c > 0n);

  const chosenOptionName =
    chosenOptionIndex !== -1 && market.options[chosenOptionIndex]
      ? market.options[chosenOptionIndex]
      : market.userInvestedOptionName ?? "Selected Option";

  // Calculate estimated potential payout if chosen option wins
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
    <div className="market-detail-view">
      {/* Back navigation */}
      <div className="detail-breadcrumb">
        <Link to="/" className="breadcrumb-back">
          <span className="breadcrumb-arrow">&larr;</span> Back to Markets
        </Link>
      </div>

      {/* Header Area */}
      <header className="detail-header">
        <div className="detail-header__badges">
          {market.category && (
            <span className="tag-pill tag-pill--category">
              {CATEGORY_ICON[market.category] ?? "\u{1F4CC}"} {market.category}
            </span>
          )}
          <StatusBadge status={market.status} />
          <span className="tag-pill tag-pill--oracle">
            🔗 {market.resolutionOracle ?? "Chainlink CRE Verified"}
          </span>
          <span className="tag-pill tag-pill--demo">Campus Demo</span>
        </div>

        <h1 className="detail-header__title">{market.question}</h1>

        <div className="detail-header__meta-strip">
          <span className="meta-strip__item">
            <span className="meta-strip__label">Result Announcement:</span>
            <strong>{formatCloseTime(resultTime)}</strong>
            <span className="meta-strip__highlight">({formatRelativeTime(resultTime)})</span>
          </span>
          {market.resultAnnouncement && (
            <span className="meta-strip__desc">&bull; {market.resultAnnouncement}</span>
          )}
        </div>
      </header>

      {/* 2-Column Responsive Layout */}
      <div className="detail-grid">
        {/* Left / Main Column */}
        <div className="detail-grid__main">
          {/* USER'S POSITION CARD (if user invested) */}
          {hasUserInvested && (
            <div className="position-card">
              <div className="position-card__header">
                <div className="position-card__badge-group">
                  <span className="position-indicator-dot" />
                  <span className="position-card__tag">YOUR ACTIVE POSITION</span>
                </div>
                <span className="position-verified-badge">Verified Prediction</span>
              </div>

              <div className="position-card__stats">
                <div className="position-stat">
                  <span className="position-stat__label">Hostel Backed</span>
                  <strong className="position-stat__val position-stat__val--highlight">
                    {chosenOptionName}
                  </strong>
                </div>
                <div className="position-stat">
                  <span className="position-stat__label">Staked Capital</span>
                  <strong className="position-stat__val">{formatUsdc(userInvestedAmount)}</strong>
                </div>
                <div className="position-stat">
                  <span className="position-stat__label">Pool Share</span>
                  <strong className="position-stat__val">
                    {formatPercent(userInvestedAmount, market.optionPools[chosenOptionIndex] ?? userInvestedAmount)}
                  </strong>
                </div>
                <div className="position-stat">
                  <span className="position-stat__label">Estimated Payout</span>
                  <strong className="position-stat__val position-stat__val--green">
                    {estimatedPayoutStr} <span className="position-mult">({payoutMultiplierStr})</span>
                  </strong>
                </div>
              </div>

              <div className="position-card__footnote">
                Your investment is locked in the contract. Automatic payout is released to winning outcome holders upon resolution.
              </div>
            </div>
          )}

          {/* LARGE PROBABILITY & OUTCOME SECTION */}
          <section className="detail-section">
            <div className="detail-section__header">
              <div>
                <h3 className="detail-section__title">Pool Distribution &amp; Implied Odds</h3>
                <p className="detail-section__desc">
                  Real-time campus consensus. 90% prize pool will be paid out proportionally to winning backers.
                </p>
              </div>
              <div className="detail-section__quick-metric">
                <span className="quick-metric__label">Total Pool:</span>
                <strong className="quick-metric__val">{formatUsdc(market.totalPool)}</strong>
              </div>
            </div>

            {/* Composite Distribution Bar */}
            <div className="composite-bar-wrapper">
              <div className="composite-bar" title="Distribution Breakdown">
                {market.options.map((opt, i) => {
                  const pool = market.optionPools[i] ?? 0n;
                  const pct = market.totalPool > 0n ? Number((pool * 1000n) / market.totalPool) / 10 : 0;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={opt}
                      className="composite-bar__segment"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: OPTION_COLORS[i % OPTION_COLORS.length],
                      }}
                      title={`${opt}: ${pct.toFixed(1)}%`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Outcomes Table / Cards */}
            <div className="outcomes-breakdown-list">
              {market.options.map((option, i) => {
                const pool = market.optionPools[i] ?? 0n;
                const pct = formatPercent(pool, market.totalPool);
                const isUserPick = hasUserInvested && chosenOptionIndex === i;
                const isTradingSelected = selectedOption === i;
                const optionStudents = market.optionStudentCounts?.[i] ?? 0;

                let multiplier = "-";
                if (pool > 0n && market.totalPool > 0n) {
                  const prize = (market.totalPool * 90n) / 100n;
                  const mult = Number(prize) / Number(pool);
                  multiplier = `${mult.toFixed(2)}x`;
                }

                return (
                  <div
                    key={option}
                    className={`outcome-card ${isUserPick ? "outcome-card--user-pick" : ""} ${
                      isTradingSelected ? "outcome-card--selected" : ""
                    }`}
                    onClick={() => setSelectedOption(i)}
                  >
                    <div className="outcome-card__left">
                      <span
                        className="outcome-card__dot"
                        style={{ backgroundColor: OPTION_COLORS[i % OPTION_COLORS.length] }}
                      />
                      <div className="outcome-card__name-group">
                        <strong className="outcome-card__name">{option}</strong>
                        {isUserPick && <span className="outcome-card__tag">Your Pick</span>}
                      </div>
                    </div>

                    <div className="outcome-card__stats">
                      <div className="stat-group">
                        <span className="stat-group__label">Staked</span>
                        <span className="stat-group__val">{formatUsdc(pool)}</span>
                      </div>
                      <div className="stat-group">
                        <span className="stat-group__label">Predictors</span>
                        <span className="stat-group__val">{optionStudents}</span>
                      </div>
                      <div className="stat-group">
                        <span className="stat-group__label">Return</span>
                        <span className="stat-group__val stat-group__val--mult">{multiplier}</span>
                      </div>
                      <div className="outcome-card__pct-badge">{pct}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* MARKET INFORMATION & RESOLUTION CONTEXT */}
          <section className="detail-section detail-section--info">
            <h3 className="detail-section__title">Market Information &amp; Resolution Protocol</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-item__label">Resolution Oracle</span>
                <span className="info-item__val">
                  {market.resolutionOracle ?? "Chainlink CRE Verified Oracle & Official Council"}
                </span>
              </div>
              <div className="info-item">
                <span className="info-item__label">Official Announcement</span>
                <span className="info-item__val">{formatCloseTime(resultTime)}</span>
              </div>
              <div className="info-item">
                <span className="info-item__label">Event Context</span>
                <span className="info-item__val">
                  {market.resultAnnouncement ?? "IIT Delhi campus competition results declaration"}
                </span>
              </div>
              <div className="info-item">
                <span className="info-item__label">Economic Structure</span>
                <span className="info-item__val">
                  Pari-mutuel pool: 90% prize pool to winning backers, 10% platform protocol maintenance.
                </span>
              </div>
            </div>
          </section>

          {/* RESOLUTION STATUS / CLAIM PANEL */}
          {market.status === MarketStatus.RESOLVED && (
            <ClaimPanel market={market} onDone={refetch} />
          )}

          {canClose && (
            <div className="market-close-card">
              <p>Betting duration has concluded. Anyone can close this market to allow resolution.</p>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleClose}
                disabled={closeTx.phase === "signing" || closeTx.phase === "confirming"}
              >
                Close Market for Resolution
              </button>
              <TxStatus phase={closeTx.phase} error={closeTx.error} hash={closeTx.hash} />
            </div>
          )}

          {/* SECONDARY MARKET / TOKENS */}
          <section className="detail-section detail-section--tokens">
            <h3 className="detail-section__title">Outcome Tokens (Uniswap V2 Liquidity)</h3>
            <p className="detail-section__desc">
              Every position mints 1:1 transferable outcome tokens that can be traded or held until settlement.
            </p>
            <div className="token-list">
              {market.options.map((option, i) => {
                const info = market.outcomeTokens[i];
                if (!info) return null;
                return (
                  <div className="token-card" key={option}>
                    <div className="token-card__left">
                      <span
                        className="outcome-dot"
                        style={{ backgroundColor: OPTION_COLORS[i % OPTION_COLORS.length] }}
                      />
                      <strong>{option}</strong>
                    </div>
                    <div className="token-card__right">
                      <span className="token-id">
                        Token: {info.token === "0x0000000000000000000000000000000000000000" ? `${option}-M${market.id}` : formatAddress(info.token)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right / Sidebar Column: PREDICTION & TRADING TERMINAL */}
        <aside className="detail-grid__sidebar">
          <div className="trading-terminal-card">
            <div className="trading-terminal__header">
              <h3 className="trading-terminal__title">Trade Prediction</h3>
              <span className="trading-terminal__tag">USDC Pool</span>
            </div>

            {market.status === MarketStatus.OPEN ? (
              <>
                <div className="trading-tabs">
                  <button
                    type="button"
                    className={`trading-tab ${betTab === "usdc" ? "trading-tab--active" : ""}`}
                    onClick={() => setBetTab("usdc")}
                  >
                    Direct USDC
                  </button>
                  <button
                    type="button"
                    className={`trading-tab ${betTab === "eth" ? "trading-tab--active" : ""}`}
                    onClick={() => setBetTab("eth")}
                  >
                    Swap ETH
                  </button>
                </div>

                {betTab === "usdc" ? (
                  <BetForm
                    marketId={market.id}
                    options={market.options}
                    selectedOption={selectedOption}
                    onSelectOption={setSelectedOption}
                    onDone={refetch}
                  />
                ) : (
                  <SwapBetForm marketId={market.id} options={market.options} onDone={refetch} />
                )}
              </>
            ) : (
              <div className="trading-terminal__closed">
                <p className="terminal-closed-title">Market is {market.status === 1 ? "Closed" : "Resolved"}</p>
                <p className="terminal-closed-desc">
                  Predictions are currently locked for this market while the official result is finalized.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

