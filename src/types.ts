export type Category = 'All' | 'Crypto' | 'Technology' | 'Games' | 'Social' | 'Science'

export type MarketStatus = 'OPEN' | 'LOCKED' | 'CLOSED' | 'RESOLVED'

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
  initials: string
  accent: string
  ends: string
  volume: number
  participants: number
  options: MarketOption[]
  featured?: boolean
  status?: MarketStatus
  closeAt?: string
  resolutionDeadline?: string
  policyHash?: string
  chainMarketAddress?: string
  creatorAddress?: string
}

export interface Position {
  id: string
  marketId: string
  userAddress: string
  optionIndex: number
  amountBase: string
  status: 'OPEN' | 'WON' | 'LOST' | 'REFUNDED'
  createdAt: string
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
