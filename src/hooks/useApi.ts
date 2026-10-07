import { useState, useCallback } from 'react'
import type { Market, Position, Portfolio, DraftMarket, ApiResponse } from '../types'

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function apiCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = (await response.json()) as ApiResponse<T>

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.error || 'UNKNOWN_ERROR',
      data.error || response.statusText || 'Request failed'
    )
  }

  if (!data.data) {
    throw new ApiError(response.status, 'NO_DATA', 'No data returned from API')
  }

  return data.data
}

export function useApi() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

  const getMarkets = useCallback(async (): Promise<Market[]> => {
    setIsLoading(true)
    setError(null)
    try {
      return await apiCall<Market[]>('GET', '/api/markets')
    } catch (err: any) {
      const message = err.message || 'Failed to fetch markets'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const getMarket = useCallback(
    async (marketId: string): Promise<Market> => {
      setIsLoading(true)
      setError(null)
      try {
        return await apiCall<Market>('GET', `/api/markets/${marketId}`)
      } catch (err: any) {
        const message = err.message || 'Failed to fetch market'
        setError(message)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const getPortfolio = useCallback(
    async (wallet: string): Promise<Portfolio> => {
      setIsLoading(true)
      setError(null)
      try {
        return await apiCall<Portfolio>('GET', `/api/portfolio/${encodeURIComponent(wallet)}`)
      } catch (err: any) {
        const message = err.message || 'Failed to fetch portfolio'
        setError(message)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const createMarket = useCallback(
    async (draft: DraftMarket): Promise<Market> => {
      setIsLoading(true)
      setError(null)
      try {
        const closeAt = new Date(Date.now() + (draft.closeAtDays || 7) * 86400000).toISOString()
        const resolutionDeadline = new Date(
          Date.now() + (draft.resolutionDeadlineDays || 8) * 86400000
        ).toISOString()

        return await apiCall<Market>('POST', '/api/markets', {
          question: draft.question,
          category: draft.category,
          description: draft.description,
          options: draft.options,
          closeAt,
          resolutionDeadline,
          marketType: draft.options.length === 2 ? 'YES_NO' : 'MULTIPLE_CHOICE',
        })
      } catch (err: any) {
        const message = err.message || 'Failed to create market'
        setError(message)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const placePosition = useCallback(
    async (
      marketId: string,
      optionIndex: number,
      amountBaseUnits: string,
      wallet: string
    ): Promise<Position> => {
      setIsLoading(true)
      setError(null)
      try {
        return await apiCall<Position>('POST', `/api/markets/${marketId}/positions`, {
          optionIndex,
          amountBaseUnits,
          wallet,
        })
      } catch (err: any) {
        const message = err.message || 'Failed to place position'
        setError(message)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const closeMarket = useCallback(
    async (marketId: string): Promise<Market> => {
      setIsLoading(true)
      setError(null)
      try {
        return await apiCall<Market>('POST', `/api/markets/${marketId}/close`)
      } catch (err: any) {
        const message = err.message || 'Failed to close market'
        setError(message)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const resolveMarket = useCallback(
    async (
      marketId: string,
      policyHash: string,
      outcome: string
    ): Promise<Market> => {
      setIsLoading(true)
      setError(null)
      try {
        return await apiCall<Market>('POST', `/api/markets/${marketId}/resolve`, {
          policyHash,
          outcome,
        })
      } catch (err: any) {
        const message = err.message || 'Failed to resolve market'
        setError(message)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const claimPayout = useCallback(
    async (marketId: string, positionId: string, wallet: string): Promise<any> => {
      setIsLoading(true)
      setError(null)
      try {
        return await apiCall<any>('POST', `/api/markets/${marketId}/claim`, {
          positionId,
          wallet,
        })
      } catch (err: any) {
        const message = err.message || 'Failed to claim payout'
        setError(message)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  return {
    isLoading,
    error,
    clearError,
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
