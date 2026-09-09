import type { TxPhase } from "../hooks/useTx";

const MESSAGE: Record<TxPhase, string | null> = {
  idle: null,
  signing: "Confirm the transaction in your wallet...",
  confirming: "Transaction submitted, waiting for confirmation...",
  confirmed: "Confirmed.",
  error: null,
};

export function TxStatus({ phase, error, hash }: { phase: TxPhase; error: string | null; hash?: `0x${string}` }) {
  if (phase === "idle") return null;

  return (
    <div className={`tx-status tx-status--${phase}`}>
      {phase === "error" ? <span>{error ?? "Transaction failed."}</span> : <span>{MESSAGE[phase]}</span>}
      {hash && (phase === "confirming" || phase === "confirmed") && (
        <span className="tx-status__hash" title={hash}>
          {hash.slice(0, 10)}...{hash.slice(-8)}
        </span>
      )}
    </div>
  );
}
