# BeatX Solana settlement program

This Anchor program is the compact on-chain settlement boundary for BeatX. It stores market/policy/evidence hashes and keeps large evidence bundles off-chain.

## Supported settlement asset

Normal builds accept **only** the official BEATX Token-2022 mint `HuoN3NEwkCv7JjZJPjkDWyX4oZ4UXT2hLKFWPnyvpump` with six decimals. A Mainnet RPC check on 2026-10-16 showed no mint/freeze authority and only `metadataPointer`/`tokenMetadata` extensions (no transfer-fee or transfer-hook extension). The program uses Token-2022 interfaces and does not accept SOL, USDC, or an arbitrary mint in normal builds. This fixed-address restriction is in addition to validating the supplied mint account in each token-moving instruction.

The feature `devnet-test-mint` disables the fixed mint-address check to let the acceptance script create a throwaway Token-2022 mint. A build-time guard also requires `BEATX_DEVNET_TEST_MINT_ACK=DEVNET_FIXTURE_ONLY_NOT_MAINNET` whenever this feature is enabled. This reduces accidental use but is **not a cryptographic network restriction**: never use the feature or its artifact in a Mainnet build/deployment.

## Instructions

- `initialize_protocol` — one-time; only the current program upgrade authority may initialize protocol settings.
- `create_creator`
- `create_market`
- `lock_market`
- `place_position`
- `close_market`
- `submit_resolution`
- `finalize_resolution`
- `claim`
- `withdraw_fees` — protocol authority or market creator, after final resolution.
- `cancel_unopened_market`
- `refund_cancelled_position`

Market policy is immutable after creation. Positions are time-bounded; the resolver cannot select an outcome with zero winning positions; claims require a final resolution; payouts use checked integer math; position claims/refunds are single-use. Fees stay in the vault until an authorized withdrawal. Each fee is rounded down per position; fractional base-unit dust is not charged. The two fee-withdrawal flags share the high bit of their corresponding `u16` fee-bps fields, avoiding added account storage; configured rates must remain below that flag bit, and clients decoding withdrawn markets must mask this bookkeeping bit before displaying the rate.

## Rent-aware account allocation

Market space is allocated as `255 + 40 × option_count` bytes, plus the 8-byte Anchor discriminator. For 2 outcomes that is **343 bytes**; the previous fixed allocation for 8 outcomes was **583 bytes**, a reduction of **240 bytes** for a two-outcome market. A Mainnet `getMinimumBalanceForRentExemption` check on 2026-10-16 returned 2,392,680 lamports for 343 bytes and 3,611,880 lamports for 583 bytes: **1,219,200 lamports (0.001219200 SOL) less per two-outcome market**. Treat this as a current quote; rent parameters can change.

## Build and test

Host Rust tests (no SBF artifact):

```bash
cargo test --manifest-path chains/solana/programs/beatx/Cargo.toml
cargo test --manifest-path chains/solana/programs/beatx/Cargo.toml --features devnet-test-mint
```

For a production SBF build, use the pinned/compatible Solana and Anchor toolchain and **omit** the test feature. For Devnet fixture testing, explicitly set `BEATX_DEVNET_TEST_MINT_ACK=DEVNET_FIXTURE_ONLY_NOT_MAINNET`, build with `devnet-test-mint`, and deploy only to Devnet under the controlled upgrade authority. The E2E script verifies the official Devnet genesis hash, the expected Devnet program ID, the IDL method set, and Upgradeable Loader/ProgramData account formats; it also requires test wallet files and an IDL path through environment variables. Do not pass private key material in chat or commit it.

This checkout's Rust host tests and `cargo check` pass in both feature modes. An Anchor/SBF build and a post-migration on-chain Devnet acceptance run are still pending, as is any Mainnet deployment. The previously deployed Devnet program ID (`F852vVx3c4jPKY6VVMRU4CUVhqh5iX79ZRokwKYAu18h`) is a legacy build and must not be represented as this migrated program.

## Initialization and deployment safety

`initialize_protocol` verifies the program's ProgramData account and requires the signing authority to equal the current upgrade authority. Initialize protocol settings before renouncing upgrade authority; an immutable program with no upgrade authority cannot use this initialization path. Keep all upgrade and deploy keypairs outside Git. Never deploy the Devnet test-feature artifact to Mainnet.
