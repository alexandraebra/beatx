# BeatX architecture notes

## Product boundaries

BeatX has three visible evidence surfaces:

1. **BeatX Intelligence** — neutral, timestamped synthesis of collected facts.
2. **Creator Take** — the creator's opinion, clearly attributed and never treated as resolution evidence.
3. **Market Evidence** — the source observations used by a deterministic resolver.

An LLM can summarize evidence later, but it must not invent sources, select outcomes, authorize settlement, or access funds.

## Resolution pipeline

```text
Provider adapters
  -> normalized observations
  -> policy evaluator
  -> evidence bundle + evidenceHash
  -> resolver authorization
  -> Solana finalization
  -> claim / refund
```

The resolver should accept a structured policy hash and only submit a result if the policy and evidence relationship is valid. Large documents stay off-chain; the chain receives compact identifiers and hashes.

## Demo to production seam

The current demo stores no user or market state remotely. `src/main.tsx` contains seeded example markets and deterministic UI state so the product remains useful without an API key. The public seam is the market shape (`question`, `options`, `volume`, `participants`, source metadata) and the integer settlement preview. A future API can replace these seeded reads without changing the market-room layout.

## Recommended Solana accounts

`ProtocolConfig`, `Creator`, `Market`, `MarketVault`, `Position`, `Resolution`, and `Claim`. The market stores the policy hash, option hashes, time bounds, status, totals, fee configuration, winning option, evidence hash, and resolution timestamp. Participant funds are never withdrawable by a creator.
