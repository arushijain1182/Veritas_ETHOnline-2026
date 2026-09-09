import { useCallback, useEffect, useState } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { Address } from "viem";

export type TxPhase = "idle" | "signing" | "confirming" | "confirmed" | "error";

/** Wraps a single contract write with the status the brief's "transaction
 * status" UI element needs: idle -> signing (wallet prompt) -> confirming
 * (submitted, waiting for a block) -> confirmed | error. */
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | null>(null);

  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  const send = useCallback(
    async (args: {
      address: Address;
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
      value?: bigint;
    }) => {
      setError(null);
      setPhase("signing");
      try {
        const txHash = await writeContractAsync(args as never);
        setHash(txHash);
        setPhase("confirming");
        return txHash;
      } catch (err) {
        setPhase("error");
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [writeContractAsync]
  );

  useEffect(() => {
    if (isSuccess && phase === "confirming") {
      setPhase("confirmed");
    }
  }, [isSuccess, phase]);

  const reset = useCallback(() => {
    setPhase("idle");
    setHash(undefined);
    setError(null);
  }, []);

  return { send, phase, hash, error, reset };
}
