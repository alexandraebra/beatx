import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const port = 4010
const testResolver = 'beatx-e2e-only-3f7018ad'
const child = spawn(process.execPath, ['.api-dist/apps/api/src/server.js'], { env: { ...process.env, PORT: String(port), BEATX_E2E_FIXTURE: '1', BEATX_RESOLVER_AUTHORITY: testResolver }, stdio: ['ignore', 'pipe', 'pipe'] })
const base = `http://127.0.0.1:${port}`

async function waitForApi() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${base}/health`)).ok) return } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('API_START_TIMEOUT')
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } })
  return { status: response.status, body: await response.json() }
}

try {
  await waitForApi()
  const preflight = await fetch(`${base}/api/markets`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-beatx-resolver' } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /POST/)
  assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /x-beatx-resolver/)
  const closeAt = new Date(Date.now() + 250).toISOString()
  const invalidDeadline = await request('/api/markets', { method: 'POST', body: JSON.stringify({ question: 'This deadline is invalid for acceptance?', options: ['Alpha', 'Beta'], closeAt, resolutionDeadline: new Date(Date.now() + 100).toISOString() }) })
  assert.equal(invalidDeadline.status, 400)
  const created = await request('/api/markets', { method: 'POST', body: JSON.stringify({ question: 'Which release lands first in this acceptance test?', category: 'Technology', options: ['Alpha', 'Beta'], closeAt, resolutionDeadline: new Date(Date.now() + 10000).toISOString(), rule: 'First verified changelog entry', sources: ['https://example.com'] }) })
  assert.equal(created.status, 201)
  const market = created.body.data
  const position = await request(`/api/markets/${market.id}/positions`, { method: 'POST', body: JSON.stringify({ optionIndex: 0, amountBaseUnits: '100000000', wallet: 'wallet-a' }) })
  assert.equal(position.status, 201)
  assert.equal(position.body.data.status, 'OPEN')
  const earlyClaim = await request(`/api/markets/${market.id}/claim`, { method: 'POST', body: JSON.stringify({ positionId: position.body.data.id, wallet: 'wallet-a' }) })
  assert.equal(earlyClaim.status, 409)
  await new Promise((resolve) => setTimeout(resolve, 350))
  const closed = await request(`/api/markets/${market.id}/close`, { method: 'POST', body: '{}' })
  assert.equal(closed.status, 200)
  const latePosition = await request(`/api/markets/${market.id}/positions`, { method: 'POST', body: JSON.stringify({ optionIndex: 1, amountBaseUnits: '100000000', wallet: 'wallet-b' }) })
  assert.equal(latePosition.status, 409)
  const unauthorizedResolution = await request(`/api/markets/${market.id}/resolve`, { method: 'POST', body: JSON.stringify({ outcome: 'Alpha', policyHash: market.policyHash }) })
  assert.equal(unauthorizedResolution.status, 403)
  const badResolution = await request(`/api/markets/${market.id}/resolve`, { method: 'POST', headers: { 'x-beatx-resolver': testResolver }, body: JSON.stringify({ outcome: 'Alpha', policyHash: 'sha256:wrong' }) })
  assert.equal(badResolution.status, 400)
  const evidenceMismatch = await request(`/api/markets/${market.id}/resolve`, { method: 'POST', headers: { 'x-beatx-resolver': testResolver }, body: JSON.stringify({ outcome: 'Beta', policyHash: market.policyHash }) })
  assert.equal(evidenceMismatch.status, 400)
  const resolved = await request(`/api/markets/${market.id}/resolve`, { method: 'POST', headers: { 'x-beatx-resolver': testResolver }, body: JSON.stringify({ policyHash: market.policyHash }) })
  assert.equal(resolved.status, 200)
  assert.match(resolved.body.data.evidenceHash, /^sha256:/)
  assert.equal(resolved.body.data.outcome, 'Alpha')
  const evidence = await request(`/api/markets/${market.id}/evidence`)
  assert.equal(evidence.status, 200)
  assert.equal(evidence.body.data.evidenceHash, resolved.body.data.evidenceHash)
  assert.equal(evidence.body.data.observations.length, 2)
  const wrongOwner = await request(`/api/markets/${market.id}/claim`, { method: 'POST', body: JSON.stringify({ positionId: position.body.data.id, wallet: 'wallet-b' }) })
  assert.equal(wrongOwner.status, 403)
  const claimed = await request(`/api/markets/${market.id}/claim`, { method: 'POST', body: JSON.stringify({ positionId: position.body.data.id, wallet: 'wallet-a' }) })
  assert.equal(claimed.status, 200)
  assert.equal(claimed.body.data.winning, true)
  assert(BigInt(claimed.body.data.payoutBaseUnits) >= 100000000n)
  const portfolio = await request('/api/portfolio/wallet-a')
  assert.equal(portfolio.status, 200)
  assert.equal(portfolio.body.data.positions[0].status, 'WON')
  assert.equal(portfolio.body.data.claimableBaseUnits, '0')
  const doubleClaim = await request(`/api/markets/${market.id}/claim`, { method: 'POST', body: JSON.stringify({ positionId: position.body.data.id, wallet: 'wallet-a' }) })
  assert.equal(doubleClaim.status, 409)
  console.log(JSON.stringify({ status: 'PASS', marketId: market.id, policyLocked: true, evidenceHash: resolved.body.data.evidenceHash, evidenceEndpointVerified: true, portfolioEndpointVerified: true, unauthorizedResolutionRejected: true, evidenceMismatchRejected: true, earlyClaimRejected: true, latePositionRejected: true, doubleClaimRejected: true }))
} finally {
  child.kill('SIGTERM')
}
