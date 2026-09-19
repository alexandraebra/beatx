export type MarketType = 'YES_NO' | 'MULTIPLE_CHOICE' | 'RACE' | 'NUMERIC_RANGE' | 'DATE_TIME' | 'SOCIAL' | 'EVENT' | 'CUSTOM'

export type ResolutionPolicy = {
  marketType: MarketType
  question: string
  options: string[]
  closeAt: string
  resolutionDeadline: string
  rule: string
  sources: string[]
}

export type Observation = {
  entityId: string
  metric: string
  value: string | number | boolean
  source: string
  sourceType: string
  sourceUrl: string
  observedAt: string
  verified: boolean
  confidence: number
}

export type EvidenceBundle = {
  marketId: string
  policyHash: string
  outcome: string
  observations: Observation[]
  sources: string[]
  timestamps: string[]
  resolverVersion: string
  generatedAt: string
  evidenceHash?: string
}

export type MarketLifecycle = 'DRAFT' | 'OPEN' | 'LOCKED' | 'CLOSED' | 'RESOLVED' | 'CANCELLED'

export type MarketState = {
  id: string
  status: MarketLifecycle
  policyHash: string
  openedAt: number
  closeAt: number
  vaultBaseUnits: bigint
  optionTotalsBaseUnits: bigint[]
}

export const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function policyHash(policy: ResolutionPolicy): Promise<string> {
  return `sha256:${await sha256Hex(canonicalJson(policy))}`
}

export async function evidenceHash(bundle: Omit<EvidenceBundle, 'evidenceHash'>): Promise<string> {
  return `sha256:${await sha256Hex(canonicalJson(bundle))}`
}

export function assertCanPlacePosition(market: MarketState, now = Date.now()): void {
  if (market.status !== 'OPEN' && market.status !== 'LOCKED') throw new Error('MARKET_NOT_OPEN')
  if (now >= market.closeAt) throw new Error('MARKET_CLOSED')
}

export function assertCanClaim(market: MarketState, now = Date.now()): void {
  if (market.status !== 'RESOLVED') throw new Error('RESOLUTION_NOT_FINAL')
  if (now < market.openedAt) throw new Error('INVALID_MARKET_TIME')
}

export function calculateProRataPayout(amountBaseUnits: bigint, winningPool: bigint, totalPool: bigint): bigint {
  if (amountBaseUnits < 0n || winningPool <= 0n || totalPool < winningPool) throw new Error('INVALID_SETTLEMENT_MATH')
  return amountBaseUnits * totalPool / winningPool
}

export function selectDeterministicOutcome(policy: ResolutionPolicy, observations: Observation[]): string {
  if (policy.options.length === 0) throw new Error('NO_OPTIONS')
  const ranked = policy.options.map((option) => ({ option, score: observations.filter((item) => item.entityId === option && item.verified).reduce((sum, item) => sum + item.confidence, 0) }))
  return ranked.sort((a, b) => b.score - a.score || a.option.localeCompare(b.option))[0].option
}

export async function createEvidenceBundle(marketId: string, policy: ResolutionPolicy, observations: Observation[], now = new Date()): Promise<EvidenceBundle> {
  const hash = await policyHash(policy)
  const outcome = selectDeterministicOutcome(policy, observations)
  const base = { marketId, policyHash: hash, outcome, observations, sources: [...new Set(observations.map((item) => item.sourceUrl))], timestamps: observations.map((item) => item.observedAt), resolverVersion: 'beatx-deterministic-v1', generatedAt: now.toISOString() }
  return { ...base, evidenceHash: await evidenceHash(base) }
}
