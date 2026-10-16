import { useCallback, useEffect, useState } from 'react'
import type { Wallet, WalletAccount } from '@wallet-standard/base'
import {
  canConnectWallet,
  connectStandardWallet,
  disconnectStandardWallet,
  getDevnetBalance,
  subscribeToWalletChanges,
  walletRegistry,
  walletSupportsDevnet,
} from '../wallet'

export type ConnectedWallet = {
  wallet: Wallet
  account: WalletAccount
  supportsDevnet: boolean
}

export function useWallet() {
  const [wallets, setWallets] = useState<readonly Wallet[]>([])
  const [connection, setConnection] = useState<ConnectedWallet | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [balanceError, setBalanceError] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false)

  useEffect(() => {
    const syncWallets = () => {
      setWallets(walletRegistry.get().filter(canConnectWallet).slice().sort((a, b) => a.name.localeCompare(b.name)))
    }
    syncWallets()
    const stopRegister = walletRegistry.on('register', syncWallets)
    const stopUnregister = walletRegistry.on('unregister', syncWallets)
    return () => {
      stopRegister()
      stopUnregister()
    }
  }, [])

  const connect = useCallback(async (wallet: Wallet) => {
    setError('')
    setIsLoading(true)
    try {
      const account = await connectStandardWallet(wallet)
      setConnection({ wallet, account, supportsDevnet: walletSupportsDevnet(wallet, account) })
      setBalance(null)
      setBalanceError('')
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Wallet connection failed.')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    const current = connection
    setIsLoading(true)
    setError('')
    try {
      if (current) await disconnectStandardWallet(current.wallet)
      setConnection(null)
      setBalance(null)
      setBalanceError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not disconnect the wallet.')
    } finally {
      setIsLoading(false)
    }
  }, [connection])

  const refreshBalance = useCallback(async () => {
    if (!connection) return
    setIsRefreshingBalance(true)
    setBalanceError('')
    try {
      const nextBalance = await getDevnetBalance(connection.account.address)
      setBalance(nextBalance)
    } catch (cause) {
      setBalanceError(cause instanceof Error ? cause.message : 'Could not refresh the Devnet balance.')
    } finally {
      setIsRefreshingBalance(false)
    }
  }, [connection])

  useEffect(() => {
    if (!connection) return
    return subscribeToWalletChanges(connection.wallet, (accounts) => {
      if (!accounts) return
      const nextAccount = accounts.find((account) => account.chains.includes('solana:devnet')) ?? accounts[0]
      if (!nextAccount) {
        setConnection(null)
        setBalance(null)
        return
      }
      setConnection({
        wallet: connection.wallet,
        account: nextAccount,
        supportsDevnet: walletSupportsDevnet(connection.wallet, nextAccount),
      })
    })
  }, [connection?.wallet])

  useEffect(() => {
    if (!connection) {
      setBalance(null)
      return
    }
    let cancelled = false
    const refresh = async () => {
      setIsRefreshingBalance(true)
      setBalanceError('')
      try {
        const nextBalance = await getDevnetBalance(connection.account.address)
        if (!cancelled) setBalance(nextBalance)
      } catch (cause) {
        if (!cancelled) setBalanceError(cause instanceof Error ? cause.message : 'Could not refresh the Devnet balance.')
      } finally {
        if (!cancelled) setIsRefreshingBalance(false)
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [connection?.account.address])

  return {
    wallets,
    connection,
    balance,
    balanceError,
    error,
    isLoading,
    isRefreshingBalance,
    connect,
    disconnect,
    refreshBalance,
  }
}
