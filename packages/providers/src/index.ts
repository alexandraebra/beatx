import type { Observation } from '../../core/src/index.js'

export type ProviderHealth = { provider: string; healthy: boolean; stale: boolean; checkedAt: string; error?: string }

export type ProviderAdapter = {
  name: string
  collect(entityId: string): Promise<Observation[]>
}

export const demoObservations = (entityId: string): Observation[] => [{
  entityId,
  metric: 'public_activity_signal',
  value: 'demo signal',
  source: 'BeatX Demo Dataset',
  sourceType: 'demo',
  sourceUrl: 'https://example.com/beatx-demo',
  observedAt: new Date().toISOString(),
  verified: false,
  confidence: 0,
}]

export async function collectWithFallback(adapter: ProviderAdapter, entityId: string): Promise<{ observations: Observation[]; health: ProviderHealth }> {
  const checkedAt = new Date().toISOString()
  try {
    const observations = await Promise.race([
      adapter.collect(entityId),
      new Promise<Observation[]>((_, reject) => setTimeout(() => reject(new Error('PROVIDER_TIMEOUT')), 4500)),
    ])
    return { observations, health: { provider: adapter.name, healthy: true, stale: false, checkedAt } }
  } catch (error) {
    return { observations: demoObservations(entityId), health: { provider: adapter.name, healthy: false, stale: true, checkedAt, error: error instanceof Error ? error.message : 'PROVIDER_ERROR' } }
  }
}

export const githubActivityProvider: ProviderAdapter = {
  name: 'github-public',
  async collect(entityId) {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(entityId)}`, { headers: { Accept: 'application/vnd.github+json' } })
    if (!response.ok) throw new Error(`GITHUB_${response.status}`)
    const repo = await response.json() as { full_name?: string; stargazers_count?: number; forks_count?: number; updated_at?: string; html_url?: string }
    return [{ entityId, metric: 'stars', value: repo.stargazers_count ?? 0, source: 'GitHub public API', sourceType: 'api', sourceUrl: repo.html_url ?? 'https://github.com', observedAt: repo.updated_at ?? new Date().toISOString(), verified: true, confidence: 1 }]
  },
}
