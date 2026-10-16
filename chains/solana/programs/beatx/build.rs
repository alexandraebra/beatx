fn main() {
    println!("cargo:rerun-if-env-changed=BEATX_DEVNET_TEST_MINT_ACK");
    if std::env::var_os("CARGO_FEATURE_DEVNET_TEST_MINT").is_some() {
        let acknowledged = std::env::var("BEATX_DEVNET_TEST_MINT_ACK")
            .map(|value| value == "DEVNET_FIXTURE_ONLY_NOT_MAINNET")
            .unwrap_or(false);
        if !acknowledged {
            panic!("devnet-test-mint disables the official-mint check; set BEATX_DEVNET_TEST_MINT_ACK=DEVNET_FIXTURE_ONLY_NOT_MAINNET only for a controlled Devnet fixture build");
        }
    }
}
