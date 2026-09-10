import { useState } from "react";
import { Link } from "react-router-dom";
import { parseEther } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { IS_DEMO_MODE, MARKET_ABI, MARKET_ADDRESS } from "../config/contracts";
import { useTx } from "../hooks/useTx";
import { useUsdc } from "../hooks/useUsdc";
import { formatUsdc } from "../lib/format";
import { TxStatus } from "./TxStatus";

const SLIPPAGE_BPS = 100n; // 1%

/** Stage 6 Uniswap MVP: obtain the settlement asset (USDC) via a real
 * Uniswap V2 swap, gated directly behind placing a bet rather than a
 * standalone swap widget. */
export function SwapBetForm({
  marketId,
  options,
  onDone,
}: {
  marketId: number;
  options: string[];
  onDone: () => void;
}) {
  const { isConnected } = useAccount();
  const { ethBalance, refetch } = useUsdc();
  const [option, setOption] = useState(0);
  const [ethAmountStr, setEthAmountStr] = useState("");
  const swapBetTx = useTx();

  let ethAmount = 0n;
  try {
    ethAmount = ethAmountStr ? parseEther(ethAmountStr) : 0n;
  } catch {
    ethAmount = 0n;
  }

  const { data: quote } = useReadContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "quoteETHForUSDC",
    args: [ethAmount],
    query: { enabled: !IS_DEMO_MODE && ethAmount > 0n },
  });

  const quotedUsdc = (quote as bigint | undefined) ?? 0n;
  const minUsdcOut = quotedUsdc > 0n ? (quotedUsdc * (10000n - SLIPPAGE_BPS)) / 10000n : 0n;
  const insufficientBalance = ethAmount > ethBalance;

  async function handleSwapAndBet() {
    if (IS_DEMO_MODE) return;
    await swapBetTx.send({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "placeBetWithETH",
      args: [BigInt(marketId), BigInt(option), minUsdcOut],
      value: ethAmount,
    });
    setEthAmountStr("");
    refetch();
    onDone();
  }

  if (IS_DEMO_MODE) {
    return (
      <div className="bet-form">
        <p className="bet-form__hint" style={{ color: "var(--color-primary-light, #38bdf8)" }}>
          ℹ️ <strong>Campus Demo Mode:</strong> Uniswap V2 live on-chain swaps are disabled in demo mode.
        </p>
        <p style={{ fontSize: "0.9rem", color: "var(--color-text-dim)", lineHeight: "1.5" }}>
          Please switch to the <strong>Direct USDC Prediction</strong> tab above to simulate an investment directly with campus markets.
        </p>
      </div>
    );
  }

  return (
    <div className="bet-form">
      <p className="bet-form__hint">Obtain USDC via Uniswap and bet it in one transaction.</p>
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
        <span>Amount (ETH)</span>
        <input
          type="number"
          min="0"
          step="0.001"
          placeholder="0.00"
          value={ethAmountStr}
          onChange={(e) => setEthAmountStr(e.target.value)}
        />
      </label>

      {ethAmount > 0n && (
        <p className="bet-form__quote">
          ≈ {formatUsdc(quotedUsdc)} via Uniswap V2 (min {formatUsdc(minUsdcOut)} after 1% slippage)
        </p>
      )}

      {!isConnected ? (
        <p className="empty-state">Connect your wallet to swap and bet.</p>
      ) : (
        <button
          className="btn btn--secondary"
          disabled={ethAmount === 0n || insufficientBalance || swapBetTx.phase === "signing" || swapBetTx.phase === "confirming"}
          onClick={handleSwapAndBet}
        >
          {insufficientBalance ? "Insufficient ETH balance" : `Swap ETH -> USDC & Bet on ${options[option]}`}
        </button>
      )}

      <p className="bet-form__terms">
        By predicting, you agree to the <Link to="/terms">Terms &amp; Economic Mechanics</Link>.
      </p>

      <TxStatus phase={swapBetTx.phase} error={swapBetTx.error} hash={swapBetTx.hash} />
    </div>
  );
}
