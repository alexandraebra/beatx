# BeatX continuation handoff

## Current preview behavior

- React/Vite is a client-side preview with searchable sample markets, category filters, and optional read-only wallet connection.
- Visitors can create local markets with two to four outcomes, save hypothetical BEATX picks, simulate a result, and inspect winner, creator, and platform claim cards.
- The demo settlement uses integer base units, a 2% creator share and 3% platform share. Sample liquidity and participants are fictional; rounding dust is assigned to the simulated platform treasury so the pool is fully conserved.
- Custom markets, picks, simulated payouts, and claim history are saved in browser `localStorage` only. There is no live Devnet market, transaction signing, BEATX transfer, or production claim implementation in this UI.
- Wallet Standard discovers compatible browser wallets; Mobile Wallet Adapter is registered for Devnet on Android Chrome. Connection reads the public address and Devnet SOL balance only. Real extension authorization and Android/iOS handoff still need device testing.

## Verified in the current UI change

- `npm run typecheck`: passed.
- `npm test`: passed, 15 tests including demo settlement conservation and fee/rounding cases.
- `npm run e2e:demo`: passed for the existing API test suite.
- `npm run build`: passed; CNAME included in `dist`.
- Browser smoke created a local market, saved a pick, resolved it, claimed all three demo roles, and confirmed persistence after reload. No wallet signature or transaction was used.

## Not yet verified / release gates

- Anchor/SBF build or actual BPF binary size.
- Migrated-program Devnet acceptance and generated IDL consistency. No live Devnet markets are intended; any Devnet run must remain a controlled internal fixture test.
- Independent review of protocol authority, fee withdrawal, cancellation/refund, account layouts, and token-extension assumptions.
- Any Mainnet deployment or production wallet-signed market/claim flow.
- Real wallet authorization and Android/iOS handoff on physical devices.
- HTTPS certificate readiness for `beatx.world` should be rechecked with GitHub Pages before claiming TLS is active.

The old Devnet deployment and its funded E2E report cover the legacy SPL Token build only; they are historical, not proof for the current Token-2022 source.

## Continue in this order

1. Review and merge the website changes through the PR; GitHub Pages deploys from `main`.
2. Recheck the deployed site, DNS, and certificate status; enable HTTPS only after GitHub marks the certificate ready.
3. Install a compatible Anchor/Solana SBF toolchain; build the default mint-enforced artifact and measure binary size.
4. Build and deploy the `devnet-test-mint` fixture artifact only on Devnet, then run acceptance tests with protected test wallets.
5. Review/pin the artifact and matching IDL; complete independent security review.
6. Select a separate Mainnet program ID and implement real wallet-signed flows only after the deployment and product controls are ready.

## Safety boundaries

- Never commit wallet files, private keys, tokens, RPC credentials, resolver secrets, or machine-specific paths.
- Never expose the resolver authority to the browser.
- Never enable `devnet-test-mint` in a Mainnet artifact.
- Local claim buttons are educational simulation only; do not describe them as on-chain claims or real earnings.
