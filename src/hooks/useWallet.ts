import { useCallback, useEffect, useState } from 'react'
import { connectSolanaWallet, disconnectWallet, getWalletBalance } from '../wallet'
import type { WalletState } from '../types'

const initialState: WalletState = {
  address: null,
  isConnected: false,
  network: 'unknown',
  balance: 0,
  source: 'demo',
  error: null,
}

export function useWallet() {
  const [state, setState] = useState<WalletState>(initialState)
  const [isLoading, setIsLoading] = useState(false)

  const connect = useCallback(async () => {
    setIsLoading(true)
    try {
      const nextState = await connectSolanaWallet()
      setState(nextState)
      return nextState
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed'
      const failedState = { ...initialState, error: message }
      setState(failedState)
      return failedState
    } finally {
      setIsLoading(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    setIsLoading(true)
    try {
      await disconnectWallet()
      setState(initialState)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refreshBalance = useCallback(async () => {
    if (!state.address || !state.isConnected || state.source === 'demo') return
    try {
      const balance = await getWalletBalance(state.address)
      setState((previous) => ({ ...previous, balance }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Balance refresh failed'
      setState((previous) => ({ ...previous, error: message }))
    }
  }, [state.address, state.isConnected, state.source])

  useEffect(() => {
    if (!state.address || !state.isConnected || state.source === 'demo') return
    void refreshBalance()
    const timer = window.setInterval(() => void refreshBalance(), 30000)
    return () => window.clearInterval(timer)
  }, [state.address, state.isConnected, state.source, refreshBalance])

  return { ...state, isLoading, connect, disconnect, refreshBalance }
}
