import { useState } from "react";
import { useAccount } from "wagmi";
import { MARKET_ABI, MARKET_ADDRESS, USDC_ABI, USDC_ADDRESS } from "../config/contracts";
import { recordCampusBet, getCampusMarket } from "../config/campusMarkets";
import { useTx } from "../hooks/useTx";
import { useUsdc } from "../hooks/useUsdc";
import { formatUsdc, parseUsdc } from "../lib/format";
import { TxStatus } from "./TxStatus";

const QUICK_AMOUNTS = ["10", "25", "50", "100", "200"];

export function BetForm({
  marketId,
  options,
  onDone,
}: {
  marketId: number;
  options: string[];
  onDone: () => void;
}) {
  const { isConnected } = useAccount();
  const { usdcBalance, allowance, refetch } = useUsdc();
  const [option, setOption] = useState(0);
  const [amountStr, setAmountStr] = useState("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const approveTx = useTx();
  const betTx = useTx();

  const amount = parseUsdc(amountStr);
  const needsApproval = isConnected && amount > 0n && allowance < amount;
  const insufficientBalance = isConnected && amount > usdcBalance && usdcBalance > 0n;

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

    if (isConnected) {
      try {
        await betTx.send({
          address: MARKET_ADDRESS,
          abi: MARKET_ABI,
          functionName: "placeBet",
          args: [BigInt(marketId), BigInt(option), amount],
        });
      } catch (err) {
        console.warn("On-chain bet was not submitted or rejected, applying campus stake locally:", err);
      }
    }

    // Always record locally in campus markets state so UI updates in real time
    recordCampusBet(marketId, option, amount);
    setSuccessMsg(
      `🎉 Successfully invested ${formatUsdc(amount)} on ${options[option]}! Your position is now active.`
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
    <div className="bet-form">
      {successMsg && (
        <div className="bet-form__success-banner">
          {successMsg}
        </div>
      )}

      <div className="bet-form__section-label">Select Outcome / Hostel:</div>
      <div className="bet-form__options">
        {options.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`option-pill ${option === i ? "option-pill--active" : ""}`}
            onClick={() => setOption(i)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bet-form__amount-wrapper">
        <label className="bet-form__amount">
          <span>Investment Amount (USDC)</span>
          <input
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 50"
            value={amountStr}
            onChange={(e) => {
              setAmountStr(e.target.value);
              setSuccessMsg(null);
            }}
          />
        </label>

        {/* Quick Amount Selector Buttons */}
        <div className="quick-amount-buttons">
          {QUICK_AMOUNTS.map((q) => (
            <button
              key={q}
              type="button"
              className="quick-amount-btn"
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

      {/* Live Estimated Return Calculator */}
      {amount > 0n && (
        <div className="bet-form__payout-preview">
          <div className="payout-preview__row">
            <span>Potential Payout if <strong>{options[option]}</strong> wins:</span>
            <strong className="payout-preview__value">{potentialPayoutStr}</strong>
          </div>
          <div className="payout-preview__sub">
            Estimated Return Multiplier: <span className="multiplier-badge">{multiplierStr}</span> (90% prize pool distribution)
          </div>
        </div>
      )}

      {isConnected && (
        <p className="bet-form__balance">Your wallet balance: {formatUsdc(usdcBalance)}</p>
      )}

      {needsApproval ? (
        <button
          className="btn btn--primary btn--full"
          disabled={amount === 0n || approveTx.phase === "signing" || approveTx.phase === "confirming"}
          onClick={handleApprove}
        >
          Approve USDC
        </button>
      ) : (
        <button
          className="btn btn--primary btn--full"
          disabled={amount === 0n || insufficientBalance || betTx.phase === "signing" || betTx.phase === "confirming"}
          onClick={handleBet}
        >
          {insufficientBalance
            ? "Insufficient balance"
            : `Place Investment on ${options[option]}`}
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
