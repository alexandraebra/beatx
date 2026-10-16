# BeatX verification report

## Verification for this branch

- The public UI is a client-side sample preview. It creates no live Devnet markets and never signs/sends transactions. Optional Wallet Standard/MWA connection reads an address and Devnet SOL balance only; demo picks stay in browser `localStorage` and are not wallet-backed.
- `npm run typecheck`: **PASS**.
- `npm test`: **PASS**, 12 tests (including fail-closed evidence validation and highest-single-confidence outcome selection).
- `npm run e2e:demo`: **PASS**, including market lifecycle, protected resolver, owner-checked claims, double-claim rejection, and localhost CORS preflight.
- `npm run build`: **PASS**; production Vite bundle built, `dist/CNAME` contains `beatx.world`, the wallet identity icon is present, and the JS bundle is 104.35 KiB gzip.
- `npm audit --omit=dev`: **PASS**, zero reported production vulnerabilities after safe non-breaking updates.
- `node --check tests/e2e-solana.mjs`: **PASS**.
- Host Rust `cargo test --locked -p beatx`: **PASS** with the exact Anchor 0.31.1 lockfile in default mint-enforced mode and in `devnet-test-mint` mode with its explicit build acknowledgment.
- Host Rust `cargo check --locked -p beatx`: **PASS** in both modes; a negative check confirmed the fixture feature is refused without the explicit acknowledgment.
- Manual browser smoke: with no wallet installed, the `Connect wallet` control showed install/mobile guidance. A temporary Wallet Standard mock then connected, fetched the public Devnet balance, displayed the address, and disconnected; no signing feature was supplied or called. The modal was checked to remain fully visible. A real wallet/app was not available in this sandbox, so actual extension authorization and Android/iOS handoff remain to be checked on-device. Demo picks remain local and independent of the wallet flow.

## External state checked

- Mainnet RPC confirms the official BEATX mint is Token-2022 with 6 decimals, revoked mint/freeze authorities, and metadata-only extensions (no transfer-fee or transfer-hook extension reported).
- Current Mainnet rent-exemption quotes: 343 bytes = 2,392,680 lamports; 583 bytes = 3,611,880 lamports. The 240-byte saving is 1,219,200 lamports (0.001219200 SOL) per two-outcome market under the queried rent parameters.
- GitHub Pages is configured for `beatx.world`, and the repository carries `public/CNAME`. Public DNS now resolves the apex to all four GitHub Pages A records and `www` to `alexandraebra.github.io`. GitHub reports certificate state `dns_changed` and `https_enforced: false`; HTTPS is not ready yet and must be rechecked after deployment.

## Solana migration status

The old Devnet program at `F852vVx3c4jPKY6VVMRU4CUVhqh5iX79ZRokwKYAu18h` is a legacy deployment, not this Token-2022 migration. The updated Solana E2E script now verifies the official Devnet genesis hash, the expected program ID, the IDL method set, and Upgradeable Loader/ProgramData account formats before loading test wallets or sending transactions.

An Anchor/SBF artifact build and its binary-size measurement are **not yet verified**. `anchor` and the Solana SBF tools were unavailable; installing Anchor CLI 0.31.1 stalled on crates.io TLS/network failures, so no SBF artifact was produced. The Devnet E2E transaction script was not run; it requires separately prepared funded test wallets, a generated IDL, and an explicit fixture-feature build.

## Remaining release gates

1. Install a compatible Anchor/Solana SBF toolchain; build the default mint-enforced artifact and measure its actual program binary size.
2. Build and deploy the acknowledged `devnet-test-mint` fixture artifact **only on Devnet**, then run the updated transaction E2E suite with controlled test wallets.
3. Review the generated IDL and account layouts against the SBF artifact; pin/review the artifact and IDL together.
4. Complete an independent security review, including resolver policy, authority, fee destinations, and token-extension assumptions.
5. Choose a separate Mainnet program ID and deploy a Mainnet artifact without the test feature; only then connect real wallet-signed UI flows.
6. Add the GitHub Pages DNS records, wait for certificate readiness, enable HTTPS, and verify the domain after an approved merge to `main`.
