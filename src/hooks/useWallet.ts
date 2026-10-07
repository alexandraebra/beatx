import { useCallback, useEffect, useState } from 'react'
import { connectSolanaWallet, disconnectWallet, getWalletBalance, type WalletState } from '../wallet'

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    isConnected: false,
    network: 'unknown',
    balance: 0,
    source: 'demo',
    error: null,
  })
  const [isLoading, setIsLoading] = useState(false)

  const connect = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await connectSolanaWallet()
      setState(result)
    } catch (error: any) {
      setState((prev) => ({ ...prev, error: error?.message || 'Connection failed' }))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    setIsLoading(true)
    try {
      await disconnectWallet()
      setState({
        address: null,
        isConnected: false,
        network: 'unknown',
        balance: 0,
        source: 'demo',
        error: null,
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refreshBalance = useCallback(async () => {
    if (!state.address) return
    try {
      const balance = await getWalletBalance(state.address)
      setState((prev) => ({ ...prev, balance }))
    } catch (error) {
      console.error('Balance refresh error:', error)
    }
  }, [state.address])

  useEffect(() => {
    if (!state.address || !state.isConnected) return
    refreshBalance()
    const timer = setInterval(refreshBalance, 30000)
    return () => clearInterval(timer)
  }, [state.address, state.isConnected, refreshBalance])

  return { ...state, isLoading, connect, disconnect, refreshBalance }
}
