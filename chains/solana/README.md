# BeatX Solana settlement program

This Anchor program is the on-chain settlement boundary for BeatX. It stores compact market policy/evidence hashes and keeps large intelligence bundles off-chain.

Implemented instructions:

- `initialize_protocol`
- `create_creator`
- `create_market`
- `lock_market`
- `place_position`
- `close_market`
- `submit_resolution`
- `finalize_resolution`
- `claim`
- `cancel_unopened_market`
- `refund_cancelled_position`

The program uses an SPL token vault supplied as the settlement asset. Policy fields are written at market creation and there is no mutation instruction. Position placement is bounded by market time, claims require a finalized resolution, the winning payout uses checked `u128` math, and claim/refund accounts are single-use.

The declared Devnet program address is deterministic project metadata, not a deployed program claim. `cargo`, `solana`, and `anchor` are unavailable in the current environment, so this source has not yet been compiled, tested on a local validator, or deployed to Devnet. Before deployment, generate and securely manage the matching program keypair outside this repository, run `anchor test`, deploy to Devnet, and record the resulting signature/program address in release evidence.
