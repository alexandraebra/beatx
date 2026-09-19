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

The BeatX program is deployed on Solana Devnet at `F852vVx3c4jPKY6VVMRU4CUVhqh5iX79ZRokwKYAu18h`. Deployment signature: `MAC9pf4esqeHyB1iwni2e37YzZuwxSvNBfJ88YERHGPgAo3T2BRjKnyaWL7nLRiojG1TT8JiSiHscsdSx8AAH1t`. A live RPC check confirmed the program account is executable and owned by the upgradeable loader. `cargo check` and `anchor build` pass with Anchor 0.31.x. The funded instruction-level acceptance path passes through `npm run e2e:solana`; cancellation/refund remains to be added to that script.

For deployment, keep keypairs outside Git and override the relative config wallet: `anchor deploy --provider.cluster devnet --provider.wallet "$BEATX_WALLET"`.
