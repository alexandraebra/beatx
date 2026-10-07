import { Connection, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js'

export type SolanaProvider = {
  publicKey?: { toString(): string }
  isPhantom?: boolean
  isSolflare?: boolean
  isBackpack?: boolean
  connect?: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>
  disconnect?: () => Promise<void>
  signTransaction?: (transaction: Transaction) => Promise<Transaction>
  signAllTransactions?: (transactions: Transaction[]) => Promise<Transaction[]>
  signMessage?: (message: Uint8Array) => Promise<{ signature: Uint8Array; publicKey: string }>
}

export type WalletState = {
  address: string | null
  isConnected: boolean
  network: 'devnet' | 'mainnet' | 'unknown'
  balance: number
  source: 'phantom' | 'solflare' | 'backpack' | 'demo'
  error: string | null
}

const RPC_URL =
  import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const NETWORK = (
  import.meta.env.VITE_SOLANA_NETWORK || 'devnet'
) as 'devnet' | 'mainnet'

let cachedConnection: Connection | null = null

function getConnection() {
  if (!cachedConnection) {
    cachedConnection = new Connection(RPC_URL, 'confirmed')
  }
  return cachedConnection
}

function detectProvider(): SolanaProvider | null {
  const provider =
    (globalThis as any)?.solana ||
    (globalThis as any)?.phantom?.solana ||
    (globalThis as any)?.solflare?.solana ||
    (globalThis as any)?.backpack?.solana
  if (provider) return provider
  return null
}

function getSource(provider: SolanaProvider | null): WalletState['source'] {
  if (!provider) return 'demo'
  if (provider.isPhantom) return 'phantom'
  if (provider.isSolflare) return 'solflare'
  if (provider.isBackpack) return 'backpack'
  return 'demo'
}

async function fetchBalance(address: string) {
  try {
    const pubkey = new PublicKey(address)
    const balance = await getConnection().getBalance(pubkey)
    return balance / LAMPORTS_PER_SOL
  } catch {
    return 0
  }
}

async function determineNetwork() {
  try {
    const hash = await getConnection().getGenesisHash()
    if (hash === 'EtWTRABZaYq6iMfeYKUbQVHexX1G24cxupn2ruVKZYQ') return 'devnet'
    return 'mainnet'
  } catch {
    return 'unknown'
  }
}

export async function connectSolanaWallet(): Promise<WalletState> {
  const provider = detectProvider()

  if (!provider) {
    return {
      address: 'demo-wallet-' + Math.random().toString(36).slice(2, 9),
      isConnected: true,
      network: NETWORK,
      balance: 100,
      source: 'demo',
      error: null,
    }
  }

  try {
    const result = await provider.connect?.()
    if (!result?.publicKey) {
      throw new Error('Wallet did not return a public key')
    }

    const address = result.publicKey.toString()
    return {
      address,
      isConnected: true,
      network: await determineNetwork(),
      balance: await fetchBalance(address),
      source: getSource(provider),
      error: null,
    }
  } catch (error: any) {
    return {
      address: null,
      isConnected: false,
      network: 'unknown',
      balance: 0,
      source: getSource(provider),
      error: error?.message || 'Wallet connection failed',
    }
  }
}

export async function disconnectWallet(): Promise<void> {
  const provider = detectProvider()
  if (provider?.disconnect) await provider.disconnect()
}

export async function getWalletBalance(address: string) {
  return fetchBalance(address)
}

export async function signAndSendTransaction(transaction: Transaction) {
  const provider = detectProvider()
  if (!provider?.signTransaction)
    throw new Error('Wallet does not support signing')

  const transactionWithFeePayer = transaction
  if (!transactionWithFeePayer.feePayer && provider.publicKey) {
    transactionWithFeePayer.feePayer = new PublicKey(
      provider.publicKey.toString()
    )
  }

  const conn = getConnection()
  const { blockhash } = await conn.getLatestBlockhash('finalized')
  transactionWithFeePayer.recentBlockhash = blockhash

  const signed = await provider.signTransaction(transactionWithFeePayer)
  return conn.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
  })
}
