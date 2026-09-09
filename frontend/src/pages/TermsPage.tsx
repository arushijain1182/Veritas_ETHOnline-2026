import { Link } from "react-router-dom";

export function TermsPage() {
  return (
    <div className="terms-page">
      <Link to="/" className="back-link">
        &larr; Back to Markets
      </Link>

      <div className="terms-page__header">
        <h1>Terms, Conditions & Economic Mechanics</h1>
        <p className="terms-page__subtitle">
          Protocol operational terms, mathematical specifications, and risk disclosures for the Veritas / IITD Markets
          prediction platform.
        </p>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 1: PROTOCOL OVERVIEW */}
      {/* ------------------------------------------------------------- */}
      <section className="terms-section">
        <h2>1. Protocol Overview</h2>
        <p>
          Veritas (IITD Markets) is a decentralized, non-custodial pari-mutuel prediction market platform deployed on
          EVM-compatible blockchains. The protocol enables participants to allocate capital toward discrete competition
          outcomes (e.g., inter-hostel sports, cultural, and academic events) using <strong>USDC</strong> as the base
          settlement currency.
        </p>
        <p>
          All operations—including market creation, prediction staking, liquidity provisioning, secondary AMM trading,
          oracle resolution, and payout distribution—are executed transparently on-chain via smart contracts without
          intermediaries.
        </p>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 2: MATHEMATICAL & ECONOMIC MECHANICS */}
      {/* ------------------------------------------------------------- */}
      <section className="terms-section">
        <h2>2. Mathematical & Economic Mechanics</h2>
        <p>
          Veritas utilizes a <strong>pari-mutuel pooling model</strong>. Unlike fixed-odds bookmaking, odds are not set
          by an intermediary; instead, returns are determined organically by the total proportion of funds staked on
          each respective outcome.
        </p>

        <div className="terms-card">
          <h3>2.1. Total Staked Pool</h3>
          <p>
            For any market with \(N\) options, where \(Pool_i\) represents the total USDC contributed toward option
            \(i\), the total market pool is the exact sum of all option stakes:
          </p>
          <div className="math-box">
            <code>TotalPool = &sum; (Pool_i) for i = 0 to N - 1</code>
          </div>
        </div>

        <div className="terms-card">
          <h3>2.2. Fee Deductions & Prize Pool Allocation</h3>
          <p>
            Upon market resolution, the protocol applies a fixed <strong>10.00% platform fee</strong> (
            <code>PLATFORM_FEE_BPS = 1000</code> basis points, where 10,000 basis points equals 100%).
          </p>
          <div className="math-box">
            <code>PlatformFee = (TotalPool &times; 1000) / 10000 = 10% &times; TotalPool</code>
            <br />
            <code>PrizePool = TotalPool - PlatformFee = 90% &times; TotalPool</code>
          </div>
          <p>
            The 10% platform fee is transferred directly to the protocol fee recipient address upon resolution to fund
            infrastructure, maintenance, and student event sponsorships. The remaining <strong>90% Prize Pool</strong> is
            strictly reserved for proportional distribution to winning stake holders.
          </p>
        </div>

        <div className="terms-card">
          <h3>2.3. OutcomeToken Minting (1:1 ERC-20 Position Tokens)</h3>
          <p>
            When a participant stakes USDC via <code>placeBet</code> or swaps ETH into USDC via{" "}
            <code>placeBetWithETH</code>, the contract mints transferable ERC-20 <strong>OutcomeTokens</strong> (6
            decimals, matching USDC) directly to the bettor's address at a <strong>1:1 ratio</strong>:
          </p>
          <div className="math-box">
            <code>MintedTokens = USDC_AmountStaked</code>
          </div>
          <p>
            Each option in a market possesses its own discrete token contract (e.g., <code>HIMADRI-M1</code>). These
            tokens represent claimable bearer instruments on-chain.
          </p>
        </div>

        <div className="terms-card">
          <h3>2.4. Proportional Claim & Payout Formula</h3>
          <p>
            When a market resolves, any holder of the winning option's OutcomeTokens is entitled to a proportional share
            of the 90% Prize Pool. The claim formula is computed on-chain as:
          </p>
          <div className="math-box">
            <code>Payout = (UserTokenBalance &times; PrizePool) / WinningOptionPool</code>
          </div>
          <p>
            <strong>Burn Mechanism:</strong> Upon calling <code>claim()</code>, the smart contract automatically{" "}
            <strong>burns</strong> 100% of the caller's winning OutcomeTokens before releasing the USDC payout. This
            guarantees:
          </p>
          <ul>
            <li>
              <strong>Double-Claim Immunity:</strong> Once burned, a caller holds 0 tokens and cannot claim again.
            </li>
            <li>
              <strong>No-Lockout Flexibility:</strong> If a user acquires additional winning tokens subsequent to a
              partial claim, those newly acquired tokens remain fully redeemable.
            </li>
          </ul>
        </div>

        <div className="terms-card terms-card--example">
          <h3>2.5. Worked Numerical Example</h3>
          <p>Consider an inter-hostel match between <strong>Himadri</strong> and <strong>Karakoram</strong>:</p>
          <table className="terms-table">
            <thead>
              <tr>
                <th>Outcome</th>
                <th>Total Staked (USDC)</th>
                <th>Implied Probability</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Himadri</td>
                <td>700 USDC</td>
                <td>70.0%</td>
              </tr>
              <tr>
                <td>Karakoram</td>
                <td>300 USDC</td>
                <td>30.0%</td>
              </tr>
              <tr className="terms-table__total">
                <td><strong>Total Pool</strong></td>
                <td><strong>1,000 USDC</strong></td>
                <td><strong>100.0%</strong></td>
              </tr>
            </tbody>
          </table>

          <p>Upon resolution with <strong>Himadri</strong> winning:</p>
          <ol>
            <li>
              <strong>Platform Fee (10%):</strong> <code>1,000 &times; 0.10 = 100 USDC</code>
            </li>
            <li>
              <strong>Net Prize Pool (90%):</strong> <code>1,000 - 100 = 900 USDC</code>
            </li>
            <li>
              <strong>Bettor Alice:</strong> Holds 100 HIMADRI-M1 tokens (original stake of 100 USDC).
              <div className="math-box">
                <code>Alice Payout = (100 &times; 900) / 700 &asymp; 128.57 USDC</code>
              </div>
              <em>Alice receives 128.57 USDC, realizing a net profit of +28.57 USDC (+28.57% net return).</em>
            </li>
            <li>
              <strong>Losing Backers:</strong> Backers of Karakoram receive 0 USDC. Their staked funds comprise the
              winnings redistributed to the winning pool.
            </li>
          </ol>
        </div>

        <div className="terms-card">
          <h3>2.6. Secondary Market Trading on Uniswap V2</h3>
          <p>
            Because each market option deploys a native ERC-20 OutcomeToken and creates an automated market maker (AMM)
            pair against USDC on Uniswap V2, positions can be traded prior to market closing:
          </p>
          <ul>
            <li>
              <strong>Early Exits & Hedging:</strong> A participant can sell their OutcomeTokens into the Uniswap pair
              for USDC before the match concludes to lock in profit or mitigate potential losses.
            </li>
            <li>
              <strong>Secondary Entry:</strong> Anyone can buy OutcomeTokens directly on Uniswap without interacting
              with <code>placeBet()</code>.
            </li>
            <li>
              <strong>Token Possession Governs Payout:</strong> Payouts are paid strictly to the account that holds
              and burns the winning OutcomeTokens at claim time, <em>not</em> to the initial depositor.
            </li>
          </ul>
        </div>

        <div className="terms-card">
          <h3>2.7. Gas-Flat Pull Payout Architecture</h3>
          <p>
            The protocol enforces a <strong>pull-payment architecture</strong>. The contract never loops over winner
            addresses. Regardless of whether a market has 2 or 20,000 stakers, resolution and individual claims consume
            constant \(O(1)\) gas, eliminating vulnerability to out-of-gas (DoS) vulnerabilities.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 3: PROTOCOL TERMS & CONDITIONS */}
      {/* ------------------------------------------------------------- */}
      <section className="terms-section">
        <h2>3. Protocol Terms & Conditions</h2>
        <div className="terms-rules">
          <div className="terms-rule">
            <h4>3.1. Finality of Predictions</h4>
            <p>
              All prediction transactions (whether via direct USDC approval or Uniswap ETH swap) are non-refundable and
              irreversible once mined into a block. Users cannot cancel or withdraw staked funds prior to resolution
              except by selling position tokens on secondary AMM markets.
            </p>
          </div>

          <div className="terms-rule">
            <h4>3.2. Market Closing & Cutoff Enforcement</h4>
            <p>
              Each market specifies an immutable <code>closeTime</code> timestamp. Once the block timestamp reaches or
              surpasses this threshold, all subsequent betting calls immediately revert. Any participant may trigger{" "}
              <code>closeMarket()</code> once the closing timestamp has passed.
            </p>
          </div>

          <div className="terms-rule">
            <h4>3.3. Oracle Resolution via Chainlink CRE</h4>
            <p>
              Market outcomes are resolved on-chain through the <strong>Chainlink Runtime Environment (CRE)</strong>.
              Resolution reports are attested by a Decentralized Oracle Network (DON) using cryptographic signatures and
              confidential Trusted Execution Environments (TEEs). Once resolved on-chain, the winning option is
              strictly immutable and permanent.
            </p>
          </div>

          <div className="terms-rule">
            <h4>3.4. Secondary Market Token Responsibility</h4>
            <p>
              OutcomeTokens traded on Uniswap V2 are subject to market slippage, pool depth, and impermanent loss for
              liquidity providers. Veritas does not guarantee liquidity on secondary pairs. Users assume full
              responsibility for managing their private keys and token custody.
            </p>
          </div>

          <div className="terms-rule">
            <h4>3.5. Unclaimed Payouts & Indefinite Redemption</h4>
            <p>
              Payouts are not automatically deposited to user wallets. Winners must explicitly initiate an on-chain{" "}
              <code>claim()</code> transaction. Unclaimed prize pool allocations remain securely escrowed in the smart
              contract and do not expire.
            </p>
          </div>

          <div className="terms-rule">
            <h4>3.6. Platform Fee Collection</h4>
            <p>
              The 10% platform fee is automatically deducted from the total staked pool at the exact moment of resolution
              and transferred to the designated protocol fee recipient. Participants explicitly consent to this
              deduction when submitting predictions.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 4: RISK DISCLAIMERS & COMPLIANCE */}
      {/* ------------------------------------------------------------- */}
      <section className="terms-section">
        <h2>4. Risk Disclaimers & Compliance</h2>
        <div className="terms-alert">
          <strong>Notice:</strong> Veritas is experimental, open-source software built for educational, research, and
          demonstration purposes during hackathons and campus initiatives.
        </div>
        <ul className="terms-disclaimers">
          <li>
            <strong>Smart Contract Risk:</strong> While contracts have undergone comprehensive testing, smart contracts
            are subject to unforeseen vulnerabilities, network forks, and EVM execution risks. Use at your own risk.
          </li>
          <li>
            <strong>No Financial Advice:</strong> Veritas does not provide investment, financial, or trading advice.
            Prediction markets represent speculative mechanisms where you may lose up to 100% of your staked capital.
          </li>
          <li>
            <strong>Slippage on ETH Swaps:</strong> When utilizing <code>placeBetWithETH</code>, the final USDC staked
            depends on prevailing Uniswap V2 liquidity and exchange rates. Users must set appropriate slippage
            tolerances (<code>minUSDCOut</code>) to protect against frontrunning and price movements.
          </li>
          <li>
            <strong>Regulatory Compliance:</strong> Users are solely responsible for ensuring that their access to and
            interaction with Veritas complies with all applicable campus codes of conduct, local statutes, and
            jurisdictional regulations.
          </li>
        </ul>
      </section>
    </div>
  );
}
