import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createEvidenceBundle, assertCanClaim, assertCanPlacePosition, calculateProRataPayout, policyHash, type MarketState, type ResolutionPolicy } from '../../../packages/core/src/index.js'
import { collectWithFallback, githubActivityProvider, type ProviderHealth } from '../../../packages/providers/src/index.js'

const port = Number(process.env.PORT ?? 4000)
const PROTOCOL_FEE_BPS = 100n
const CREATOR_FEE_BPS = 100n
const RESOLVER_AUTHORITY = process.env.BEATX_RESOLVER_AUTHORITY ?? 'demo-resolver'
type DemoPosition = { id: string; wallet: string; optionIndex: number; amountBaseUnits: bigint; claimed: boolean; payoutBaseUnits?: bigint }
type DemoMarket = MarketState & { question: string; category: string; options: string[]; policy: ResolutionPolicy; participants: Set<string>; positions: DemoPosition[]; policyLocked: boolean; winningOption?: number; evidenceBundle?: Awaited<ReturnType<typeof createEvidenceBundle>>; providerHealth?: ProviderHealth; protocolFeesBaseUnits: bigint; creatorFeesBaseUnits: bigint }

const seedPolicy = (question: string, options: string[]): ResolutionPolicy => ({ marketType: 'MULTIPLE_CHOICE', question, options, closeAt: new Date(Date.now() + 86400000 * 2).toISOString(), resolutionDeadline: new Date(Date.now() + 86400000 * 3).toISOString(), rule: 'Highest verified confidence wins', sources: ['github-public'] })
const markets: DemoMarket[] = []

async function addSeed(id: string, question: string, category: string, options: string[]) {
  const policy = seedPolicy(question, options)
  markets.push({ id, question, category, options, policy, policyHash: await policyHash(policy), policyLocked: false, status: 'OPEN', openedAt: Date.now(), closeAt: Date.parse(policy.closeAt), vaultBaseUnits: 0n, optionTotalsBaseUnits: options.map(() => 0n), participants: new Set(), positions: [], protocolFeesBaseUnits: 0n, creatorFeesBaseUnits: 0n })
}

const seedsReady = Promise.all([addSeed('market-cap', 'Which project reaches $10M market cap first?', 'Crypto', ['Monad', 'Sui', 'Berachain']), addSeed('hackathon', 'Which team wins the next Solana hackathon?', 'Technology', ['Team Northstar', 'Orbit Labs', 'Signal House'])])

function send(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' })
  response.end(JSON.stringify(payload, (_, value) => typeof value === 'bigint' ? value.toString() : value))
}

function readPath(request: IncomingMessage) { return new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname }
async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of request) { chunks.push(Buffer.from(chunk)); if (Buffer.concat(chunks).length > 64_000) throw new Error('BODY_TOO_LARGE') }
  const raw = Buffer.concat(chunks).toString()
  return raw ? JSON.parse(raw) as Record<string, unknown> : {}
}
function publicMarket(market: DemoMarket) { return { id: market.id, question: market.question, category: market.category, options: market.options, status: market.status, policyHash: market.policyHash, policyLocked: market.policyLocked, closeAt: new Date(market.closeAt).toISOString(), vaultBaseUnits: market.vaultBaseUnits, optionTotalsBaseUnits: market.optionTotalsBaseUnits, participants: market.participants.size, protocolFeesBaseUnits: market.protocolFeesBaseUnits, creatorFeesBaseUnits: market.creatorFeesBaseUnits, winningOption: market.winningOption === undefined ? null : market.options[market.winningOption], evidenceHash: market.evidenceBundle?.evidenceHash ?? null, providerHealth: market.providerHealth ?? null, demo: true } }
function publicPosition(market: DemoMarket, position: DemoPosition) { return { id: position.id, marketId: market.id, option: market.options[position.optionIndex], optionIndex: position.optionIndex, wallet: position.wallet, amountBaseUnits: position.amountBaseUnits, claimed: position.claimed, payoutBaseUnits: position.payoutBaseUnits ?? 0n, status: market.status === 'RESOLVED' ? (position.optionIndex === market.winningOption ? 'WON' : 'LOST') : market.status } }
function getMarket(path: string) { return markets.find((item) => item.id === path.split('/')[3]) }

const server = createServer(async (request, response) => {
  await seedsReady
  const path = readPath(request)
  try {
    if (request.method === 'OPTIONS') return send(response, 204, {})
    if (request.method === 'GET' && path === '/health') return send(response, 200, { ok: true, service: 'beatx-api', mode: 'demo' })
    if (request.method === 'GET' && path === '/api/markets') return send(response, 200, { data: markets.map(publicMarket), demo: true })
    if (request.method === 'GET' && path.startsWith('/api/portfolio/')) {
      const wallet = decodeURIComponent(path.split('/')[3] ?? '')
      if (!wallet) return send(response, 400, { error: 'WALLET_REQUIRED' })
      const positions = markets.flatMap((market) => market.positions.filter((position) => position.wallet === wallet).map((position) => publicPosition(market, position)))
      const claimableBaseUnits = positions.reduce((sum, position) => sum + (position.status === 'WON' && !position.claimed ? BigInt(position.payoutBaseUnits) : 0n), 0n)
      return send(response, 200, { data: { wallet, positions, claimableBaseUnits }, demo: true })
    }
    if (request.method === 'GET' && path.match(/^\/api\/markets\/[^/]+\/evidence$/)) {
      const market = getMarket(path)
      if (!market) return send(response, 404, { error: 'MARKET_NOT_FOUND' })
      if (!market.evidenceBundle) return send(response, 409, { error: 'EVIDENCE_NOT_AVAILABLE' })
      return send(response, 200, { data: market.evidenceBundle, health: market.providerHealth, demo: true })
    }
    if (request.method === 'GET' && path.startsWith('/api/markets/')) {
      const market = getMarket(path)
      return market ? send(response, 200, { data: publicMarket(market) }) : send(response, 404, { error: 'MARKET_NOT_FOUND' })
    }
    if (request.method === 'POST' && path === '/api/markets') {
      const body = await readJson(request)
      const question = typeof body.question === 'string' ? body.question.trim() : ''
      const options = Array.isArray(body.options) ? body.options.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : []
      if (question.length < 12 || options.length < 2 || options.length > 8) return send(response, 400, { error: 'INVALID_MARKET_INPUT' })
      const policy: ResolutionPolicy = { marketType: body.marketType === 'YES_NO' ? 'YES_NO' : 'MULTIPLE_CHOICE', question, options, closeAt: typeof body.closeAt === 'string' ? body.closeAt : new Date(Date.now() + 86400000).toISOString(), resolutionDeadline: typeof body.resolutionDeadline === 'string' ? body.resolutionDeadline : new Date(Date.now() + 172800000).toISOString(), rule: typeof body.rule === 'string' && body.rule ? body.rule : 'Highest verified confidence wins', sources: Array.isArray(body.sources) ? body.sources.filter((item): item is string => typeof item === 'string') : ['github-public'] }
      if (!Number.isFinite(Date.parse(policy.closeAt)) || Date.parse(policy.closeAt) <= Date.now()) return send(response, 400, { error: 'CLOSE_TIME_MUST_BE_IN_FUTURE' })
      const market: DemoMarket = { id: `market-${markets.length + 1}`, question, category: typeof body.category === 'string' ? body.category : 'Other', options, policy, policyHash: await policyHash(policy), policyLocked: false, status: 'OPEN', openedAt: Date.now(), closeAt: Date.parse(policy.closeAt), vaultBaseUnits: 0n, optionTotalsBaseUnits: options.map(() => 0n), participants: new Set(), positions: [], protocolFeesBaseUnits: 0n, creatorFeesBaseUnits: 0n }
      markets.push(market)
      return send(response, 201, { data: publicMarket(market), message: 'Market created in demo mode. Policy locks at first position.' })
    }
    if (request.method === 'POST' && path.match(/^\/api\/markets\/[^/]+\/positions$/)) {
      const market = getMarket(path)
      if (!market) return send(response, 404, { error: 'MARKET_NOT_FOUND' })
      const body = await readJson(request)
      const optionIndex = Number(body.optionIndex)
      const amountRaw = typeof body.amountBaseUnits === 'string' ? body.amountBaseUnits : String(body.amountBaseUnits ?? '')
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= market.options.length || !/^[1-9][0-9]*$/.test(amountRaw)) return send(response, 400, { error: 'INVALID_POSITION_INPUT' })
      try { assertCanPlacePosition(market); } catch (error) { return send(response, 409, { error: error instanceof Error ? error.message : 'POSITION_REJECTED' }) }
      const amount = BigInt(amountRaw)
      const protocolFee = amount * PROTOCOL_FEE_BPS / 10_000n
      const creatorFee = amount * CREATOR_FEE_BPS / 10_000n
      const wallet = typeof body.wallet === 'string' && body.wallet ? body.wallet : 'demo-wallet'
      const position = { id: `position-${market.positions.length + 1}`, wallet, optionIndex, amountBaseUnits: amount, claimed: false }
      market.policyLocked = true
      market.status = 'LOCKED'
      market.vaultBaseUnits += amount
      market.optionTotalsBaseUnits[optionIndex] += amount
      market.protocolFeesBaseUnits += protocolFee
      market.creatorFeesBaseUnits += creatorFee
      market.positions.push(position)
      market.participants.add(wallet)
      return send(response, 201, { data: { ...position, marketId: market.id, option: market.options[optionIndex], protocolFeeBaseUnits: protocolFee, creatorFeeBaseUnits: creatorFee, policyLocked: market.policyLocked, vaultBaseUnits: market.vaultBaseUnits } })
    }
    if (request.method === 'POST' && path.match(/^\/api\/markets\/[^/]+\/close$/)) {
      const market = getMarket(path)
      if (!market) return send(response, 404, { error: 'MARKET_NOT_FOUND' })
      if (Date.now() < market.closeAt) return send(response, 409, { error: 'CLOSE_TIME_NOT_REACHED', closeAt: new Date(market.closeAt).toISOString() })
      market.status = 'CLOSED'
      return send(response, 200, { data: publicMarket(market) })
    }
    if (request.method === 'POST' && path.match(/^\/api\/markets\/[^/]+\/resolve$/)) {
      const market = getMarket(path)
      if (!market) return send(response, 404, { error: 'MARKET_NOT_FOUND' })
      if (market.status !== 'CLOSED') return send(response, 409, { error: 'MARKET_NOT_CLOSED' })
      const body = await readJson(request)
      const submittedPolicyHash = typeof body.policyHash === 'string' ? body.policyHash : ''
      if (submittedPolicyHash !== market.policyHash) return send(response, 400, { error: 'INVALID_RESOLUTION_POLICY' })
      if (request.headers['x-beatx-resolver'] !== RESOLVER_AUTHORITY) return send(response, 403, { error: 'UNAUTHORIZED_RESOLVER' })
      const provider = await collectWithFallback(githubActivityProvider, 'solana-labs/solana')
      const bundle = await createEvidenceBundle(market.id, market.policy, provider.observations)
      if (typeof body.outcome === 'string' && body.outcome !== bundle.outcome) return send(response, 400, { error: 'OUTCOME_NOT_SUPPORTED_BY_EVIDENCE' })
      market.evidenceBundle = bundle
      market.providerHealth = provider.health
      market.winningOption = market.options.indexOf(bundle.outcome)
      market.status = 'RESOLVED'
      return send(response, 200, { data: { ...publicMarket(market), outcome: bundle.outcome, evidenceHash: bundle.evidenceHash, providerHealth: provider.health, resolver: bundle.resolverVersion, resolverAuthority: RESOLVER_AUTHORITY } })
    }
    if (request.method === 'POST' && path.match(/^\/api\/markets\/[^/]+\/claim$/)) {
      const market = getMarket(path)
      if (!market) return send(response, 404, { error: 'MARKET_NOT_FOUND' })
      const body = await readJson(request)
      const position = market.positions.find((item) => item.id === body.positionId)
      if (!position) return send(response, 404, { error: 'POSITION_NOT_FOUND' })
      if (typeof body.wallet !== 'string' || body.wallet !== position.wallet) return send(response, 403, { error: 'POSITION_OWNER_REQUIRED' })
      try { assertCanClaim(market) } catch (error) { return send(response, 409, { error: error instanceof Error ? error.message : 'RESOLUTION_NOT_FINAL' }) }
      if (market.winningOption === undefined) return send(response, 409, { error: 'RESOLUTION_NOT_FINAL' })
      if (position.claimed) return send(response, 409, { error: 'DOUBLE_CLAIM' })
      position.claimed = true
      if (position.optionIndex !== market.winningOption) { position.payoutBaseUnits = 0n; return send(response, 200, { data: { positionId: position.id, payoutBaseUnits: 0n, winning: false, claimed: true } }) }
      const winningPool = market.optionTotalsBaseUnits[market.winningOption]
      const payout = calculateProRataPayout(position.amountBaseUnits, winningPool, market.vaultBaseUnits)
      position.payoutBaseUnits = payout
      return send(response, 200, { data: { positionId: position.id, payoutBaseUnits: payout, winning: true, claimed: true, protocolFeesBaseUnits: market.protocolFeesBaseUnits, creatorFeesBaseUnits: market.creatorFeesBaseUnits } })
    }
    if (request.method === 'POST' && path === '/api/policies/hash') return send(response, 200, { policyHash: await policyHash(await readJson(request) as ResolutionPolicy) })
    if (request.method === 'GET' && path === '/api/providers/github') return send(response, 200, await collectWithFallback(githubActivityProvider, 'solana-labs/solana'))
    return send(response, 404, { error: 'NOT_FOUND' })
  } catch (error) { return send(response, 400, { error: error instanceof Error ? error.message : 'BAD_REQUEST' }) }
})

server.listen(port, '127.0.0.1', () => console.log(`BeatX API listening on 127.0.0.1:${port}`))
