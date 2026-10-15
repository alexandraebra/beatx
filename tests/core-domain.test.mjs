import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateProRataPayout, createEvidenceBundle, policyHash, assertCanPlacePosition } from '../.api-dist/packages/core/src/index.js'

const policy = {
  marketType: 'MULTIPLE_CHOICE',
  question: 'Which project ships first?',
  options: ['A', 'B'],
  closeAt: '2026-10-01T00:00:00.000Z',
  resolutionDeadline: '2026-10-02T00:00:00.000Z',
  rule: 'Highest verified confidence wins',
  sources: ['https://example.com'],
}

test('policy hash is deterministic for the same structured policy', async () => {
  assert.equal(await policyHash(policy), await policyHash({ ...policy }), 'same policy must have same hash')
  assert.match(await policyHash(policy), /^sha256:[a-f0-9]{64}$/)
})

test('evidence bundle is traceable and hashes its observations', async () => {
  const bundle = await createEvidenceBundle('demo-market', policy, [{ entityId: 'A', metric: 'signal', value: 4, source: 'test', sourceType: 'fixture', sourceUrl: 'https://example.com/a', observedAt: '2026-09-19T00:00:00.000Z', verified: true, confidence: 0.9 }])
  assert.equal(bundle.outcome, 'A')
  assert.match(bundle.policyHash, /^sha256:/)
  assert.match(bundle.evidenceHash, /^sha256:/)
  assert.deepEqual(bundle.sources, ['https://example.com/a'])
})

test('resolution fails closed when no verified observation matches an outcome', async () => {
  await assert.rejects(() => createEvidenceBundle('demo-market', policy, []), /NO_VERIFIED_EVIDENCE/)
  await assert.rejects(() => createEvidenceBundle('demo-market', policy, [{ entityId: 'A', metric: 'signal', value: 0, source: 'fallback', sourceType: 'fallback', sourceUrl: 'https://example.com/fallback', observedAt: '2026-09-19T00:00:00.000Z', verified: false, confidence: 0 }]), /NO_VERIFIED_EVIDENCE/)
})

test('resolution rejects rules the deterministic resolver does not implement', async () => {
  await assert.rejects(() => createEvidenceBundle('demo-market', { ...policy, rule: 'Arbitrary oracle outcome' }, [{ entityId: 'A', metric: 'signal', value: 1, source: 'test', sourceType: 'fixture', sourceUrl: 'https://example.com/a', observedAt: '2026-09-19T00:00:00.000Z', verified: true, confidence: 1 }]), /UNSUPPORTED_RESOLUTION_RULE/)
})

test('highest-confidence rule selects the highest single observation, not the sum', async () => {
  const bundle = await createEvidenceBundle('demo-market', policy, [
    { entityId: 'A', metric: 'signal', value: 1, source: 'test', sourceType: 'fixture', sourceUrl: 'https://example.com/a', observedAt: '2026-09-19T00:00:00.000Z', verified: true, confidence: 0.7 },
    { entityId: 'B', metric: 'signal', value: 1, source: 'test', sourceType: 'fixture', sourceUrl: 'https://example.com/b1', observedAt: '2026-09-19T00:00:00.000Z', verified: true, confidence: 0.4 },
    { entityId: 'B', metric: 'signal', value: 1, source: 'test', sourceType: 'fixture', sourceUrl: 'https://example.com/b2', observedAt: '2026-09-19T00:00:00.000Z', verified: true, confidence: 0.4 },
  ])
  assert.equal(bundle.outcome, 'A')
})

test('verified observations with invalid confidence are rejected', async () => {
  await assert.rejects(() => createEvidenceBundle('demo-market', policy, [{ entityId: 'A', metric: 'signal', value: 1, source: 'test', sourceType: 'fixture', sourceUrl: 'https://example.com/a', observedAt: '2026-09-19T00:00:00.000Z', verified: true, confidence: 1.5 }]), /INVALID_VERIFIED_EVIDENCE/)
})

test('settlement rejects positions after close and uses bigint arithmetic', () => {
  const market = { id: 'm', status: 'OPEN', policyHash: 'sha256:x', openedAt: 1, closeAt: 10, vaultBaseUnits: 1000n, optionTotalsBaseUnits: [500n, 500n] }
  assert.throws(() => assertCanPlacePosition(market, 10), /MARKET_CLOSED/)
  assert.equal(calculateProRataPayout(125n, 500n, 1000n), 250n)
})
