import test from 'node:test'
import assert from 'node:assert/strict'
import { clearProviderCache, collectWithFallback } from '../.api-dist/packages/providers/src/index.js'

test('provider failure returns the last successful snapshot as stale data', async () => {
  clearProviderCache()
  let shouldFail = false
  const adapter = { name: 'test-provider', async collect(entityId) { if (shouldFail) throw new Error('UPSTREAM_DOWN'); return [{ entityId, metric: 'count', value: 7, source: 'test', sourceType: 'fixture', sourceUrl: 'https://example.com', observedAt: '2026-09-19T00:00:00.000Z', verified: true, confidence: 1 }] } }
  const fresh = await collectWithFallback(adapter, 'entity-a')
  assert.equal(fresh.health.healthy, true)
  shouldFail = true
  const stale = await collectWithFallback(adapter, 'entity-a')
  assert.equal(stale.health.stale, true)
  assert.equal(stale.health.error, 'UPSTREAM_DOWN')
  assert.equal(stale.observations[0].value, 7)
})

test('provider failure without a cache uses the deterministic demo fallback', async () => {
  clearProviderCache()
  const result = await collectWithFallback({ name: 'offline-provider', async collect() { throw new Error('OFFLINE') } }, 'entity-b')
  assert.equal(result.health.stale, true)
  assert.equal(result.observations[0].sourceType, 'demo')
  assert.equal(result.observations[0].observedAt, '1970-01-01T00:00:00.000Z')
})
