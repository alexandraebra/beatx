import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const port = 4010
const child = spawn(process.execPath, ['.api-dist/apps/api/src/server.js'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
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
  const closeAt = new Date(Date.now() + 250).toISOString()
  const created = await request('/api/markets', { method: 'POST', body: JSON.stringify({ question: 'Which release lands first in this acceptance test?', category: 'Technology', options: ['Alpha', 'Beta'], closeAt, resolutionDeadline: new Date(Date.now() + 10000).toISOString(), rule: 'First verified changelog entry', sources: ['https://example.com'] }) })
  assert.equal(created.status, 201)
  const market = created.body.data
  const position = await request(`/api/markets/${market.id}/positions`, { method: 'POST', body: JSON.stringify({ optionIndex: 0, amountBaseUnits: '100000000', wallet: 'wallet-a' }) })
  assert.equal(position.status, 201)
  assert.equal(position.body.data.policyLocked, true)
  await new Promise((resolve) => setTimeout(resolve, 350))
  const closed = await request(`/api/markets/${market.id}/close`, { method: 'POST', body: '{}' })
  assert.equal(closed.status, 200)
  const badResolution = await request(`/api/markets/${market.id}/resolve`, { method: 'POST', body: JSON.stringify({ outcome: 'Alpha', policyHash: 'sha256:wrong' }) })
  assert.equal(badResolution.status, 400)
  const resolved = await request(`/api/markets/${market.id}/resolve`, { method: 'POST', body: JSON.stringify({ outcome: 'Alpha', policyHash: market.policyHash }) })
  assert.equal(resolved.status, 200)
  assert.match(resolved.body.data.evidenceHash, /^sha256:/)
  const claimed = await request(`/api/markets/${market.id}/claim`, { method: 'POST', body: JSON.stringify({ positionId: position.body.data.id }) })
  assert.equal(claimed.status, 200)
  assert.equal(claimed.body.data.winning, true)
  assert(BigInt(claimed.body.data.payoutBaseUnits) >= 100000000n)
  const doubleClaim = await request(`/api/markets/${market.id}/claim`, { method: 'POST', body: JSON.stringify({ positionId: position.body.data.id }) })
  assert.equal(doubleClaim.status, 409)
  console.log(JSON.stringify({ status: 'PASS', marketId: market.id, policyLocked: true, evidenceHash: resolved.body.data.evidenceHash, doubleClaimRejected: true }))
} finally {
  child.kill('SIGTERM')
}
