import { useAccount, useBalance, useReadContract } from "wagmi";
import { MARKET_ADDRESS, USDC_ABI, USDC_ADDRESS } from "../config/contracts";

/** Connected user's USDC balance + allowance for the Market contract. */
export function useUsdc() {
  const { address } = useAccount();

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, MARKET_ADDRESS] : undefined,
    query: { enabled: !!address },
  });

  const { data: ethBalance } = useBalance({ address });

  return {
    usdcBalance: (balance as bigint | undefined) ?? 0n,
    allowance: (allowance as bigint | undefined) ?? 0n,
    ethBalance: ethBalance?.value ?? 0n,
    refetch: () => {
      refetchBalance();
      refetchAllowance();
    },
  };
}
