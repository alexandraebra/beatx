# BeatX continuation handoff

## Verified in this checkout

- React/Vite now has market search/category filters, explicit demo labels, and responsive components matching the current markup.
- The browser preview does not sign transactions or move BEATX. Seeded values are marked as demo data.
- The TypeScript resolver rejects missing/unverified evidence and unsupported deterministic rules; demo API lifecycle tests pass.
- The Anchor source accepts only the official six-decimal BEATX Token-2022 mint in normal builds, restricts first protocol initialization to the program upgrade authority, and includes post-resolution fee withdrawal.
- Market storage scales with outcome count; 2 outcomes use 343 bytes including the discriminator versus 583 bytes at the 8-outcome maximum.
- Host Rust tests/checks passed in both default and `devnet-test-mint` modes. Web typecheck, unit tests, demo E2E, and production build also passed before the final UI refinements; rerun them after any further changes.

## Not yet verified

- Anchor/SBF build or actual BPF binary size.
- Live Devnet acceptance against the migrated Token-2022 program.
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
