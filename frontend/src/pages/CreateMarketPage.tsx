import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount, useReadContract } from "wagmi";
import { CATEGORIES, CATEGORY_ICON, IS_DEMO_MODE, MARKET_ABI, MARKET_ADDRESS, isDeploymentConfigured } from "../config/contracts";
import { createCampusMarket } from "../config/campusMarkets";
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
    query: { enabled: !IS_DEMO_MODE && isDeploymentConfigured },
  });
  const isOwner = IS_DEMO_MODE || (!!address && !!owner && (owner as string).toLowerCase() === address.toLowerCase());

  const [question, setQuestion] = useState("Who wins IITD Inter-Hostel Cricket Final?");
  const [options, setOptions] = useState(["Himadri", "Karakoram", "Jwalamukhi"]);
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [closeTimeLocal, setCloseTimeLocal] = useState(defaultCloseTimeLocal());
  const createTx = useTx();

  if (!isDeploymentConfigured) return null;

  if (!IS_DEMO_MODE) {
    if (!isConnected) {
      return (
        <div className="empty-state-card">
          <h3>Wallet Required</h3>
          <p>Please connect your wallet to create a new market.</p>
        </div>
      );
    }
    if (!isOwner) {
      return (
        <div className="empty-state-card">
          <h3>Admin Restricted</h3>
          <p>Only the designated contract owner can initialize new prediction markets.</p>
        </div>
      );
    }
  }

  function updateOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const closeTime = BigInt(Math.floor(new Date(closeTimeLocal).getTime() / 1000));
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);

    if (cleanOptions.length < 2) {
      alert("Please provide at least 2 valid competing options.");
      return;
    }

    if (IS_DEMO_MODE) {
      const newId = createCampusMarket(question.trim(), cleanOptions, category, closeTime);
      navigate(`/market/${newId}`);
      return;
    }

    const hash = await createTx.send({
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "createMarket",
      args: [question.trim(), cleanOptions, closeTime, category],
    });
    if (hash) {
      setTimeout(() => navigate("/"), 1200);
    }
  }

  return (
    <div className="create-page-view">
      <div className="detail-breadcrumb">
        <button type="button" className="breadcrumb-back" onClick={() => navigate("/")}>
          <span className="breadcrumb-arrow">&larr;</span> Back to Markets
        </button>
      </div>

      <div className="create-page-header">
        <h1 className="create-page-title">Create Prediction Market</h1>
        <p className="create-page-subtitle">
          Launch a new pari-mutuel prediction market for campus competitions, sports tournaments, or student elections.
        </p>
      </div>

      <form className="create-form" onSubmit={handleCreate}>
        {/* Section 1: Question */}
        <div className="create-card">
          <div className="create-card__header">
            <h3 className="create-card__title">1. Market Question</h3>
            <span className="create-card__helper">State the exact outcome to be predicted</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="market-question">
              Question Title
            </label>
            <input
              id="market-question"
              className="form-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Which hostel will win the BRCA Dance Trophy?"
              required
            />
            <span className="form-caption">
              Tip: Keep it concise, binary or multi-hostel, with clear criteria.
            </span>
          </div>
        </div>

        {/* Section 2: Category */}
        <div className="create-card">
          <div className="create-card__header">
            <h3 className="create-card__title">2. Category</h3>
            <span className="create-card__helper">Choose the appropriate campus event category</span>
          </div>

          <div className="category-selection-grid">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`category-pill ${category === c ? "category-pill--active" : ""}`}
                onClick={() => setCategory(c)}
              >
                <span className="category-pill__icon">{CATEGORY_ICON[c]}</span>
                <span>{c}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Section 3: Competing Outcomes */}
        <div className="create-card">
          <div className="create-card__header">
            <h3 className="create-card__title">3. Competing Outcomes / Hostels</h3>
            <span className="create-card__helper">Add between 2 and 8 competing options</span>
          </div>

          <div className="options-inputs-list">
            {options.map((option, i) => (
              <div className="option-input-row" key={i}>
                <span className="option-number-badge">{i + 1}</span>
                <input
                  className="form-input"
                  value={option}
                  onChange={(e) => updateOption(i, e.target.value)}
                  placeholder={`Option ${i + 1} (e.g. Hostel Name)`}
                  required
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    className="btn-remove-option"
                    title="Remove this option"
                    onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="option-actions-row">
            {options.length < 8 && (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setOptions((prev) => [...prev, ""])}
              >
                + Add Option
              </button>
            )}
          </div>
        </div>

        {/* Section 4: Resolution Time */}
        <div className="create-card">
          <div className="create-card__header">
            <h3 className="create-card__title">4. Market Close Time</h3>
            <span className="create-card__helper">Stakes lock when this deadline is reached</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="close-time">
              Closes At (Local Time)
            </label>
            <input
              id="close-time"
              type="datetime-local"
              className="form-input"
              value={closeTimeLocal}
              onChange={(e) => setCloseTimeLocal(e.target.value)}
              required
            />
            <span className="form-caption">
              Predictions will automatically close at this timestamp prior to result announcement.
            </span>
          </div>
        </div>

        {/* Submit Action */}
        <div className="create-form-actions">
          <button
            className="btn btn--primary btn--large"
            type="submit"
            disabled={createTx.phase === "signing" || createTx.phase === "confirming"}
          >
            Launch Prediction Market &rarr;
          </button>
        </div>

        <TxStatus phase={createTx.phase} error={createTx.error} hash={createTx.hash} />
      </form>
    </div>
  );
}

