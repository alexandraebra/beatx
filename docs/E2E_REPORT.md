# BeatX verification report

## Local market and claim simulator — this branch

This change adds local-only market creation, demo picks, result simulation, and separate claim previews for winners, market creators, and the platform treasury. It does **not** add live Devnet markets, wallet signing, API writes, or BEATX transfers. All custom markets, demo positions, simulated fees, and claim flags stay in this browser's `localStorage`.

- `npm run typecheck`: **PASS**.
- `npm test`: **PASS**, 15 tests total, including exact base-unit settlement conservation, fee distribution, rounding, and invalid-pool rejection.
- `npm run e2e:demo`: **PASS** for the existing API lifecycle suite (market lifecycle, resolver protection, evidence validation, and claim controls).
- `npm run build`: **PASS**; Vite production assets built and `dist/CNAME` contains `beatx.world`. Current main bundle: 343.96 kB / 108.83 kB gzip.
- `node --check tests/e2e-solana.mjs`: **PASS**.
- Manual browser smoke on the production preview: created a local two-outcome market, saved a 5 BEATX hypothetical pick, simulated a result, and claimed the displayed winner, creator, and platform amounts. Reload confirmed the market, pick status, and claimed totals persisted locally. No wallet signature or transaction was used.
- Example simulation: 1,005 BEATX total fictional pool; 20.1 BEATX creator fee; 30.150001 BEATX platform fee (including one base unit of rounding dust); 9.45297 BEATX local winner payout. The sample participants receive the rest of the winner pool. This is a UI demonstration, not a protocol fee policy or live economic result.

## Wallet and network boundaries

- The wallet control remains optional and read-only. It can inspect a public address and Devnet SOL balance; it does not sign or send transactions.
- Demo picks and claims are independent from any connected wallet.
- There are **no live markets on Devnet** from this preview. Fixture market volumes, participant counts, sample liquidity, and outcome distributions are fictional.

## Existing Solana program status

This UI change does not modify the Anchor program. The previous source review and host Rust tests/checks are not evidence of an SBF artifact or production deployment. The legacy Devnet program at `F852vVx3c4jPKY6VVMRU4CUVhqh5iX79ZRokwKYAu18h` is not the Token-2022 migration. An Anchor/SBF artifact build and its binary-size measurement remain unverified; the Devnet transaction E2E script was not run for the migrated program.

## Remaining release gates

1. Install a compatible Anchor/Solana SBF toolchain; build the default mint-enforced artifact and measure its actual program binary size.
2. Build and deploy the acknowledged `devnet-test-mint` fixture artifact **only on Devnet**, then run the updated transaction E2E suite with controlled test wallets.
3. Review the generated IDL and account layouts against the SBF artifact; pin/review the artifact and IDL together.
4. Complete an independent security review, including resolver policy, authority, fee destinations, cancellation/refund, and token-extension assumptions.
5. Choose a separate Mainnet program ID and deploy a Mainnet artifact without the test feature; only then implement and audit real wallet-signed UI flows and claim instructions.
6. Recheck GitHub Pages DNS/certificate status for `beatx.world`; enforce HTTPS only after GitHub marks the certificate ready.
