import { useAccount, useConnect, useDisconnect } from "wagmi";
import { formatAddress } from "../lib/format";

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="wallet-pill">
        <span className="wallet-pill__dot" />
        <span className="wallet-pill__address">{formatAddress(address)}</span>
        <button
          type="button"
          className="wallet-pill__disconnect"
          onClick={() => disconnect()}
          title="Disconnect wallet"
        >
          Disconnect
        </button>
      </div>
    );
  }

  const injectedConnector = connectors.find((c) => c.id === "injected") ?? connectors[0];

  return (
    <button
      className="btn btn--wallet"
      disabled={!injectedConnector || isPending}
      onClick={() => injectedConnector && connect({ connector: injectedConnector })}
    >
      {isPending ? "Connecting..." : injectedConnector ? "Connect Wallet" : "No wallet"}
    </button>
  );
}
