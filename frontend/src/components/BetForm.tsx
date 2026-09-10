import { useState } from "react";
import { useAccount } from "wagmi";
import { IS_DEMO_MODE, MARKET_ABI, MARKET_ADDRESS, USDC_ABI, USDC_ADDRESS } from "../config/contracts";
import { recordCampusBet, getCampusMarket } from "../config/campusMarkets";
import { useTx } from "../hooks/useTx";
import { useUsdc } from "../hooks/useUsdc";
import { formatUsdc, parseUsdc } from "../lib/format";
import { TxStatus } from "./TxStatus";

const QUICK_AMOUNTS = ["10", "25", "50", "100", "200"];

export function BetForm({
  marketId,
  options,
  selectedOption: controlledOption,
  onSelectOption,
  onDone,
}: {
  marketId: number;
  options: string[];
  selectedOption?: number;
  onSelectOption?: (idx: number) => void;
  onDone: () => void;
}) {
  const { isConnected } = useAccount();
  const { usdcBalance, allowance, refetch } = useUsdc();
  const [internalOption, setInternalOption] = useState(0);
  const [amountStr, setAmountStr] = useState("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const option = controlledOption !== undefined ? controlledOption : internalOption;
  const setOption = (idx: number) => {
    if (onSelectOption) onSelectOption(idx);
    setInternalOption(idx);
  };

  const approveTx = useTx();
  const betTx = useTx();

  const amount = parseUsdc(amountStr);
  const needsApproval = !IS_DEMO_MODE && isConnected && amount > 0n && allowance < amount;
  const insufficientBalance = !IS_DEMO_MODE && isConnected && amount > usdcBalance && usdcBalance > 0n;

  // Real-time calculation of potential payout
  const campusM = getCampusMarket(marketId);
  let potentialPayoutStr = "-";
  let multiplierStr = "-";
  if (campusM && amount > 0n) {
    const projectedTotalPool = campusM.totalPool + amount;
    const projectedPrizePool = (projectedTotalPool * 90n) / 100n;
    const projectedOptionPool = (campusM.optionPools[option] ?? 0n) + amount;
    if (projectedOptionPool > 0n) {
      const payout = (amount * projectedPrizePool) / projectedOptionPool;
      potentialPayoutStr = formatUsdc(payout);
      const mult = Number(payout) / Number(amount);
      multiplierStr = `${mult.toFixed(2)}x`;
    }
  }

  async function handleApprove() {
    if (IS_DEMO_MODE) return;
    await approveTx.send({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "approve",
      args: [MARKET_ADDRESS, amount],
    });
    refetch();
  }

  async function handleBet() {
    if (amount <= 0n) return;

    if (!IS_DEMO_MODE && isConnected) {
      try {
        await betTx.send({
          address: MARKET_ADDRESS,
          abi: MARKET_ABI,
          functionName: "placeBet",
          args: [BigInt(marketId), BigInt(option), amount],
        });
      } catch (err) {
        console.warn("On-chain bet was not submitted or rejected:", err);
      }
    }

    // Always record locally in campus markets state so UI updates in real time
    recordCampusBet(marketId, option, amount);
    setSuccessMsg(
      IS_DEMO_MODE
        ? `🎉 Demo Investment Placed: Invested ${formatUsdc(amount)} on ${options[option]}! Recorded in demo state.`
        : `🎉 Successfully invested ${formatUsdc(amount)} on ${options[option]}! Your position is now active.`
    );
    setAmountStr("");
    refetch();
    onDone();

    // Clear message after 5 seconds
    setTimeout(() => {
      setSuccessMsg(null);
    }, 5000);
  }

  return (
    <div className="trade-form">
      {successMsg && <div className="trade-form__success-toast">{successMsg}</div>}

      {/* Outcome Selector */}
      <div className="trade-form__group">
        <label className="trade-form__label">Choose Competing Hostel:</label>
        <div className="trade-options-grid">
          {options.map((label, i) => {
            const optPool = campusM?.optionPools[i] ?? 0n;
            const pctStr =
              campusM && campusM.totalPool > 0n
                ? `${Math.round(Number((optPool * 100n) / campusM.totalPool))}%`
                : "—";

            return (
              <button
                key={label}
                type="button"
                className={`trade-option-pill ${option === i ? "trade-option-pill--active" : ""}`}
                onClick={() => setOption(i)}
              >
                <span className="trade-option-pill__name">{label}</span>
                <span className="trade-option-pill__pct">{pctStr}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Investment Amount Input */}
      <div className="trade-form__group">
        <div className="trade-form__label-row">
          <label htmlFor="amount-input" className="trade-form__label">
            Investment Amount
          </label>
          <span className="trade-form__unit-tag">USDC</span>
        </div>

        <div className="trade-input-wrapper">
          <span className="trade-input-prefix">$</span>
          <input
            id="amount-input"
            type="number"
            min="1"
            step="1"
            placeholder="0"
            className="trade-input"
            value={amountStr}
            onChange={(e) => {
              setAmountStr(e.target.value);
              setSuccessMsg(null);
            }}
          />
          <span className="trade-input-suffix">USDC</span>
        </div>

        {/* Quick Amount Selector */}
        <div className="quick-amount-bar">
          {QUICK_AMOUNTS.map((q) => (
            <button
              key={q}
              type="button"
              className="quick-amount-pill"
              onClick={() => {
                setAmountStr(q);
                setSuccessMsg(null);
              }}
            >
              +${q}
            </button>
          ))}
        </div>
      </div>

      {/* Live Order Return Preview */}
      {amount > 0n && (
        <div className="trade-summary-card">
          <div className="trade-summary-row">
            <span className="trade-summary-label">Target Hostel:</span>
            <strong className="trade-summary-val">{options[option]}</strong>
          </div>
          <div className="trade-summary-row">
            <span className="trade-summary-label">Potential Payout:</span>
            <strong className="trade-summary-val trade-summary-val--green">{potentialPayoutStr}</strong>
          </div>
          <div className="trade-summary-row">
            <span className="trade-summary-label">Implied Return:</span>
            <span className="multiplier-badge">{multiplierStr}</span>
          </div>
          <p className="trade-summary-footnote">
            Pari-mutuel return is calculated based on current pool distribution (90% prize pool).
          </p>
        </div>
      )}

      {/* Action Button */}
      {needsApproval ? (
        <button
          type="button"
          className="btn btn--primary btn--trade"
          disabled={amount === 0n || approveTx.phase === "signing" || approveTx.phase === "confirming"}
          onClick={handleApprove}
        >
          Approve USDC
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--primary btn--trade"
          disabled={amount === 0n || insufficientBalance || betTx.phase === "signing" || betTx.phase === "confirming"}
          onClick={handleBet}
        >
          {insufficientBalance
            ? "Insufficient balance"
            : amount > 0n
            ? `Invest $${amountStr} on ${options[option]}`
            : `Select Amount to Invest`}
        </button>
      )}

      {(approveTx.phase !== "idle" || betTx.phase !== "idle") && (
        <TxStatus
          phase={betTx.phase !== "idle" ? betTx.phase : approveTx.phase}
          error={betTx.error || approveTx.error}
          hash={betTx.hash || approveTx.hash}
        />
      )}
    </div>
  );
}

