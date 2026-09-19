# BeatX

BeatX is a creator-powered prediction market experience built for Solana. It helps people discover measurable questions, inspect neutral evidence, take a position, and follow the proof when reality resolves the market.

This repository currently ships a polished, deterministic demo shell: no wallet, API key, database, or AI provider is required to explore it. Simulated market values are labeled as demo data; public-source labels in the UI describe the intended evidence path and are not presented as live verified observations.

## Run locally

```bash
npm install
npm run dev
```

For filesystem mounts that do not support executable symlinks, use `npm install --bin-links=false` and run Vite through `node node_modules/vite/bin/vite.js`.

Useful checks:

```bash
npm run typecheck
npm test
npm run build
npm run api:build
npm run e2e:demo
```

The acceptance evidence is recorded in [`docs/E2E_REPORT.md`](docs/E2E_REPORT.md).

Run the local demo API with `npm run api:start`. It exposes `/health`, `/api/markets`, `/api/markets/:id/evidence`, `/api/portfolio/:wallet`, `POST /api/markets`, `POST /api/markets/:id/positions`, `POST /api/markets/:id/close`, `POST /api/markets/:id/resolve`, `/api/policies/hash`, and `/api/providers/github`. Provider failures return a stale deterministic fallback instead of taking down the product. The demo lifecycle locks a policy on the first position, uses base-unit strings, rejects invalid/late positions, requires a closed market and matching policy hash for resolution, derives the winner from the evidence bundle, requires the configured resolver authority header, verifies claim ownership, and emits an evidence hash.

## What is in the demo

- Dark-first responsive landing page with trending markets, category filters, live activity, creator spotlight, and a market-room workflow.
- Deterministic market distributions and integer-safe payout preview; the UI uses a stablecoin concept labeled `USDC (test)` and `Solana Devnet`.
- Wallet states, position selection, amount entry, connect/confirm feedback, creator market draft flow, share feedback, and neutral intelligence copy.
- Wallet button uses an injected Solana provider when available and clearly falls back to a no-funds demo wallet when no extension is installed.
- Explicit separation between BeatX Intelligence, Creator Take, and market source labels.
- No AI winner selection, no simulated live data presented as real, and no private keys in the repository.
- TypeScript domain package for canonical policy hashing, evidence bundles, deterministic outcome selection, bigint payout math, and lifecycle guards.
- Dependency-light demo API with provider timeout, in-memory snapshot cache, stale-data signaling, fallback behavior, and no required secrets.
- PostgreSQL/Prisma schema contract at `prisma/schema.prisma` covering users, creators, markets, immutable `MarketPolicy`, options, positions, evidence, resolutions, claims, comments, follows, provider snapshots, and activity. The demo API remains in-memory until the database runtime is enabled.

## Architecture direction

```text
React/Vite demo UI
       |
TypeScript domain contracts
       |
API + PostgreSQL (next integration)
       |
Provider adapters -> normalized observations -> deterministic resolver
       |
Solana Anchor settlement program (Devnet)
```

The production boundary should keep large evidence bundles off-chain. A resolved market stores the policy hash and evidence hash on Solana, while the structured observations, sources, timestamps, and resolver version remain in the API/database. AI may summarize traceable observations but never chooses a winner or controls funds. The demo resolver defaults to `demo-resolver`; set `BEATX_RESOLVER_AUTHORITY` outside Git when using a non-demo authority.

## Environment

Copy `.env.example` for local configuration. Demo mode works without secrets. Never commit `.env`, wallet material, GitHub tokens, RPC credentials, or provider keys.

## Security model

Market policy is intended to become immutable after the first position. Settlement must use integer base units, reject positions after close, reject claims before finalization, make finalization and claims idempotent, and reconcile payouts against vault assets. Resolver authorization should be separated from AI and prepared for a future quorum.

## Solana and API status

The UI is intentionally runnable without a Solana wallet or backend. The Anchor source passes `cargo check` using a temporary toolchain, but Anchor CLI, Solana CLI, PostgreSQL, and GitHub CLI are not available in the current build environment. A live Devnet RPC check confirms the declared program address is not deployed yet. The remaining production slice is the funded Devnet lifecycle: initialize, create, lock, place, close, submit, finalize, claim, and cancellation/refund.

## Roadmap

1. Activate the Prisma/PostgreSQL runtime behind the existing schema contract.
2. Add provider cache persistence and additional public adapters.
3. Compile and deploy the Anchor program in `chains/solana`, then add the funded Devnet acceptance path with policy mutation, late position, unauthorized resolution, pre-resolution claim, double-claim, and vault reconciliation tests.
4. Connect wallet transaction builders and replace demo position state with API-backed/on-chain state.

## Credit

An idea by AlexaFairy 🧚‍♀️  
She made the bet. AI helped her build it.
