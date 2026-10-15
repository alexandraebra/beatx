export type Category = 'Crypto' | 'Technology' | 'Games' | 'Social' | 'Science' | 'Other'

export type DraftMarket = {
  question: string
  category: Exclude<Category, 'Other'>
  description?: string
  options: string[]
  closeAtDays?: number
  resolutionDeadlineDays?: number
}

export type ApiMarketStatus = 'OPEN' | 'LOCKED' | 'CLOSED' | 'RESOLVED' | 'CANCELLED'

export type ApiMarket = {
  id: string
  question: string
  category: Category
  options: string[]
  status: ApiMarketStatus
  policyHash: string
  closeAt: string
  resolutionDeadline: string
  totalVolumeBaseUnits: string
  optionTotalsBaseUnits: string[]
  participantCount: number
  demo: true
}

export type PositionStatus = 'OPEN' | 'CLAIMABLE' | 'WON' | 'LOST'

export type Position = {
  id: string
  marketId: string
  option: string
  optionIndex: number
  amountBaseUnits: string
  wallet: string
  claimed: boolean
  payoutBaseUnits: string | null
  status: PositionStatus
}

export type Portfolio = {
  wallet: string
  positions: Position[]
  claimableBaseUnits: string
}

export type ApiResponse<T> = {
  data?: T
  error?: string
  message?: string
  demo?: boolean
}

export type WalletSource = 'injected' | 'demo'
export type WalletNetwork = 'unknown' | 'devnet'

export type WalletState = {
  address: string | null
  isConnected: boolean
  network: WalletNetwork
  balance: number
  source: WalletSource
  error: string | null
}
