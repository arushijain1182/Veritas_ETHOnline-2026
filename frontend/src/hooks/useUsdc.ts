import { useAccount, useBalance, useReadContract } from "wagmi";
import { IS_DEMO_MODE, MARKET_ADDRESS, USDC_ABI, USDC_ADDRESS } from "../config/contracts";

/** Connected user's USDC balance + allowance for the Market contract. */
export function useUsdc() {
  const { address } = useAccount();

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !IS_DEMO_MODE && !!address },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: address ? [address, MARKET_ADDRESS] : undefined,
    query: { enabled: !IS_DEMO_MODE && !!address },
  });

  const { data: ethBalance } = useBalance({
    address,
    query: { enabled: !IS_DEMO_MODE && !!address },
  });

  return {
    usdcBalance: IS_DEMO_MODE ? 1000n * 1_000_000n : ((balance as bigint | undefined) ?? 0n),
    allowance: IS_DEMO_MODE ? 1_000_000n * 1_000_000n : ((allowance as bigint | undefined) ?? 0n),
    ethBalance: ethBalance?.value ?? 0n,
    refetch: () => {
      if (!IS_DEMO_MODE) {
        refetchBalance();
        refetchAllowance();
      }
    },
  };
}
