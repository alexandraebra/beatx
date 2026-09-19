import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createEvidenceBundle, assertCanPlacePosition, policyHash, type MarketState, type ResolutionPolicy } from '../../../packages/core/src/index.js'
import { collectWithFallback, githubActivityProvider } from '../../../packages/providers/src/index.js'

const port = Number(process.env.PORT ?? 4000)
type DemoMarket = MarketState & { question: string; category: string; options: string[]; policy: ResolutionPolicy; participants: Set<string>; policyLocked: boolean }

const seedPolicy = (question: string, options: string[]): ResolutionPolicy => ({ marketType: 'MULTIPLE_CHOICE', question, options, closeAt: new Date(Date.now() + 86400000 * 2).toISOString(), resolutionDeadline: new Date(Date.now() + 86400000 * 3).toISOString(), rule: 'Highest verified confidence wins', sources: ['github-public'] })
const markets: DemoMarket[] = []

async function addSeed(id: string, question: string, category: string, options: string[]) {
  const policy = seedPolicy(question, options)
  markets.push({ id, question, category, options, policy, policyHash: await policyHash(policy), policyLocked: false, status: 'OPEN', openedAt: Date.now(), closeAt: Date.parse(policy.closeAt), vaultBaseUnits: 0n, optionTotalsBaseUnits: options.map(() => 0n), participants: new Set() })
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
function publicMarket(market: DemoMarket) { return { id: market.id, question: market.question, category: market.category, options: market.options, status: market.status, policyHash: market.policyHash, policyLocked: market.policyLocked, closeAt: new Date(market.closeAt).toISOString(), vaultBaseUnits: market.vaultBaseUnits, optionTotalsBaseUnits: market.optionTotalsBaseUnits, participants: market.participants.size, demo: true } }
function getMarket(path: string) { return markets.find((item) => item.id === path.split('/')[3]) }

const server = createServer(async (request, response) => {
  await seedsReady
  const path = readPath(request)
  try {
    if (request.method === 'OPTIONS') return send(response, 204, {})
    if (request.method === 'GET' && path === '/health') return send(response, 200, { ok: true, service: 'beatx-api', mode: 'demo' })
    if (request.method === 'GET' && path === '/api/markets') return send(response, 200, { data: markets.map(publicMarket), demo: true })
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
      const market: DemoMarket = { id: `market-${markets.length + 1}`, question, category: typeof body.category === 'string' ? body.category : 'Other', options, policy, policyHash: await policyHash(policy), policyLocked: false, status: 'OPEN', openedAt: Date.now(), closeAt: Date.parse(policy.closeAt), vaultBaseUnits: 0n, optionTotalsBaseUnits: options.map(() => 0n), participants: new Set() }
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
      market.policyLocked = true
      market.status = 'LOCKED'
      market.vaultBaseUnits += amount
      market.optionTotalsBaseUnits[optionIndex] += amount
      market.participants.add(typeof body.wallet === 'string' && body.wallet ? body.wallet : 'demo-wallet')
      return send(response, 201, { data: { marketId: market.id, option: market.options[optionIndex], amountBaseUnits: amount, policyLocked: market.policyLocked, vaultBaseUnits: market.vaultBaseUnits } })
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
      const outcome = typeof body.outcome === 'string' ? body.outcome : ''
      const submittedPolicyHash = typeof body.policyHash === 'string' ? body.policyHash : ''
      if (!market.options.includes(outcome) || submittedPolicyHash !== market.policyHash) return send(response, 400, { error: 'INVALID_RESOLUTION_POLICY' })
      const provider = await collectWithFallback(githubActivityProvider, 'solana-labs/solana')
      const bundle = await createEvidenceBundle(market.id, market.policy, provider.observations)
      market.status = 'RESOLVED'
      return send(response, 200, { data: { ...publicMarket(market), outcome, evidenceHash: bundle.evidenceHash, providerHealth: provider.health, resolver: bundle.resolverVersion } })
    }
    if (request.method === 'POST' && path === '/api/policies/hash') return send(response, 200, { policyHash: await policyHash(await readJson(request) as ResolutionPolicy) })
    if (request.method === 'GET' && path === '/api/providers/github') return send(response, 200, await collectWithFallback(githubActivityProvider, 'solana-labs/solana'))
    return send(response, 404, { error: 'NOT_FOUND' })
  } catch (error) { return send(response, 400, { error: error instanceof Error ? error.message : 'BAD_REQUEST' }) }
})

server.listen(port, '127.0.0.1', () => console.log(`BeatX API listening on 127.0.0.1:${port}`))
