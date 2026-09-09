import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount, useReadContract } from "wagmi";
import { MARKET_ABI, MARKET_ADDRESS, isDeploymentConfigured } from "../config/contracts";
import { useTx } from "../hooks/useTx";
import { TxStatus } from "../components/TxStatus";

function defaultCloseTimeLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000); // +1h
  d.setSeconds(0, 0);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
}

export function CreateMarketPage() {
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const { data: owner } = useReadContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "owner",
    query: { enabled: isDeploymentConfigured },
  });
  const isOwner = !!address && !!owner && (owner as string).toLowerCase() === address.toLowerCase();

  const [question, setQuestion] = useState("Who wins IITD Inter-Hostel Cricket Final?");
  const [options, setOptions] = useState(["HIMADRI", "KARAKORAM"]);
  const [closeTimeLocal, setCloseTimeLocal] = useState(defaultCloseTimeLocal());
  const createTx = useTx();

  if (!isDeploymentConfigured) return null;

  if (!isConnected) {
    return <p className="empty-state">Connect your wallet to create a market.</p>;
  }
  if (!isOwner) {
    return <p className="empty-state">Only the market owner can create markets.</p>;
  }

  function updateOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const closeTime = BigInt(Math.floor(new Date(closeTimeLocal).getTime() / 1000));
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    const hash = await createTx.send({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "createMarket",
      args: [question.trim(), cleanOptions, closeTime],
    });
    if (hash) {
      setTimeout(() => navigate("/"), 1200);
    }
  }

  return (
    <form className="create-market" onSubmit={handleCreate}>
      <h1>New Market</h1>

      <label>
        <span>Question</span>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} required />
      </label>

      <fieldset>
        <legend>Options</legend>
        {options.map((option, i) => (
          <input key={i} value={option} onChange={(e) => updateOption(i, e.target.value)} required />
        ))}
        <div className="create-market__option-actions">
          <button type="button" className="btn btn--ghost" onClick={() => setOptions((prev) => [...prev, ""])}>
            + Option
          </button>
          {options.length > 2 && (
            <button type="button" className="btn btn--ghost" onClick={() => setOptions((prev) => prev.slice(0, -1))}>
              - Option
            </button>
          )}
        </div>
      </fieldset>

      <label>
        <span>Closes at</span>
        <input type="datetime-local" value={closeTimeLocal} onChange={(e) => setCloseTimeLocal(e.target.value)} required />
      </label>

      <button className="btn btn--primary" type="submit" disabled={createTx.phase === "signing" || createTx.phase === "confirming"}>
        Create Market
      </button>

      <TxStatus phase={createTx.phase} error={createTx.error} hash={createTx.hash} />
    </form>
  );
}
