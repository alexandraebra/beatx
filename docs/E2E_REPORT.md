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
6. Reject resolution with a mismatched policy hash.
7. Submit a deterministic resolution and generate an evidence hash.
8. Claim the winning position.
9. Reject a second claim for the same position.

Latest verified result in this checkout: `PASS`.

The provider step is intentionally failure-tolerant. When the public GitHub request is unavailable, the resolver response is marked stale and uses the deterministic fallback rather than failing the acceptance path.

## Additional checks

- `npm run typecheck`: PASS.
- `npm test`: PASS, 6 tests.
- Frontend production build: PASS in an executable temporary verification directory; the workspace mount itself does not allow esbuild execution.
- Anchor program `cargo check`: PASS using a temporary Rust toolchain and executable target directory outside the workspace mount; Anchor CLI/Solana CLI deployment checks remain pending.
- Secret/path scan: PASS; no GitHub token, private key, wallet seed, or local machine path is committed.

## Not claimed

This is not a Solana Devnet acceptance report. The Anchor source and workspace are present under `chains/solana`, but `cargo`, `anchor`, and `solana` were unavailable in the build environment. No program deployment, wallet-funded transaction, program ID activation, or on-chain signature is claimed here.
