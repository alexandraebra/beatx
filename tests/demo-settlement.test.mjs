import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateDemoSettlement } from '../.api-dist/packages/core/src/demo-settlement.js'

const BEATX = 1_000_000n

test('demo settlement splits the pool between winning picks, creator fee, and platform fee', () => {
  const result = calculateDemoSettlement([
    { id: 'sample-a', optionIndex: 0, amountBaseUnits: String(40n * BEATX) },
    { id: 'sample-b', optionIndex: 1, amountBaseUnits: String(60n * BEATX) },
    { id: 'local-winner', optionIndex: 0, amountBaseUnits: String(10n * BEATX) },
  ], 0)

  assert.equal(result.totalPoolBaseUnits, String(110n * BEATX))
  assert.equal(result.platformFeeBaseUnits, String(33n * BEATX / 10n))
  assert.equal(result.creatorFeeBaseUnits, String(22n * BEATX / 10n))
  assert.equal(result.payoutsBaseUnits['local-winner'], String(20_900_000n))
  assert.equal(result.payoutsBaseUnits['sample-b'], '0')
  const distributed = Object.values(result.payoutsBaseUnits).reduce((sum, amount) => sum + BigInt(amount), 0n)
  assert.equal(distributed + BigInt(result.platformFeeBaseUnits) + BigInt(result.creatorFeeBaseUnits), BigInt(result.totalPoolBaseUnits))
})

test('demo settlement assigns integer rounding dust to platform and conserves every base unit', () => {
  const result = calculateDemoSettlement([
    { id: 'winner-a', optionIndex: 0, amountBaseUnits: '1' },
    { id: 'winner-b', optionIndex: 0, amountBaseUnits: '1' },
    { id: 'other', optionIndex: 1, amountBaseUnits: '1' },
  ], 0)
  const distributed = Object.values(result.payoutsBaseUnits).reduce((sum, amount) => sum + BigInt(amount), 0n)
  assert.equal(distributed + BigInt(result.platformFeeBaseUnits) + BigInt(result.creatorFeeBaseUnits), 3n)
  assert.ok(BigInt(result.roundingRemainderBaseUnits) >= 0n)
})

test('demo settlement rejects empty pools, outcome without a winning stake, and duplicate IDs', () => {
  assert.throws(() => calculateDemoSettlement([], 0), /EMPTY_DEMO_POOL/)
  assert.throws(() => calculateDemoSettlement([{ id: 'a', optionIndex: 0, amountBaseUnits: '1' }], 1), /NO_DEMO_WINNING_STAKE/)
  assert.throws(() => calculateDemoSettlement([
    { id: 'a', optionIndex: 0, amountBaseUnits: '1' },
    { id: 'a', optionIndex: 1, amountBaseUnits: '1' },
  ], 0), /INVALID_DEMO_STAKE_ID/)
})
