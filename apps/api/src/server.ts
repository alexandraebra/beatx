import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createEvidenceBundle, policyHash, type ResolutionPolicy } from '../../../packages/core/src/index.js'
import { collectWithFallback, githubActivityProvider } from '../../../packages/providers/src/index.js'

const port = Number(process.env.PORT ?? 4000)
const markets = [{ id: 'market-cap', question: 'Which project reaches $10M market cap first?', category: 'Crypto', status: 'OPEN', demo: true }, { id: 'hackathon', question: 'Which team wins the next Solana hackathon?', category: 'Technology', status: 'OPEN', demo: true }]

function send(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' })
  response.end(JSON.stringify(payload))
}

function readPath(request: IncomingMessage) { return new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname }

const server = createServer(async (request, response) => {
  const path = readPath(request)
  if (request.method === 'OPTIONS') return send(response, 204, {})
  if (request.method === 'GET' && path === '/health') return send(response, 200, { ok: true, service: 'beatx-api', mode: 'demo' })
  if (request.method === 'GET' && path === '/api/markets') return send(response, 200, { data: markets, demo: true })
  if (request.method === 'GET' && path.startsWith('/api/markets/')) {
    const market = markets.find((item) => item.id === path.split('/').pop())
    return market ? send(response, 200, { data: market }) : send(response, 404, { error: 'MARKET_NOT_FOUND' })
  }
  if (request.method === 'POST' && path === '/api/policies/hash') {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    try {
      const policy = JSON.parse(Buffer.concat(chunks).toString()) as ResolutionPolicy
      return send(response, 200, { policyHash: await policyHash(policy) })
    } catch { return send(response, 400, { error: 'INVALID_POLICY' }) }
  }
  if (request.method === 'GET' && path === '/api/providers/github') {
    const result = await collectWithFallback(githubActivityProvider, 'solana-labs/solana')
    return send(response, 200, result)
  }
  if (request.method === 'GET' && path === '/api/resolution/demo') {
    const policy: ResolutionPolicy = { marketType: 'MULTIPLE_CHOICE', question: markets[0].question, options: ['Monad', 'Sui', 'Berachain'], closeAt: new Date(Date.now() + 86400000).toISOString(), resolutionDeadline: new Date(Date.now() + 172800000).toISOString(), rule: 'Highest verified confidence wins', sources: ['github-public'] }
    const result = await collectWithFallback(githubActivityProvider, 'solana-labs/solana')
    return send(response, 200, { bundle: await createEvidenceBundle('market-cap', policy, result.observations), health: result.health })
  }
  return send(response, 404, { error: 'NOT_FOUND' })
})

server.listen(port, '127.0.0.1', () => console.log(`BeatX API listening on 127.0.0.1:${port}`))
