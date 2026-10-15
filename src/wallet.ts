import type { WalletState } from './types'

type PublicKeyLike = { toString(): string; toBase58?: () => string }
type InjectedSolanaProvider = {
  publicKey?: PublicKeyLike | null
  connect?: () => Promise<{ publicKey?: PublicKeyLike } | void>
  disconnect?: () => Promise<void> | void
}

type SolanaWalletWindow = Window & {
  solana?: InjectedSolanaProvider
  phantom?: { solana?: InjectedSolanaProvider }
  solflare?: InjectedSolanaProvider
  backpack?: { solana?: InjectedSolanaProvider }
}

let activeProvider: InjectedSolanaProvider | null = null

function findProvider(): InjectedSolanaProvider | undefined {
  const target = window as SolanaWalletWindow
  return target.phantom?.solana ?? target.solflare ?? target.backpack?.solana ?? target.solana
}

function publicKeyString(key: PublicKeyLike): string {
  return key.toBase58?.() ?? key.toString()
}

export async function connectSolanaWallet(): Promise<WalletState> {
  const provider = findProvider()
  if (!provider?.connect) {
    return {
      address: 'demo-wallet',
      isConnected: true,
      network: 'devnet',
      balance: 0,
      source: 'demo',
      error: null,
    }
  }

  const result = await provider.connect()
  const publicKey = result?.publicKey ?? provider.publicKey
  if (!publicKey) throw new Error('Wallet did not provide a public key')
  activeProvider = provider
  const address = publicKeyString(publicKey)
  const balance = await getWalletBalance(address).catch(() => 0)

  return { address, isConnected: true, network: 'devnet', balance, source: 'injected', error: null }
}

export async function disconnectWallet(): Promise<void> {
  const provider = activeProvider
  activeProvider = null
  await provider?.disconnect?.()
}

export async function getWalletBalance(address: string): Promise<number> {
  if (!address || address === 'demo-wallet') return 0
  const endpoint = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address, { commitment: 'confirmed' }] }),
  })
  if (!response.ok) throw new Error('Could not read wallet balance')
  const payload = await response.json() as { result?: { value?: number }; error?: { message?: string } }
  if (payload.error || typeof payload.result?.value !== 'number') throw new Error(payload.error?.message || 'Invalid balance response')
  return payload.result.value / 1_000_000_000
}
