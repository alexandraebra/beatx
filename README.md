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
```

Run the local demo API with `npm run api:start`. It exposes `/health`, `/api/markets`, `POST /api/markets`, `POST /api/markets/:id/positions`, `POST /api/markets/:id/close`, `POST /api/markets/:id/resolve`, `/api/policies/hash`, and `/api/providers/github`. Provider failures return a stale deterministic fallback instead of taking down the product. The demo lifecycle locks a policy on the first position, uses base-unit strings, rejects invalid/late positions, requires a closed market and matching policy hash for resolution, and emits an evidence hash.

## What is in the demo

- Dark-first responsive landing page with trending markets, category filters, live activity, creator spotlight, and a market-room workflow.
- Deterministic market distributions and integer-safe payout preview; the UI uses a stablecoin concept labeled `USDC (test)` and `Solana Devnet`.
- Wallet states, position selection, amount entry, connect/confirm feedback, creator market draft flow, share feedback, and neutral intelligence copy.
- Wallet button uses an injected Solana provider when available and clearly falls back to a no-funds demo wallet when no extension is installed.
- Explicit separation between BeatX Intelligence, Creator Take, and market source labels.
- No AI winner selection, no simulated live data presented as real, and no private keys in the repository.
- TypeScript domain package for canonical policy hashing, evidence bundles, deterministic outcome selection, bigint payout math, and lifecycle guards.
- Dependency-light demo API with provider timeout/fallback behavior and no required secrets.

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

The production boundary should keep large evidence bundles off-chain. A resolved market stores the policy hash and evidence hash on Solana, while the structured observations, sources, timestamps, and resolver version remain in the API/database. AI may summarize traceable observations but never chooses a winner or controls funds.

## Environment

Copy `.env.example` for local configuration. Demo mode works without secrets. Never commit `.env`, wallet material, GitHub tokens, RPC credentials, or provider keys.

## Security model

Market policy is intended to become immutable after the first position. Settlement must use integer base units, reject positions after close, reject claims before finalization, make finalization and claims idempotent, and reconcile payouts against vault assets. Resolver authorization should be separated from AI and prepared for a future quorum.

## Solana and API status

The UI is intentionally runnable without a Solana wallet or backend. Anchor, Rust, PostgreSQL, and a GitHub CLI are not available in the current build environment, so no Devnet program has been deployed from this checkout. The next production slice is the API schema/provider boundary followed by the minimal Anchor lifecycle: initialize, create, lock, place, close, submit resolution, finalize, claim, and cancellation/refund.

## Roadmap

1. Add Prisma/PostgreSQL models for users, creators, markets, policies, positions, evidence, resolutions, claims, comments, follows, snapshots, and activity.
2. Add provider adapters with timeout, cache, stale-data state, and graceful fallback behavior.
3. Add the deterministic resolver and evidence bundle hashing.
4. Add the Anchor program and Devnet acceptance path with policy mutation, late position, unauthorized resolution, pre-resolution claim, double-claim, and vault reconciliation tests.
5. Connect wallet adapters and replace demo state with API-backed state.

## Credit

An idea by AlexaFairy 🧚‍♀️  
She made the bet. AI helped her build it.
