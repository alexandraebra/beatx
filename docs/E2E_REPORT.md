# BeatX acceptance report

## Local demo API

Command:

```bash
npm run e2e:demo
```

Verified path:

1. Create a market with a structured policy.
2. Generate and retain a `sha256:` policy hash.
3. Place a base-unit position.
4. Confirm the first position locks the policy.
5. Close only after the configured close time.
6. Reject resolution with a mismatched policy hash or unauthorized resolver.
7. Derive the outcome from deterministic evidence and generate an evidence hash.
8. Reject an evidence/outcome mismatch.
9. Read the persisted evidence bundle through the evidence endpoint.
10. Claim the winning position only for its owner.
11. Reconcile the winning position through the portfolio endpoint.
12. Reject early claims, late positions, and a second claim for the same position.

Latest verified result in this checkout: `PASS`.

The provider step is intentionally failure-tolerant. When the public GitHub request is unavailable, the resolver response is marked stale and uses the deterministic fallback rather than failing the acceptance path.

## Additional checks

- `npm run typecheck`: PASS.
- `npm test`: PASS, 8 tests, including cached stale-provider fallback behavior.
- Frontend production build: PASS in an executable temporary verification directory; the workspace mount itself does not allow esbuild execution.
- Anchor program `cargo check`: PASS using an executable target directory outside the workspace mount; `anchor build` and live Devnet deployment checks also pass.
- Secret/path scan: PASS; no GitHub token, private key, wallet seed, or local machine path is committed.

## Solana Devnet acceptance

The deployed program is `F852vVx3c4jPKY6VVMRU4CUVhqh5iX79ZRokwKYAu18h`. The reusable command is `npm run e2e:solana` with `BEATX_WALLET_A`, `BEATX_WALLET_B`, and `BEATX_IDL` supplied from protected paths outside Git.

Latest live result: `PASS`.

- Test mint: `39BP8s4qBFAzPmnrT5K4wrEahBKhJkBbKDqW1ap9FmJc`.
- Test market: `HaCuxsDZuiPPmwj2VZA9Bh5WMX6TZiBPiT32UefZ3Y66`.
- Create: `EsXZZVRmhzdRZPuWch66ztUdEa29AgYBmzfcnnwwxEky31jwgoBycFREGoaFMsxeReVxTSyvwtRYydLn8MxjqA`.
- Place A/B: `RF9uf6yM4wcNFabgshuaUpHATXv79e5zW4MQfTASTk7xRiuXEWwMAxCxDE2EanqrVUv4MM8u7BdsREBsP8SztLy`, `4QVvq1iyV9zFbo7o2nTo3TKYZufz5KaF5ZnWuUQhyKM94XAQXJGxF23ocjSEawvaccVHqVwvEbqTb1KAz6UPtx6q`.
- Close/submit/finalize: `gSivB3x3CXDQmesTVDBrDJfH8izraH6MasEu7DrY3FQ6nYDctd5BJDN6oURH9JyAbU2Rp2yKG5c4ZjzYobVcRUD`, `5qXrz9AEkBDHhanZJJAHaFqkQ5uQEHW8GjXC7D4LDeTaMtdYUyCVehVBJdSfmLDVpMg6ieg6C4YuAnjg99weac51`, `5QebiMjZKmHvmRX74ERLX7HrwRuPjuQ9mPZCHjCnxUWWF8PNyrGuGDhKhLv1PWgGV2tLDwtPLwsJfrXX4tDMXSSc`.
- Claims A/B: `5T34JQ7v5zKUe41j57eaGa5NiEePA82VT5wvaaiRTqDEh4rmSisKu4xZQr3EQCvq4HF8B3Aj9XzjSnH3nDpQYW4T`, `3tni2cKoKHnRGJyMwdoXwjn1m3TebyoDsuqQkpM5zBc72XorseyH3n3SW483ae1ByZtQpXcc876J9etScVgnQT5o`.
- Negative checks: policy mutation unavailable by instruction surface, unauthorized resolution, pre-resolution claim, late position, and double claim all rejected.
- Vault reconciliation: `4,000,000` base units remained; protocol fees `2,000,000`, creator fees `2,000,000`.

## Remaining boundary

The Devnet result above is an actual funded acceptance run, not a source-only claim. Cancellation/refund and the persisted production database path were not exercised in this run.
