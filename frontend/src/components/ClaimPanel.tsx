import { useAccount } from "wagmi";
import { MARKET_ABI, MARKET_ADDRESS } from "../config/contracts";
import { useTx } from "../hooks/useTx";
import type { MarketDetail } from "../hooks/useMarket";
import { formatUsdc } from "../lib/format";
import { TxStatus } from "./TxStatus";

export function ClaimPanel({ market, onDone }: { market: MarketDetail; onDone: () => void }) {
  const { isConnected } = useAccount();
  const claimTx = useTx();

  const winningOption = Number(market.winningOption);
  const yourContribution = market.userContributions[winningOption] ?? 0n;
  const canClaim = isConnected && !market.claimed && market.previewClaim > 0n;

  async function handleClaim() {
    await claimTx.send({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "claim",
      args: [BigInt(market.id)],
    });
    onDone();
  }

  return (
    <div className="claim-panel">
      <h2 className="claim-panel__title">Market Resolved</h2>
      <p className="claim-panel__winner">
        Winner: <strong>{market.options[winningOption]}</strong>
      </p>

      <dl className="claim-panel__breakdown">
        <div>
          <dt>Total pool</dt>
          <dd>{formatUsdc(market.totalPool)}</dd>
        </div>
        <div>
          <dt>Platform fee (10%)</dt>
          <dd>{formatUsdc(market.platformFee)}</dd>
        </div>
        <div>
          <dt>Winner pool (90%)</dt>
          <dd>{formatUsdc(market.prizePool)}</dd>
        </div>
      </dl>

      {isConnected && (
        <dl className="claim-panel__breakdown claim-panel__breakdown--you">
          <div>
            <dt>Your contribution</dt>
            <dd>{formatUsdc(yourContribution)}</dd>
          </div>
          <div>
            <dt>Your payout</dt>
            <dd>{formatUsdc(market.previewClaim)}</dd>
          </div>
        </dl>
      )}

      {!isConnected ? (
        <p className="empty-state">Connect your wallet to check your payout.</p>
      ) : market.claimed ? (
        <p className="empty-state">Already claimed.</p>
      ) : market.previewClaim === 0n ? (
        <p className="empty-state">You didn't back the winning option.</p>
      ) : (
        <button
          className="btn btn--primary"
          disabled={!canClaim || claimTx.phase === "signing" || claimTx.phase === "confirming"}
          onClick={handleClaim}
        >
          Claim {formatUsdc(market.previewClaim)}
        </button>
      )}

      <TxStatus phase={claimTx.phase} error={claimTx.error} hash={claimTx.hash} />
    </div>
  );
}
