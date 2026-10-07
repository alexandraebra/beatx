import { useCallback, useState } from 'react'
import type { DraftMarket, Market, Portfolio, Position, ApiResponse } from '../types'

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
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

  const getMarkets = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      return await apiCall<Market[]>('GET', '/api/markets')
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const getMarket = useCallback(async (id: string) => {
    setIsLoading(true)
    setError(null)
    try {
      return await apiCall<Market>('GET', `/api/markets/${id}`)
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const getPortfolio = useCallback(async (wallet: string) => {
    setIsLoading(true)
    setError(null)
    try {
      return await apiCall<Portfolio>('GET', `/api/portfolio/${encodeURIComponent(wallet)}`)
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const createMarket = useCallback(async (draft: DraftMarket) => {
    setIsLoading(true)
    setError(null)
    try {
      return await apiCall<Market>('POST', '/api/markets', {
        question: draft.question,
        category: draft.category,
        description: draft.description,
        options: draft.options,
        closeAt: new Date(
          Date.now() + (draft.closeAtDays || 7) * 86400000
        ).toISOString(),
        resolutionDeadline: new Date(
          Date.now() + (draft.resolutionDeadlineDays || 8) * 86400000
        ).toISOString(),
        marketType: draft.options.length === 2 ? 'YES_NO' : 'MULTIPLE_CHOICE',
      })
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const placePosition = useCallback(
    async (
      marketId: string,
      optionIndex: number,
      amountBaseUnits: string,
      wallet: string
    ) => {
      setIsLoading(true)
      setError(null)
      try {
        return await apiCall<Position>(
          'POST',
          `/api/markets/${marketId}/positions`,
          {
            optionIndex,
            amountBaseUnits,
            wallet,
          }
        )
      } catch (err: any) {
        setError(err.message)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const closeMarket = useCallback(async (marketId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      return await apiCall<Market>('POST', `/api/markets/${marketId}/close`)
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const resolveMarket = useCallback(
    async (marketId: string, policyHash: string, outcome: string) => {
      setIsLoading(true)
      setError(null)
      try {
        return await apiCall<Market>('POST', `/api/markets/${marketId}/resolve`, {
          policyHash,
          outcome,
        })
      } catch (err: any) {
        setError(err.message)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const claimPayout = useCallback(
    async (marketId: string, positionId: string, wallet: string) => {
      setIsLoading(true)
      setError(null)
      try {
        return await apiCall<any>('POST', `/api/markets/${marketId}/claim`, {
          positionId,
          wallet,
        })
      } catch (err: any) {
        setError(err.message)
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
