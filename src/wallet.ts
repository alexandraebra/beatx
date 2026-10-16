import { getWallets } from '@wallet-standard/app'
import type { Wallet, WalletAccount } from '@wallet-standard/base'
import {
  StandardConnect,
  StandardDisconnect,
  StandardEvents,
  type StandardConnectFeature,
  type StandardDisconnectFeature,
  type StandardEventsFeature,
} from '@wallet-standard/features'
import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa,
  SolanaMobileWalletAdapterWalletName,
} from '@solana-mobile/wallet-standard-mobile'

export const SOLANA_DEVNET_CHAIN = 'solana:devnet'
export const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com'
export const MOBILE_WALLET_NAME = SolanaMobileWalletAdapterWalletName

const browserWindow = typeof window === 'undefined' ? undefined : window as Window & { __beatxMwaRegistered?: boolean }

if (browserWindow && !browserWindow.__beatxMwaRegistered) {
  registerMwa({
    appIdentity: {
      name: 'BeatX',
      uri: browserWindow.location.origin,
      icon: `${browserWindow.location.origin}/beatx-wallet-icon.svg`,
    },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: [SOLANA_DEVNET_CHAIN],
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  })
  browserWindow.__beatxMwaRegistered = true
}

export const walletRegistry = getWallets()

export function walletSupportsDevnet(wallet: Wallet, account?: WalletAccount): boolean {
  const accountSupportsDevnet = !account || account.chains.includes(SOLANA_DEVNET_CHAIN)
  return wallet.chains.includes(SOLANA_DEVNET_CHAIN) && accountSupportsDevnet
}

export function canConnectWallet(wallet: Wallet): boolean {
  const feature = wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect] | undefined
  return typeof feature?.connect === 'function'
}

export async function connectStandardWallet(wallet: Wallet): Promise<WalletAccount> {
  if (!walletSupportsDevnet(wallet)) {
    throw new Error('This wallet does not advertise Solana Devnet support.')
  }

  const feature = wallet.features[StandardConnect] as StandardConnectFeature[typeof StandardConnect] | undefined
  if (typeof feature?.connect !== 'function') {
    throw new Error('This wallet does not support the standard connection flow.')
  }

  const { accounts } = await feature.connect()
  const account = accounts.find((candidate) => candidate.chains.includes(SOLANA_DEVNET_CHAIN)) ?? accounts[0]
  if (!account) throw new Error('The wallet did not authorize an account.')
  return account
}

export async function disconnectStandardWallet(wallet: Wallet): Promise<void> {
  const feature = wallet.features[StandardDisconnect] as StandardDisconnectFeature[typeof StandardDisconnect] | undefined
  await feature?.disconnect()
}

export function subscribeToWalletChanges(
  wallet: Wallet,
  listener: (accounts: readonly WalletAccount[] | undefined) => void,
): () => void {
  const feature = wallet.features[StandardEvents] as StandardEventsFeature[typeof StandardEvents] | undefined
  if (typeof feature?.on !== 'function') return () => undefined
  return feature.on('change', ({ accounts }) => listener(accounts))
}

export async function getDevnetBalance(address: string): Promise<number> {
  const response = await fetch(SOLANA_DEVNET_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address, { commitment: 'confirmed' }],
    }),
  })

  if (!response.ok) throw new Error('Could not read the Devnet balance.')
  const payload = await response.json() as { result?: { value?: number }; error?: { message?: string } }
  if (payload.error || typeof payload.result?.value !== 'number') {
    throw new Error(payload.error?.message || 'The Devnet RPC returned an invalid balance.')
  }
  return payload.result.value / 1_000_000_000
}
