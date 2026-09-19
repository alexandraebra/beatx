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
- Anchor program `cargo check`: PASS using a temporary Rust toolchain and executable target directory outside the workspace mount; Anchor CLI/Solana CLI deployment checks remain pending.
- Secret/path scan: PASS; no GitHub token, private key, wallet seed, or local machine path is committed.

## Not claimed

This is not a Solana Devnet acceptance report. The Anchor source and workspace are present under `chains/solana`, but `cargo`, `anchor`, and `solana` were unavailable in the build environment. No program deployment, wallet-funded transaction, program ID activation, or on-chain signature is claimed here.

A live Devnet RPC check for the declared program address returned `accountExists: false`; the address is therefore source metadata only until a real deployment is completed.
