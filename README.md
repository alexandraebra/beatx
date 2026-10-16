# BeatX

BeatX is a Solana prediction-market prototype. This repository currently ships a **client-side demo preview**: visitors can create local sample markets, save hypothetical picks, simulate a result, and explore winner, market-creator, and platform fee claims. Markets, liquidity, participation, payouts, and claims are fictional and stored only in the visitor's browser. The optional wallet connection is read-only; there are **no live markets on Devnet**, no wallet signatures, and no real BEATX transfers. The planned official settlement asset is the BEATX Token-2022 mint listed below.

## Official token

- **BEATX mint:** `HuoN3NEwkCv7JjZJPjkDWyX4oZ4UXT2hLKFWPnyvpump`
- [Pump.fun token page](https://pump.fun/coin/HuoN3NEwkCv7JjZJPjkDWyX4oZ4UXT2hLKFWPnyvpump)
- [Solana Explorer](https://explorer.solana.com/address/HuoN3NEwkCv7JjZJPjkDWyX4oZ4UXT2hLKFWPnyvpump)
- Builds without the explicitly guarded `devnet-test-mint` feature accept only this Token-2022 mint with **6 decimals**. They do not accept SOL, USDC, or an arbitrary SPL mint as a market settlement asset.

## Run locally

```bash
npm ci
cp .env.example .env
export BEATX_RESOLVER_AUTHORITY="$(openssl rand -hex 32)"
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm test
npm run e2e:demo
npm run build
npm run api:build
```

The acceptance notes are in [`docs/E2E_REPORT.md`](docs/E2E_REPORT.md). For isolated API development/tests only, run `npm run api:build && npm run api:start` in a second terminal to start the **loopback-only** in-memory demo API; it requires the random `BEATX_RESOLVER_AUTHORITY` above, is not a production service or a substitute for on-chain settlement, and deliberately refuses to start when `NODE_ENV=production`. The public React preview intentionally does not call this API. Provider failures are marked stale, and the deterministic resolver fails closed when verified evidence is missing, malformed, or the resolution rule is unsupported. The API is not deployed for the GitHub Pages site.

## What the preview includes

- Responsive sample-market discovery with search, category filters, and clear preview labels.
- A local market builder for two to four outcomes; created markets and simulated sample liquidity are stored in `localStorage` and are never published.
- Interactive local demo picks, result simulation, and claim cards for winner payouts, creator fees, and the platform treasury. The preview fee model is 2% creator + 3% platform; it is educational UI only, not a production fee policy or on-chain claim implementation.
- Demo picks and claims remain independent from any connected wallet and never create a position or transaction.
- Optional Wallet Standard connection for compatible browser wallets and wallet in-app browsers. On Android Chrome, Mobile Wallet Adapter is registered for `solana:devnet`; the UI only reads the public address and Devnet SOL balance.
- All seeded volumes, participant counts, outcome distributions, and created-market sample liquidity are **illustrative fixtures, not live market data**.
- Integer-safe BEATX base-unit math (`1 BEATX = 1,000,000` base units).
- A deterministic TypeScript domain package for policy hashing, evidence bundles, outcome selection, payout math, and lifecycle guards.
- An in-memory API and Prisma schema contract; PostgreSQL persistence is not enabled.

## Wallet preview boundaries

The wallet control connects through Wallet Standard and requests account access only. It does **not** sign messages or transactions, send BEATX, or create markets/positions. Devnet SOL balance is queried from the public Devnet RPC endpoint; a browser wallet may still have a different active cluster, so the page labels this as a read-only Devnet lookup. Android Chrome can use Mobile Wallet Adapter with a compatible wallet app. MWA is not supported in iOS Safari; on iPhone/iPad, open BeatX inside the wallet app's browser or use a supported wallet extension. See the [Solana wallet guide](https://solana.com/developers/cookbook/wallets/connect-wallet-react) and [Solana Mobile browser compatibility](https://docs.solanamobile.com/developers/mobile-wallet-adapter-web).

## Solana program status

The Anchor program stores compact market/policy/evidence state and uses a Token-2022 vault. It validates the official BEATX mint in normal builds, restricts initial protocol configuration to the program's upgrade authority, and supports fee withdrawal only after resolution. Market account allocation scales with the number of outcomes: a two-outcome market uses 343 bytes including its discriminator, compared with 583 bytes at the eight-outcome maximum (240 bytes fewer). A current Mainnet rent-exemption quote is 0.002392680 SOL versus 0.003611880 SOL, a **0.001219200 SOL saving per two-outcome market**; rent parameters can change.

The previous Devnet deployment is a **legacy build** and is not the migrated BEATX Token-2022 program. This branch has passed host Rust checks/tests, but has **not** yet had an Anchor/SBF build, a post-migration Devnet acceptance run, or a Mainnet deployment. Do not treat the preview, old Devnet program, or test build as production-ready.

See [`chains/solana/README.md`](chains/solana/README.md) for build and safety instructions. The `devnet-test-mint` Cargo feature is only for Devnet fixture tests; never enable it for a Mainnet build.

## GitHub Pages and `beatx.world`

The Vite build uses `/` as its base path for the custom apex domain. GitHub Pages is configured for `beatx.world`. The DNS currently resolves the apex to GitHub Pages' four A records and `www` to `alexandraebra.github.io`. The public files `sitemap.xml` and `robots.txt` are copied from `public/` into the Pages artifact; only the canonical home page is listed because the app's sections are in-page anchors, not separate URLs. The initial HTML also contains a short, crawlable description of the demo.

At the latest check, GitHub Pages reported `https_certificate.state = dns_changed` (“Requesting a new certificate”) and `https_enforced = false`. Keep HTTPS enforcement disabled until GitHub marks the certificate active/approved; then enable it in **GitHub → Settings → Pages** and verify both apex and `www` over HTTPS. The Namecheap records should remain on the domain's existing DNS host (do not change nameservers just to add these):

- Apex `@`: GitHub Pages A records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153`.
- `www`: CNAME to `alexandraebra.github.io`.

`https://beatx.world/sitemap.xml` and `https://beatx.world/robots.txt` are the public crawler endpoints once TLS is active. A merge to `main` triggers the Pages workflow; this branch does not publish to the live site by itself.

## Security and deployment boundaries

- Never commit `.env`, wallet keypairs/seeds, GitHub tokens, RPC credentials, or provider keys.
- Keep resolver authorization server-side. The public browser must not receive a resolver secret.
- Initialize protocol settings with the program upgrade authority before renouncing that authority.
- Build production without `devnet-test-mint`; perform a separate SBF build, Devnet acceptance run, review, and security audit before any Mainnet release.
- The preview portfolio contains only local demo picks; it is not an on-chain position or claim.
