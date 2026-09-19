import test from 'node:test'
import assert from 'node:assert/strict'

const total = (options) => options.reduce((sum, option) => sum + option.volume, 0)
const distribution = (options) => options.map((option) => Math.round((option.volume / total(options)) * 100))

test('market distribution is integer-safe and totals approximately 100', () => {
  const options = [{ volume: 18420 }, { volume: 12880 }, { volume: 7920 }]
  assert.deepEqual(distribution(options), [47, 33, 20])
  assert.equal(distribution(options).reduce((a, b) => a + b, 0), 100)
})

test('position payout uses integer base units without floating point settlement math', () => {
  const amountBaseUnits = 125_000_000n
  const winningPool = 18_420_000_000n
  const pool = 39_020_000_000n
  const payout = amountBaseUnits * pool / winningPool
  assert.equal(payout, 264_793_702n)
})

test('locked policies are immutable by application contract', () => {
  const market = Object.freeze({ locked: true, policyHash: 'sha256:demo-policy' })
  assert.throws(() => { market.policyHash = 'changed' }, TypeError)
  assert.equal(market.policyHash, 'sha256:demo-policy')
})
