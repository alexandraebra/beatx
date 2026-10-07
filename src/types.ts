export type Category = 'All' | 'Crypto' | 'Technology' | 'Games' | 'Social' | 'Science'

export interface MarketOption {
  label: string
  volume: number
  probability?: number
}

export interface Market {
  id: string
  question: string
  description?: string
  category: Exclude<Category, 'All'>
  creator: string
  creatorAddress?: string
  initials: string
  accent: string
  ends: string
  volume: number
  participants: number
  options: MarketOption[]
  featured?: boolean
  status?: 'OPEN' | 'LOCKED' | 'CLOSED' | 'RESOLVED'
  closeAt?: string
  resolutionDeadline?: string
  policyHash?: string
  chainMarketAddress?: string
}

export interface Position {
  id: string
  marketId: string
  userAddress: string
  optionIndex: number
  amountBase: string // BigInt as string
  status: 'OPEN' | 'WON' | 'LOST' | 'REFUNDED'
  createdAt: string
  claimedAt?: string
  payoutBaseUnits?: string
}

export interface Portfolio {
  wallet: string
  positions: Position[]
  totalValue: number
  claimableBaseUnits: string
}

export interface DraftMarket {
  question: string
  category: Exclude<Category, 'All'>
  description?: string
  options: string[]
  closeAtDays?: number
  resolutionDeadlineDays?: number
}

export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
  demo?: boolean
}
