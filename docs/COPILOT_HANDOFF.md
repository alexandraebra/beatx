# BeatX continuation handoff

## Verified in this checkout

- The React/Vite demo UI is responsive and supports market discovery, search, category filters, market-room proof UI, wallet states, creator drafts, and optional API-backed demo positions.
- The TypeScript API supports market creation, policy locking, base-unit positions, time-gated close, deterministic evidence resolution, owner-checked claims, fee accounting, and provider fallback/cache behavior.
- The Anchor program source implements the settlement lifecycle, passes `cargo check` and `anchor build`, and is deployed on Devnet at `F852vVx3c4jPKY6VVMRU4CUVhqh5iX79ZRokwKYAu18h`.
- `npm run typecheck`, `npm test`, `npm run e2e:demo`, and the production Vite build have passed in the documented verification setup.

## Continue in this order

1. Run the web and API checks from the root, then inspect the rendered UI in a real browser.
2. Extend the live acceptance script with cancellation/refund and run it when that policy is enabled.
3. Replace the local demo position state with wallet-signed transactions while keeping the demo fallback explicit.
4. Enable the Prisma/PostgreSQL runtime behind the existing schema contract.

## Safety boundaries

- Do not commit wallet files, private keys, tokens, RPC credentials, or machine-specific paths.
- Keep AI and provider adapters observational; only the deterministic resolver may produce a settlement outcome.
- Keep `BEATX_RESOLVER_AUTHORITY` outside Git when changing the demo authority.
- Do not claim full Devnet acceptance until the market lifecycle transactions and negative-path signatures are verified.
