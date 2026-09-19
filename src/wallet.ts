export type InjectedSolanaProvider = {
  publicKey?: { toString(): string }
  connect?: () => Promise<{ publicKey: { toString(): string } }>
}

export type WalletConnection = { address: string; source: 'injected' | 'demo'; network: 'unknown' | 'devnet' }

export async function connectSolanaWallet(): Promise<WalletConnection> {
  const provider = (globalThis as typeof globalThis & { solana?: InjectedSolanaProvider }).solana
  if (!provider?.connect) return { address: '8kT...x4Q', source: 'demo', network: 'devnet' }
  const result = await provider.connect()
  return { address: result.publicKey.toString(), source: 'injected', network: 'unknown' }
}
