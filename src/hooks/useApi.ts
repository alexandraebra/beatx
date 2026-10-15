import { useCallback, useState } from 'react'
import type { ApiMarket, ApiResponse, DraftMarket, Portfolio, Position } from '../types'

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim()
const apiBase = configuredApiBase || (import.meta.env.DEV ? 'http://localhost:4000' : '')

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function apiCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!apiBase) {
    throw new ApiError(0, 'API_NOT_CONFIGURED', 'Demo preview only: no live market API is connected.')
  }

  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const data = (await response.json()) as ApiResponse<T>

  if (!response.ok) {
    throw new ApiError(response.status, data.error || 'UNKNOWN_ERROR', data.error || response.statusText || 'Request failed')
  }

  if (data.data === undefined) {
    throw new ApiError(response.status, 'NO_DATA', 'No data returned from API')
  }

  return data.data
}

export function useApi() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wrap = useCallback(async <T,>(work: () => Promise<T>) => {
    setIsLoading(true)
    setError(null)
    try {
      return await work()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const getMarkets = useCallback(() => wrap(() => apiCall<ApiMarket[]>('GET', '/api/markets')), [wrap])
  const getMarket = useCallback((id: string) => wrap(() => apiCall<ApiMarket>('GET', `/api/markets/${encodeURIComponent(id)}`)), [wrap])
  const getPortfolio = useCallback((wallet: string) => wrap(() => apiCall<Portfolio>('GET', `/api/portfolio/${encodeURIComponent(wallet)}`)), [wrap])

  const createMarket = useCallback((draft: DraftMarket) => wrap(() => apiCall<ApiMarket>('POST', '/api/markets', {
    question: draft.question,
    category: draft.category,
    description: draft.description,
    options: draft.options,
    closeAt: new Date(Date.now() + (draft.closeAtDays || 7) * 86400000).toISOString(),
    resolutionDeadline: new Date(Date.now() + (draft.resolutionDeadlineDays || 8) * 86400000).toISOString(),
    marketType: draft.options.length === 2 ? 'YES_NO' : 'MULTIPLE_CHOICE',
  })), [wrap])

  const placePosition = useCallback((marketId: string, optionIndex: number, amountBaseUnits: string, wallet: string) => wrap(() => apiCall<Position>(
    'POST', `/api/markets/${encodeURIComponent(marketId)}/positions`, { optionIndex, amountBaseUnits, wallet },
  )), [wrap])

  const closeMarket = useCallback((marketId: string) => wrap(() => apiCall<ApiMarket>(
    'POST', `/api/markets/${encodeURIComponent(marketId)}/close`, {},
  )), [wrap])

  const resolveMarket = useCallback((marketId: string, policyHash: string, outcome: string) => wrap(() => apiCall<ApiMarket>(
    'POST', `/api/markets/${encodeURIComponent(marketId)}/resolve`, { policyHash, outcome },
  )), [wrap])

  const claimPayout = useCallback((marketId: string, positionId: string, wallet: string) => wrap(() => apiCall<{
    positionId: string
    payoutBaseUnits: string
    winning: boolean
    claimed: boolean
  }>('POST', `/api/markets/${encodeURIComponent(marketId)}/claim`, { positionId, wallet })), [wrap])

  return {
    isLoading,
    error,
    isApiConfigured: Boolean(apiBase),
    getMarkets,
    getMarket,
    getPortfolio,
    createMarket,
    placePosition,
    closeMarket,
    resolveMarket,
    claimPayout,
  }
}
