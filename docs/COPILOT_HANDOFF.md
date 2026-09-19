# BeatX continuation handoff

## Verified in this checkout

- The React/Vite demo UI is responsive and supports market discovery, search, category filters, market-room proof UI, wallet states, creator drafts, and optional API-backed demo positions.
- The TypeScript API supports market creation, policy locking, base-unit positions, time-gated close, deterministic evidence resolution, owner-checked claims, fee accounting, and provider fallback/cache behavior.
- The Anchor program source implements the settlement lifecycle and passes `cargo check` in CI-compatible Rust tooling. It has not been deployed to Solana Devnet from this repository.
- `npm run typecheck`, `npm test`, `npm run e2e:demo`, and the production Vite build have passed in the documented verification setup.

## Continue in this order

1. Run the web and API checks from the root, then inspect the rendered UI in a real browser.
2. Configure a funded Devnet wallet outside Git, install Anchor/Solana CLI, build and deploy `chains/solana`, and record the actual program address and transaction signatures.
3. Add the funded Devnet acceptance path: initialize protocol, create/lock market, place two positions, close, collect evidence, submit/finalize resolution, claim, reconcile fees/vault, and test all negative paths.
4. Replace the local demo position state with wallet-signed transactions while keeping the demo fallback explicit.
5. Enable the Prisma/PostgreSQL runtime behind the existing schema contract.

## Safety boundaries

- Do not commit wallet files, private keys, tokens, RPC credentials, or machine-specific paths.
- Keep AI and provider adapters observational; only the deterministic resolver may produce a settlement outcome.
- Keep `BEATX_RESOLVER_AUTHORITY` outside Git when changing the demo authority.
- Do not claim Devnet deployment until an on-chain program account and acceptance signatures are verified.
