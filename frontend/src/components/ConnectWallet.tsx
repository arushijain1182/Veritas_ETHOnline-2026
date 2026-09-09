import { useAccount, useConnect, useDisconnect } from "wagmi";
import { formatAddress } from "../lib/format";

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="connect-wallet">
        <span className="connect-wallet__address">{formatAddress(address)}</span>
        <button className="btn btn--ghost" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  const injectedConnector = connectors.find((c) => c.id === "injected") ?? connectors[0];

  return (
    <button
      className="btn btn--primary"
      disabled={!injectedConnector || isPending}
      onClick={() => injectedConnector && connect({ connector: injectedConnector })}
    >
      {isPending ? "Connecting..." : injectedConnector ? "Connect Wallet" : "No wallet found"}
    </button>
  );
}
