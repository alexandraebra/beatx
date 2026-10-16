import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createEvidenceBundle, assertCanClaim, assertCanPlacePosition, calculateProRataPayout, policyHash, type EvidenceBundle, type MarketState, type ResolutionPolicy } from '../../../packages/core/src/index.js'
import { collectWithFallback, githubActivityProvider, type ProviderHealth } from '../../../packages/providers/src/index.js'

const port = Number(process.env.PORT ?? 4000)
if (process.env.NODE_ENV === 'production') throw new Error('DEMO_API_DISABLED_IN_PRODUCTION')
const RESOLVER_AUTHORITY = process.env.BEATX_RESOLVER_AUTHORITY
if (!RESOLVER_AUTHORITY) throw new Error('BEATX_RESOLVER_AUTHORITY_REQUIRED')
const CORS_ORIGIN = process.env.BEATX_CORS_ORIGIN ?? 'http://localhost:5173'

type DemoPosition = {
  id: string
  wallet: string
  optionIndex: number
  amountBaseUnits: bigint
  claimed: boolean
  payoutBaseUnits?: bigint
}

type DemoMarket = MarketState & {
  question: string
  category: string
  options: string[]
  policy: ResolutionPolicy
  participants: Set<string>
  positions: DemoPosition[]
  policyLocked: boolean
  winningOption?: number
  evidenceBundle?: EvidenceBundle
  providerHealth?: ProviderHealth[]
}

const seedPolicy = (question: string, options: string[]): ResolutionPolicy => ({
  marketType: 'MULTIPLE_CHOICE',
  question,
  options,
  closeAt: new Date(Date.now() + 86400000 * 2).toISOString(),
  resolutionDeadline: new Date(Date.now() + 86400000 * 4).toISOString(),
  rule: 'Highest verified confidence wins',
  sources: ['https://api.github.com'],
})

const markets: DemoMarket[] = []

async function addSeed(id: string, question: string, category: string, options: string[]) {
  const policy = seedPolicy(question, options)
  markets.push({
    id,
    question,
    category,
    options,
    policy,
    policyHash: await policyHash(policy),
    policyLocked: false,
    status: 'OPEN',
    openedAt: Date.now(),
    closeAt: Date.parse(policy.closeAt),
    vaultBaseUnits: 0n,
    optionTotalsBaseUnits: Array(options.length).fill(0n),
    participants: new Set(),
    positions: [],
  })
}

const seedsReady = Promise.all([
  addSeed('market-cap', 'Which project reaches $10M market cap first?', 'Crypto', ['Monad', 'Sui', 'Berachain']),
  addSeed('hackathon', 'Which team wins the next Solana hackathon?', 'Technology', ['Solana', 'Monad', 'Other']),
])

function send(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': CORS_ORIGIN,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-beatx-resolver',
    'access-control-max-age': '600',
    vary: 'Origin',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(payload, (_, value) => typeof value === 'bigint' ? value.toString() : value))
}

function readPath(request: IncomingMessage) {
  return new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of request) { chunks.push(Buffer.from(chunk)); if (Buffer.concat(chunks).length > 64_000) throw new Error('BODY_TOO_LARGE') }
  const raw = Buffer.concat(chunks).toString()
  return raw ? JSON.parse(raw) as Record<string, unknown> : {}
}

function publicMarket(market: DemoMarket) {
  return {
    id: market.id,
    question: market.question,
    category: market.category,
    options: market.options,
    status: market.status,
    policyHash: market.policyHash,
    closeAt: new Date(market.closeAt).toISOString(),
    resolutionDeadline: new Date(Date.parse(market.policy.resolutionDeadline)).toISOString(),
    totalVolumeBaseUnits: market.vaultBaseUnits.toString(),
    optionTotalsBaseUnits: market.optionTotalsBaseUnits.map((value) => value.toString()),
    participantCount: market.participants.size,
    demo: true as const,
  }
}

function publicPosition(market: DemoMarket, position: DemoPosition) {
  return {
    id: position.id,
    marketId: market.id,
    option: market.options[position.optionIndex],
    optionIndex: position.optionIndex,
    amountBaseUnits: position.amountBaseUnits.toString(),
    wallet: position.wallet,
    claimed: position.claimed,
    payoutBaseUnits: position.payoutBaseUnits?.toString() ?? null,
    status: market.status !== 'RESOLVED'
      ? 'OPEN'
      : position.claimed
        ? (position.optionIndex === market.winningOption ? 'WON' : 'LOST')
        : position.optionIndex === market.winningOption ? 'CLAIMABLE' : 'LOST',
  }
}

async function collectMarketEvidence(market: DemoMarket) {
  if (process.env.BEATX_E2E_FIXTURE === '1') {
    return {
      observations: market.options.map((option, index) => ({
        entityId: option,
        metric: 'fixture_confidence',
        value: index === 0 ? 0.9 : 0.4,
        source: 'BeatX E2E fixture',
        sourceType: 'fixture',
        sourceUrl: 'https://example.com/beatx-e2e-fixture',
        observedAt: new Date().toISOString(),
        verified: true,
        confidence: index === 0 ? 0.9 : 0.4,
      })),
      health: [{ provider: 'e2e-fixture', healthy: true, stale: false, checkedAt: new Date().toISOString() }],
    }
  }

  const results = await Promise.all(market.options.map((option) => collectWithFallback(githubActivityProvider, option)))
  return { observations: results.flatMap((result) => result.observations), health: results.map((result) => result.health) }
}

function getMarket(path: string) {
  return markets.find((item) => item.id === path.split('/')[3])
}

const server = createServer(async (request, response) => {
  await seedsReady
  const path = readPath(request)

  try {
    if (request.method === 'OPTIONS') return send(response, 204, {})

    if (request.method === 'GET' && path === '/health') {
      return send(response, 200, { ok: true, service: 'beatx-api', mode: 'demo' })
    }

    if (request.method === 'GET' && path === '/api/markets') {
      return send(response, 200, { data: markets.map(publicMarket), demo: true })
    }

    if (request.method === 'GET' && path.startsWith('/api/portfolio/')) {
      const wallet = decodeURIComponent(path.split('/')[3] ?? '')
      if (!wallet) return send(response, 400, { error: 'WALLET_REQUIRED' })
      const matching = markets.flatMap((market) => market.positions.filter((position) => position.wallet === wallet).map((position) => ({ market, position })))
      const positions = matching.map(({ market, position }) => publicPosition(market, position))
      const claimableBaseUnits = matching.reduce((sum, { market, position }) => {
        if (market.status !== 'RESOLVED' || position.claimed || position.optionIndex !== market.winningOption) return sum
        const winningPool = market.optionTotalsBaseUnits[market.winningOption as number]
        return sum + calculateProRataPayout(position.amountBaseUnits, winningPool, market.vaultBaseUnits)
      }, 0n)
      return send(response, 200, { data: { wallet, positions, claimableBaseUnits }, demo: true })
    }

    if (request.method === 'GET' && path.match(/^\/api\/markets\/[^\/]+\/evidence$/)) {
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
      if (question.length < 12 || question.length > 160 || options.length < 2 || options.length > 8 || new Set(options.map((item) => item.toLowerCase())).size !== options.length) return send(response, 400, { error: 'INVALID_MARKET_INPUT' })

      const closeAt = typeof body.closeAt === 'string' ? body.closeAt : new Date(Date.now() + 86400000 * 2).toISOString()
      const resolutionDeadline = typeof body.resolutionDeadline === 'string' ? body.resolutionDeadline : new Date(Date.now() + 86400000 * 4).toISOString()
      const closeAtMs = Date.parse(closeAt)
      const resolutionDeadlineMs = Date.parse(resolutionDeadline)
      if (!Number.isFinite(closeAtMs) || !Number.isFinite(resolutionDeadlineMs) || closeAtMs <= Date.now() || resolutionDeadlineMs <= closeAtMs) return send(response, 400, { error: 'INVALID_MARKET_TIMES' })

      const policy: ResolutionPolicy = {
        marketType: body.marketType === 'YES_NO' ? 'YES_NO' : 'MULTIPLE_CHOICE',
        question,
        options,
        closeAt,
        resolutionDeadline,
        rule: 'Highest verified confidence wins',
        sources: Array.isArray(body.sources) ? body.sources.filter((item): item is string => typeof item === 'string') : ['https://api.github.com'],
      }

      const market: DemoMarket = {
        id: `market-${markets.length + 1}`,
        question,
        category: typeof body.category === 'string' ? body.category : 'Other',
        options,
        policy,
        policyHash: await policyHash(policy),
        policyLocked: false,
        status: 'OPEN',
        openedAt: Date.now(),
        closeAt: Date.parse(policy.closeAt),
        vaultBaseUnits: 0n,
        optionTotalsBaseUnits: Array(options.length).fill(0n),
        participants: new Set(),
        positions: [],
      }

      markets.push(market)
      return send(response, 201, { data: publicMarket(market), message: 'Market created in demo mode. Policy locks at first position.' })
    }

    if (request.method === 'POST' && path.match(/^\/api\/markets\/[^\/]+\/positions$/)) {
      const market = getMarket(path)
      if (!market) return send(response, 404, { error: 'MARKET_NOT_FOUND' })
      const body = await readJson(request)
      const optionIndex = Number(body.optionIndex)
      const amountRaw = typeof body.amountBaseUnits === 'string' ? body.amountBaseUnits : String(body.amountBaseUnits ?? '')
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= market.options.length || !/^[1-9][0-9]*$/.test(amountRaw)) {
        return send(response, 400, { error: 'INVALID_POSITION_INPUT' })
      }

      try {
        assertCanPlacePosition(market)
      } catch (error) {
        return send(response, 409, { error: error instanceof Error ? error.message : 'POSITION_REJECTED' })
      }

      const amount = BigInt(amountRaw)
      const wallet = typeof body.wallet === 'string' && body.wallet ? body.wallet : 'demo-wallet'
      const position: DemoPosition = {
        id: `position-${market.positions.length + 1}`,
        wallet,
        optionIndex,
        amountBaseUnits: amount,
        claimed: false,
      }

      market.policyLocked = true
      market.status = 'LOCKED'
      market.vaultBaseUnits += amount
      market.optionTotalsBaseUnits[optionIndex] += amount
      market.positions.push(position)
      market.participants.add(wallet)

      return send(response, 201, { data: { ...publicPosition(market, position), protocolFeeBaseUnits: 0n, creatorFeeBaseUnits: 0n }, message: 'Position created' })
    }

    if (request.method === 'POST' && path.match(/^\/api\/markets\/[^\/]+\/close$/)) {
      const market = getMarket(path)
      if (!market) return send(response, 404, { error: 'MARKET_NOT_FOUND' })
      if (Date.now() < market.closeAt) return send(response, 409, { error: 'CLOSE_TIME_NOT_REACHED', closeAt: new Date(market.closeAt).toISOString() })
      if (market.status !== 'OPEN' && market.status !== 'LOCKED') return send(response, 409, { error: 'MARKET_CANNOT_BE_CLOSED' })
      market.status = 'CLOSED'
      return send(response, 200, { data: publicMarket(market) })
    }

    if (request.method === 'POST' && path.match(/^\/api\/markets\/[^\/]+\/resolve$/)) {
      const market = getMarket(path)
      if (!market) return send(response, 404, { error: 'MARKET_NOT_FOUND' })
      if (market.status !== 'CLOSED') return send(response, 409, { error: 'MARKET_NOT_CLOSED' })
      if (Date.now() > Date.parse(market.policy.resolutionDeadline)) return send(response, 409, { error: 'RESOLUTION_DEADLINE_PASSED' })

      const body = await readJson(request)
      const submittedPolicyHash = typeof body.policyHash === 'string' ? body.policyHash : ''
      if (submittedPolicyHash !== market.policyHash) return send(response, 400, { error: 'INVALID_RESOLUTION_POLICY' })
      if (request.headers['x-beatx-resolver'] !== RESOLVER_AUTHORITY) return send(response, 403, { error: 'UNAUTHORIZED_RESOLVER' })

      const provider = await collectMarketEvidence(market)
      let bundle: EvidenceBundle
      try {
        bundle = await createEvidenceBundle(market.id, market.policy, provider.observations)
      } catch (error) {
        return send(response, 409, { error: error instanceof Error ? error.message : 'EVIDENCE_NOT_CONCLUSIVE' })
      }
      if (typeof body.outcome === 'string' && body.outcome !== bundle.outcome) return send(response, 400, { error: 'OUTCOME_NOT_SUPPORTED_BY_EVIDENCE' })

      market.evidenceBundle = bundle
      market.providerHealth = provider.health
      market.winningOption = market.options.indexOf(bundle.outcome)
      market.status = 'RESOLVED'
      return send(response, 200, { data: { ...publicMarket(market), outcome: bundle.outcome, evidenceHash: bundle.evidenceHash, providerHealth: provider.health, resolver: bundle.resolverVersion } })
    }

    if (request.method === 'POST' && path.match(/^\/api\/markets\/[^\/]+\/claim$/)) {
      const market = getMarket(path)
      if (!market) return send(response, 404, { error: 'MARKET_NOT_FOUND' })
      const body = await readJson(request)
      const position = market.positions.find((item) => item.id === body.positionId)
      if (!position) return send(response, 404, { error: 'POSITION_NOT_FOUND' })
      if (typeof body.wallet !== 'string' || body.wallet !== position.wallet) return send(response, 403, { error: 'POSITION_OWNER_REQUIRED' })

      try {
        assertCanClaim(market)
      } catch {
        return send(response, 409, { error: 'RESOLUTION_NOT_FINAL' })
      }

      if (market.winningOption === undefined) return send(response, 409, { error: 'RESOLUTION_NOT_FINAL' })
      if (position.claimed) return send(response, 409, { error: 'DOUBLE_CLAIM' })

      position.claimed = true
      if (position.optionIndex !== market.winningOption) {
        position.payoutBaseUnits = 0n
        return send(response, 200, { data: { positionId: position.id, payoutBaseUnits: 0n, winning: false, claimed: true } })
      }

      const winningPool = market.optionTotalsBaseUnits[market.winningOption]
      const payout = calculateProRataPayout(position.amountBaseUnits, winningPool, market.vaultBaseUnits)
      position.payoutBaseUnits = payout
      return send(response, 200, { data: { positionId: position.id, payoutBaseUnits: payout, winning: true, claimed: true } })
    }

    if (request.method === 'POST' && path === '/api/policies/hash') {
      return send(response, 200, { policyHash: await policyHash(await readJson(request) as ResolutionPolicy) })
    }

    if (request.method === 'GET' && path === '/api/providers/github') {
      return send(response, 200, await collectWithFallback(githubActivityProvider, 'solana-labs/solana'))
    }

    return send(response, 404, { error: 'NOT_FOUND' })
  } catch (error) {
    return send(response, 400, { error: error instanceof Error ? error.message : 'BAD_REQUEST' })
  }
})

server.listen(port, '127.0.0.1', () => console.log(`BeatX API listening on 127.0.0.1:${port}`))
