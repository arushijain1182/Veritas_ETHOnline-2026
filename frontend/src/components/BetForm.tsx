import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { MARKET_ABI, MARKET_ADDRESS, USDC_ABI, USDC_ADDRESS } from "../config/contracts";
import { useTx } from "../hooks/useTx";
import { useUsdc } from "../hooks/useUsdc";
import { formatUsdc, parseUsdc } from "../lib/format";
import { TxStatus } from "./TxStatus";

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
  const approveTx = useTx();
  const betTx = useTx();

  const amount = parseUsdc(amountStr);
  const needsApproval = amount > 0n && allowance < amount;
  const insufficientBalance = amount > usdcBalance;
  // Once the bet tx has started, show its status; until then, show approve's
  // (including "confirmed" — flipping to betTx the instant approve confirms
  // would hide that confirmation before the user ever sees it, since betTx
  // is still idle at that point).
  const activeTx = betTx.phase !== "idle" ? betTx : approveTx;

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
    await betTx.send({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "placeBet",
      args: [BigInt(marketId), BigInt(option), amount],
    });
    setAmountStr("");
    refetch();
    onDone();
  }

  return (
    <div className="bet-form">
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

      <label className="bet-form__amount">
        <span>Amount (USDC)</span>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
        />
      </label>

      <p className="bet-form__balance">Your balance: {formatUsdc(usdcBalance)}</p>

      {!isConnected ? (
        <p className="empty-state">Connect your wallet to place a prediction.</p>
      ) : needsApproval ? (
        <button className="btn btn--primary" disabled={amount === 0n || approveTx.phase === "signing" || approveTx.phase === "confirming"} onClick={handleApprove}>
          Approve USDC
        </button>
      ) : (
        <button
          className="btn btn--primary"
          disabled={amount === 0n || insufficientBalance || betTx.phase === "signing" || betTx.phase === "confirming"}
          onClick={handleBet}
        >
          {insufficientBalance ? "Insufficient balance" : `Place Prediction on ${options[option]}`}
        </button>
      )}

      <p className="bet-form__terms">
        By predicting, you agree to the <Link to="/terms">Terms &amp; Economic Mechanics</Link>.
      </p>

      <TxStatus phase={activeTx.phase} error={activeTx.error} hash={activeTx.hash} />
    </div>
  );
}
