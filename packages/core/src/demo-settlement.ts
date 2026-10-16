export type DemoStake = {
  id: string
  optionIndex: number
  amountBaseUnits: string
}

export type DemoSettlement = {
  totalPoolBaseUnits: string
  winningStakeBaseUnits: string
  winnerPoolBaseUnits: string
  platformFeeBaseUnits: string
  creatorFeeBaseUnits: string
  roundingRemainderBaseUnits: string
  payoutsBaseUnits: Record<string, string>
}

export const DEMO_PLATFORM_FEE_BPS = 300
export const DEMO_CREATOR_FEE_BPS = 200
const BPS_DENOMINATOR = 10_000n

/**
 * Calculates a local-only pari-mutuel demo settlement. Amounts are integer base units;
 * this function does not transfer tokens and is not an on-chain claim implementation.
 */
export function calculateDemoSettlement(
  stakes: readonly DemoStake[],
  winningOptionIndex: number,
  platformFeeBps = DEMO_PLATFORM_FEE_BPS,
  creatorFeeBps = DEMO_CREATOR_FEE_BPS,
): DemoSettlement {
  if (!Number.isSafeInteger(winningOptionIndex) || winningOptionIndex < 0) throw new Error('INVALID_WINNING_OPTION')
  if (!Number.isSafeInteger(platformFeeBps) || !Number.isSafeInteger(creatorFeeBps) || platformFeeBps < 0 || creatorFeeBps < 0 || platformFeeBps + creatorFeeBps > 10_000) {
    throw new Error('INVALID_DEMO_FEE_BPS')
  }

  const ids = new Set<string>()
  let totalPool = 0n
  let winningStake = 0n
  const normalized = stakes.map((stake) => {
    if (!stake.id || ids.has(stake.id)) throw new Error('INVALID_DEMO_STAKE_ID')
    ids.add(stake.id)
    if (!Number.isSafeInteger(stake.optionIndex) || stake.optionIndex < 0 || !/^\d+$/.test(stake.amountBaseUnits)) throw new Error('INVALID_DEMO_STAKE')
    const amount = BigInt(stake.amountBaseUnits)
    if (amount <= 0n) throw new Error('INVALID_DEMO_STAKE')
    totalPool += amount
    if (stake.optionIndex === winningOptionIndex) winningStake += amount
    return { ...stake, amount }
  })

  if (totalPool <= 0n) throw new Error('EMPTY_DEMO_POOL')
  if (winningStake <= 0n) throw new Error('NO_DEMO_WINNING_STAKE')

  const platformFee = totalPool * BigInt(platformFeeBps) / BPS_DENOMINATOR
  const creatorFee = totalPool * BigInt(creatorFeeBps) / BPS_DENOMINATOR
  const winnerPool = totalPool - platformFee - creatorFee
  const payoutsBaseUnits: Record<string, string> = {}
  let distributed = 0n

  for (const stake of normalized) {
    const payout = stake.optionIndex === winningOptionIndex ? stake.amount * winnerPool / winningStake : 0n
    payoutsBaseUnits[stake.id] = payout.toString()
    distributed += payout
  }

  const roundingRemainder = winnerPool - distributed
  return {
    totalPoolBaseUnits: totalPool.toString(),
    winningStakeBaseUnits: winningStake.toString(),
    winnerPoolBaseUnits: winnerPool.toString(),
    platformFeeBaseUnits: (platformFee + roundingRemainder).toString(),
    creatorFeeBaseUnits: creatorFee.toString(),
    roundingRemainderBaseUnits: roundingRemainder.toString(),
    payoutsBaseUnits,
  }
}
