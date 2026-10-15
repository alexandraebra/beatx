# BeatX continuation handoff

## Verified in this checkout

- React/Vite is a client-only preview with sample markets, search/category filters, and responsive layouts.
- The UI intentionally has no wallet connect, API/RPC calls, or Devnet market feed. There are no live markets on Devnet from this site.
- Visitors can save local demo picks in browser `localStorage`; these are not positions and no BEATX moves.
- The TypeScript resolver rejects missing/unverified evidence and unsupported deterministic rules; demo API lifecycle tests pass.
- The Anchor source accepts only the official six-decimal BEATX Token-2022 mint in normal builds, restricts first protocol initialization to the program upgrade authority, and includes post-resolution fee withdrawal.
- Market storage scales with outcome count; 2 outcomes use 343 bytes including the discriminator versus 583 bytes at the 8-outcome maximum.
- Host Rust tests/checks passed in both default and `devnet-test-mint` modes. After the local-only UX revision, web typecheck, all 12 unit tests, API E2E, and production build passed. Browser smoke verified that a demo pick saves locally and the page has no wallet control or Devnet/API RPC request.

## Not yet verified

- Anchor/SBF build or actual BPF binary size.
- Anchor/SBF build, migrated-program Devnet acceptance, and binary size. No live Devnet markets are intended; any future Devnet run must remain a controlled internal fixture test.
- Any Mainnet deployment or production wallet-signed transaction flow.
- GitHub Pages publication and DNS/HTTPS propagation for `beatx.world`.

The prior Devnet deployment and its funded E2E report cover the old SPL Token build only; treat them as historical, not proof for the current source.

## Continue in this order

1. Rerun web typecheck/tests/build and both Rust test modes.
2. Build the current Anchor/SBF artifact without `devnet-test-mint` for production; inspect size. Build the test artifact with the feature only for Devnet.
3. Generate/inspect the matching IDL and run the updated Devnet acceptance script with protected test wallets.
4. Review authority, fee withdrawal, cancellation/refund, and account-layout security before any deployment.
5. Publish the reviewed website through the Pages workflow only after confirming the live domain/DNS status; enable HTTPS after certificate readiness.
6. Add wallet-signed BEATX transactions only when the Mainnet program and all required production services are ready.

## Safety boundaries

- Never commit wallet files, private keys, tokens, RPC credentials, resolver secrets, or machine-specific paths.
- Never expose the resolver authority to the browser.
- Never enable `devnet-test-mint` in a Mainnet artifact.
- Initialize protocol settings while the program upgrade authority is active; do not claim Mainnet readiness from host-only Rust checks.
