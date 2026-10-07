import type { PublicKey, Transaction } from '@solana/web3.js'
import { Connection, LAMPORTS_PER_SOL, SystemProgram, clusterApiUrl } from '@solana/web3.js'

export interface SolanaProvider {
  publicKey?: { toString(): string }
  isConnected?: boolean
  isPhantom?: boolean
  connect?: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>
  disconnect?: () => Promise<void>
  signTransaction?: (transaction: Transaction) => Promise<Transaction>
  signAllTransactions?: (transactions: Transaction[]) => Promise<Transaction[]>
  signMessage?: (message: Uint8Array) => Promise<{ signature: Uint8Array; publicKey: string }>
}

export interface WalletState {
  address: string | null
  isConnected: boolean
  network: 'devnet' | 'mainnet' | 'unknown'
  balance: number // in SOL
  source: 'phantom' | 'solflare' | 'backpack' | 'demo'
  error: string | null
}

export interface WalletContextType {
  state: WalletState
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  sendTransaction: (transaction: Transaction) => Promise<string>
}

const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const NETWORK = (import.meta.env.VITE_SOLANA_NETWORK || 'devnet') as 'devnet' | 'mainnet'

let connection: Connection | null = null

function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(RPC_URL, 'confirmed')
  }
  return connection
}

async function getNetworkFromProvider(provider: SolanaProvider): Promise<'devnet' | 'unknown'> {
  try {
    const conn = getConnection()
    const genesisHash = await conn.getGenesisHash()
    // Devnet genesis hash
    if (genesisHash === 'EtWTRABZaYq6iMfeYKUbQVHexX1G24cxupn2ruVKZYQ') {
      return 'devnet'
    }
  } catch {
    // Silently handle connection errors
  }
  return 'unknown'
}

async function fetchBalance(address: string): Promise<number> {
  try {
    const conn = getConnection()
    const pubkey = new (await import('@solana/web3.js')).PublicKey(address)
    const balance = await conn.getBalance(pubkey)
    return balance / LAMPORTS_PER_SOL
  } catch {
    return 0
  }
}

function detectProviderSource(): SolanaProvider | null {
  const phantom = (globalThis as any)?.phantom?.solana
  const solflare = (globalThis as any)?.solflare?.solana || (globalThis as any)?.solflare
  const backpack = (globalThis as any)?.backpack?.solana

  // Phantom has highest priority
  if (phantom?.isPhantom) return phantom
  if (solflare?.isSolflare) return solflare
  if (backpack?.isBackpack) return backpack

  // Fallback generic solana provider
  const solana = (globalThis as any)?.solana
  if (solana) return solana

  return null
}

function getProviderName(provider: SolanaProvider | null): 'phantom' | 'solflare' | 'backpack' | 'demo' {
  if (!provider) return 'demo'
  if ((provider as any).isPhantom) return 'phantom'
  if ((provider as any).isSolflare) return 'solflare'
  if ((provider as any).isBackpack) return 'backpack'
  return 'demo'
}

export async function connectSolanaWallet(): Promise<WalletState> {
  try {
    const provider = detectProviderSource()

    if (!provider) {
      // Demo wallet fallback
      return {
        address: 'demo-wallet-' + Math.random().toString(36).substring(7),
        isConnected: true,
        network: 'devnet',
        balance: 100, // Mock balance
        source: 'demo',
        error: null,
      }
    }

    // Connect to provider
    if (provider.connect) {
      try {
        const result = await provider.connect()
        const address = result.publicKey.toString()
        const network = await getNetworkFromProvider(provider)
        const balance = await fetchBalance(address)
        const source = getProviderName(provider)

        return {
          address,
          isConnected: true,
          network,
          balance,
          source,
          error: null,
        }
      } catch (err: any) {
        return {
          address: null,
          isConnected: false,
          network: 'unknown',
          balance: 0,
          source: getProviderName(provider),
          error: err?.message || 'Connection failed',
        }
      }
    }

    // If already connected
    if (provider.publicKey) {
      const address = provider.publicKey.toString()
      const network = await getNetworkFromProvider(provider)
      const balance = await fetchBalance(address)
      const source = getProviderName(provider)

      return {
        address,
        isConnected: true,
        network,
        balance,
        source,
        error: null,
      }
    }

    return {
      address: null,
      isConnected: false,
      network: 'unknown',
      balance: 0,
      source: getProviderName(provider),
      error: 'Provider connected but no public key',
    }
  } catch (error: any) {
    return {
      address: null,
      isConnected: false,
      network: 'unknown',
      balance: 0,
      source: 'demo',
      error: error?.message || 'Unknown error',
    }
  }
}

export async function disconnectWallet(): Promise<void> {
  try {
    const provider = detectProviderSource()
    if (provider?.disconnect) {
      await provider.disconnect()
    }
  } catch (error) {
    console.error('Disconnect error:', error)
  }
}

export async function getWalletBalance(address: string): Promise<number> {
  return fetchBalance(address)
}

export async function sendTransactionViaWallet(
  transaction: Transaction
): Promise<string> {
  try {
    const provider = detectProviderSource()

    if (!provider?.signTransaction) {
      throw new Error('Wallet does not support transaction signing')
    }

    // Set fee payer if not already set
    if (!transaction.feePayer && provider.publicKey) {
      transaction.feePayer = new (await import('@solana/web3.js')).PublicKey(
        provider.publicKey.toString()
      )
    }

    // Get recent blockhash
    const conn = getConnection()
    const { blockhash } = await conn.getLatestBlockhash('finalized')
    transaction.recentBlockhash = blockhash

    // Sign transaction
    const signedTx = await provider.signTransaction(transaction)

    // Send transaction
    const signature = await conn.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    })

    // Wait for confirmation
    await conn.confirmTransaction(signature, 'confirmed')

    return signature
  } catch (error: any) {
    throw new Error(`Transaction failed: ${error?.message || 'Unknown error'}`)
  }
}
