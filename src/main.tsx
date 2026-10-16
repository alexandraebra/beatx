import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Check, CircleDollarSign, Compass, Landmark, Plus, RotateCcw, ShieldCheck, Sparkles, Trophy, X } from 'lucide-react'
import type { DemoStake } from '../packages/core/src/demo-settlement.js'
import { calculateDemoSettlement, DEMO_CREATOR_FEE_BPS, DEMO_PLATFORM_FEE_BPS } from '../packages/core/src/demo-settlement.js'
import type { Position } from './types'
import { WalletButton } from './WalletButton'
import './styles.css'

type Category = 'All' | 'Crypto' | 'Technology' | 'Games' | 'Social' | 'Science'
type MarketCategory = Exclude<Category, 'All'>
type MarketStatus = 'OPEN' | 'RESOLVED'
type Market = {
  id: string
  question: string
  category: MarketCategory
  creator: string
  initials: string
  accent: string
  ends: string
  volume: number
  participants: number
  featured?: boolean
  options: { label: string; volume: number }[]
  status: MarketStatus
  resolvedOptionIndex: number | null
  creatorIsUser: boolean
  totalPoolBaseUnits: string | null
  winnerPoolBaseUnits: string | null
  creatorFeeBaseUnits: string
  platformFeeBaseUnits: string
  creatorFeeClaimed: boolean
  platformFeeClaimed: boolean
}
type DemoLedger = { winnerClaimedBaseUnits: string; creatorClaimedBaseUnits: string; platformClaimedBaseUnits: string }
type DemoMarketDraft = { question: string; category: MarketCategory; options: string[] }

const ZERO_LEDGER: DemoLedger = { winnerClaimedBaseUnits: '0', creatorClaimedBaseUnits: '0', platformClaimedBaseUnits: '0' }
const DEMO_PICKS_KEY = 'beatx-demo-picks-v1'
const DEMO_MARKETS_KEY = 'beatx-demo-markets-v1'
const DEMO_LEDGER_KEY = 'beatx-demo-claims-v1'
const DEMO_PLATFORM_BPS = DEMO_PLATFORM_FEE_BPS
const DEMO_CREATOR_BPS = DEMO_CREATOR_FEE_BPS
const marketSeed: Market[] = [
  { id: 'market-cap', question: 'Which project reaches $10M market cap first?', category: 'Crypto', creator: 'Mira Chen', initials: 'MC', accent: '#b6ff61', ends: '2d 14h', volume: 39020, participants: 140, featured: true, status: 'OPEN', resolvedOptionIndex: null, creatorIsUser: false, totalPoolBaseUnits: null, winnerPoolBaseUnits: null, creatorFeeBaseUnits: '0', platformFeeBaseUnits: '0', creatorFeeClaimed: false, platformFeeClaimed: false, options: [{ label: 'Monad', volume: 42 }, { label: 'Sui', volume: 38 }, { label: 'Berachain', volume: 20 }] },
  { id: 'hackathon', question: 'Which team wins the next Solana hackathon?', category: 'Technology', creator: 'Alex Rivera', initials: 'AR', accent: '#7dd3fc', ends: '5d 03h', volume: 24780, participants: 96, status: 'OPEN', resolvedOptionIndex: null, creatorIsUser: false, totalPoolBaseUnits: null, winnerPoolBaseUnits: null, creatorFeeBaseUnits: '0', platformFeeBaseUnits: '0', creatorFeeClaimed: false, platformFeeClaimed: false, options: [{ label: 'Monad', volume: 46 }, { label: 'Solana', volume: 34 }, { label: 'Other', volume: 20 }] },
  { id: 'sol-threshold', question: 'Will SOL break $220 before the monthly close?', category: 'Crypto', creator: 'Nadia Park', initials: 'NP', accent: '#fbbf24', ends: '9d 06h', volume: 18640, participants: 82, status: 'OPEN', resolvedOptionIndex: null, creatorIsUser: false, totalPoolBaseUnits: null, winnerPoolBaseUnits: null, creatorFeeBaseUnits: '0', platformFeeBaseUnits: '0', creatorFeeClaimed: false, platformFeeClaimed: false, options: [{ label: 'Yes', volume: 62 }, { label: 'No', volume: 38 }] },
  { id: 'launch-date', question: 'Will Atlas launch a public beta by November 15, 2026?', category: 'Games', creator: 'Owen Brooks', initials: 'OB', accent: '#f472b6', ends: '30d 11h', volume: 9210, participants: 51, status: 'OPEN', resolvedOptionIndex: null, creatorIsUser: false, totalPoolBaseUnits: null, winnerPoolBaseUnits: null, creatorFeeBaseUnits: '0', platformFeeBaseUnits: '0', creatorFeeClaimed: false, platformFeeClaimed: false, options: [{ label: 'Yes', volume: 57 }, { label: 'No', volume: 43 }] },
]
const categories: Category[] = ['All', 'Crypto', 'Technology', 'Games', 'Social', 'Science']

function formatVolume(value: number) {
  const amount = value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return `${amount} BEATX`
}

function formatBaseUnits(value: string) {
  try {
    const units = BigInt(value)
    const whole = (units / 1_000_000n).toLocaleString('en-US')
    const fraction = (units % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
    return fraction ? `${whole}.${fraction}` : whole
  } catch {
    return '0'
  }
}

function toBaseUnits(value: string): string | null {
  const normalized = value.trim()
  if (!/^\d+(\.\d{1,6})?$/.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split('.')
  const base = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
  return base > 0n ? base.toString() : null
}

function sumUnits(values: readonly string[]) {
  return values.reduce((sum, value) => /^\d+$/.test(value) ? sum + BigInt(value) : sum, 0n).toString()
}

function readDemoPicks(): Position[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(DEMO_PICKS_KEY) ?? '[]')
    if (!Array.isArray(stored)) return []
    const statuses = new Set(['OPEN', 'CLAIMABLE', 'WON', 'LOST'])
    return stored.filter((item): item is Position =>
      item && typeof item.id === 'string' && typeof item.marketId === 'string' &&
      typeof item.option === 'string' && typeof item.amountBaseUnits === 'string' && /^\d+$/.test(item.amountBaseUnits) &&
      item.wallet === 'local-demo' && statuses.has(item.status) && typeof item.claimed === 'boolean' &&
      (item.payoutBaseUnits === null || typeof item.payoutBaseUnits === 'string'),
    )
  } catch {
    return []
  }
}

function isMarket(value: unknown): value is Market {
  if (!value || typeof value !== 'object') return false
  const market = value as Partial<Market>
  return typeof market.id === 'string' && typeof market.question === 'string' &&
    typeof market.category === 'string' && Array.isArray(market.options) && market.options.length >= 2 &&
    (market.status === 'OPEN' || market.status === 'RESOLVED') &&
    market.options.every((option) => option && typeof option.label === 'string' && Number.isFinite(option.volume))
}

function readDemoMarkets(): Market[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(DEMO_MARKETS_KEY) ?? 'null')
    if (Array.isArray(stored) && stored.length > 0 && stored.length <= 100 && stored.every(isMarket)) return stored
  } catch { /* Start with the bundled preview markets if storage is unavailable. */ }
  return marketSeed
}

function readDemoLedger(): DemoLedger {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(DEMO_LEDGER_KEY) ?? 'null')
    if (stored && typeof stored === 'object') {
      const ledger = stored as Partial<DemoLedger>
      if ([ledger.winnerClaimedBaseUnits, ledger.creatorClaimedBaseUnits, ledger.platformClaimedBaseUnits].every((value) => typeof value === 'string' && /^\d+$/.test(value))) {
        return ledger as DemoLedger
      }
    }
  } catch { /* Local storage is optional. */ }
  return ZERO_LEDGER
}

function sampleStakes(market: Market): DemoStake[] {
  const total = BigInt(toBaseUnits(String(market.volume)) ?? '0')
  if (total <= 0n) return []
  const weights = market.options.map((option) => BigInt(Math.max(0, Math.round(option.volume))))
  const weightTotal = weights.reduce((sum, value) => sum + value, 0n)
  if (weightTotal <= 0n) return []
  let assigned = 0n
  return market.options.flatMap((option, index) => {
    const amount = index === market.options.length - 1 ? total - assigned : total * weights[index] / weightTotal
    assigned += amount
    return amount > 0n ? [{ id: `sample-${market.id}-${index}`, optionIndex: index, amountBaseUnits: amount.toString() }] : []
  })
}

function App() {
  const [activeCategory, setActiveCategory] = useState<Category>('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [markets, setMarkets] = useState<Market[]>(readDemoMarkets)
  const [selectedMarketId, setSelectedMarketId] = useState(marketSeed[0].id)
  const [selectedOption, setSelectedOption] = useState(0)
  const [resolutionOption, setResolutionOption] = useState(0)
  const [amount, setAmount] = useState('5')
  const [notice, setNotice] = useState('')
  const [showCreateMarket, setShowCreateMarket] = useState(false)
  const [portfolio, setPortfolio] = useState<Position[]>(readDemoPicks)
  const [ledger, setLedger] = useState<DemoLedger>(readDemoLedger)
  const noticeTimer = useRef<number | undefined>(undefined)
  const selectedMarket = markets.find((market) => market.id === selectedMarketId) ?? markets[0]

  const visibleMarkets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return markets.filter((market) => {
      const matchesCategory = activeCategory === 'All' || market.category === activeCategory
      const matchesSearch = !term || `${market.question} ${market.category} ${market.options.map((option) => option.label).join(' ')}`.toLowerCase().includes(term)
      return matchesCategory && matchesSearch
    })
  }, [activeCategory, markets, searchTerm])

  const claimableWinnings = useMemo(() => sumUnits(portfolio.filter((pick) => pick.status === 'CLAIMABLE' && !pick.claimed).map((pick) => pick.payoutBaseUnits ?? '0')), [portfolio])
  const claimableCreatorFees = useMemo(() => sumUnits(markets.filter((market) => market.creatorIsUser && market.status === 'RESOLVED' && !market.creatorFeeClaimed).map((market) => market.creatorFeeBaseUnits)), [markets])
  const claimablePlatformFees = useMemo(() => sumUnits(markets.filter((market) => market.status === 'RESOLVED' && !market.platformFeeClaimed).map((market) => market.platformFeeBaseUnits)), [markets])
  const claimableTotal = BigInt(claimableWinnings) + BigInt(claimableCreatorFees) + BigInt(claimablePlatformFees)

  useEffect(() => {
    try { window.localStorage.setItem(DEMO_PICKS_KEY, JSON.stringify(portfolio)) } catch { /* Local storage is optional. */ }
  }, [portfolio])
  useEffect(() => {
    try { window.localStorage.setItem(DEMO_MARKETS_KEY, JSON.stringify(markets)) } catch { /* Local storage is optional. */ }
  }, [markets])
  useEffect(() => {
    try { window.localStorage.setItem(DEMO_LEDGER_KEY, JSON.stringify(ledger)) } catch { /* Local storage is optional. */ }
  }, [ledger])
  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])
  useEffect(() => { setResolutionOption(0); setSelectedOption(0) }, [selectedMarketId])

  const notify = (message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3600)
  }

  const handleCreateMarket = (draft: DemoMarketDraft) => {
    const baseShare = Math.floor(100 / draft.options.length)
    const options = draft.options.map((label, index) => ({ label, volume: index === draft.options.length - 1 ? 100 - baseShare * index : baseShare }))
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const market: Market = {
      id, question: draft.question, category: draft.category, creator: 'You · this browser', initials: 'YOU', accent: '#b6ff61', ends: 'Local demo',
      volume: 1000, participants: 24, options, status: 'OPEN', resolvedOptionIndex: null, creatorIsUser: true,
      totalPoolBaseUnits: null, winnerPoolBaseUnits: null, creatorFeeBaseUnits: '0', platformFeeBaseUnits: '0', creatorFeeClaimed: false, platformFeeClaimed: false,
    }
    setMarkets((current) => [market, ...current])
    setSelectedMarketId(id)
    setShowCreateMarket(false)
    setActiveCategory('All')
    setSearchTerm('')
    notify('Your local demo market is ready. No market was published on-chain.')
  }

  const handleDemoPick = () => {
    if (selectedMarket.status !== 'OPEN') return notify('This demo market is already resolved.')
    const amountBaseUnits = toBaseUnits(amount)
    if (!amountBaseUnits) return notify('Enter a demo amount greater than 0 (up to 6 decimals).')
    const option = selectedMarket.options[selectedOption]
    const pick: Position = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, marketId: selectedMarket.id, option: option.label,
      optionIndex: selectedOption, amountBaseUnits, wallet: 'local-demo', claimed: false, payoutBaseUnits: null, status: 'OPEN',
    }
    setPortfolio((current) => [pick, ...current])
    notify(`${option.label} saved as a local demo pick. No wallet or Devnet transaction involved.`)
  }

  const handleResolveMarket = () => {
    if (selectedMarket.status !== 'OPEN') return notify('This market already has a simulated result.')
    const winningIndex = resolutionOption
    if (!Number.isInteger(winningIndex) || winningIndex < 0 || winningIndex >= selectedMarket.options.length) return notify('Choose a valid demo result.')
    const localStakes = portfolio.filter((pick) => pick.marketId === selectedMarket.id && pick.status === 'OPEN').map((pick) => ({ id: pick.id, optionIndex: pick.optionIndex, amountBaseUnits: pick.amountBaseUnits }))
    try {
      const settlement = calculateDemoSettlement([...sampleStakes(selectedMarket), ...localStakes], winningIndex)
      setMarkets((current) => current.map((market) => market.id === selectedMarket.id ? {
        ...market, status: 'RESOLVED', resolvedOptionIndex: winningIndex, totalPoolBaseUnits: settlement.totalPoolBaseUnits,
        winnerPoolBaseUnits: settlement.winnerPoolBaseUnits, creatorFeeBaseUnits: settlement.creatorFeeBaseUnits,
        platformFeeBaseUnits: settlement.platformFeeBaseUnits, creatorFeeClaimed: false, platformFeeClaimed: false,
      } : market))
      setPortfolio((current) => current.map((pick) => {
        if (pick.marketId !== selectedMarket.id || pick.status !== 'OPEN') return pick
        return { ...pick, status: pick.optionIndex === winningIndex ? 'CLAIMABLE' : 'LOST', payoutBaseUnits: settlement.payoutsBaseUnits[pick.id] ?? '0', claimed: false }
      }))
      notify(`Demo result: ${selectedMarket.options[winningIndex].label}. Fees and payouts are simulated only.`)
    } catch (error) {
      notify(error instanceof Error ? error.message.replace(/_/g, ' ').toLowerCase() : 'Could not simulate this result.')
    }
  }

  const handleClaimWinnings = () => {
    const amountToClaim = BigInt(claimableWinnings)
    if (amountToClaim <= 0n) return notify('There are no demo winner payouts to claim.')
    setPortfolio((current) => current.map((pick) => pick.status === 'CLAIMABLE' && !pick.claimed ? { ...pick, claimed: true, status: 'WON' } : pick))
    setLedger((current) => ({ ...current, winnerClaimedBaseUnits: (BigInt(current.winnerClaimedBaseUnits) + amountToClaim).toString() }))
    notify(`${formatBaseUnits(amountToClaim.toString())} demo BEATX marked as claimed locally.`)
  }

  const handleClaimCreatorFees = () => {
    const amountToClaim = BigInt(claimableCreatorFees)
    if (amountToClaim <= 0n) return notify('No creator demo fees are available yet. Create and resolve your own market first.')
    setMarkets((current) => current.map((market) => market.creatorIsUser && market.status === 'RESOLVED' ? { ...market, creatorFeeClaimed: true } : market))
    setLedger((current) => ({ ...current, creatorClaimedBaseUnits: (BigInt(current.creatorClaimedBaseUnits) + amountToClaim).toString() }))
    notify(`${formatBaseUnits(amountToClaim.toString())} creator demo fees marked as claimed locally.`)
  }

  const handleClaimPlatformFees = () => {
    const amountToClaim = BigInt(claimablePlatformFees)
    if (amountToClaim <= 0n) return notify('No platform demo fees are available yet. Resolve a demo market first.')
    setMarkets((current) => current.map((market) => market.status === 'RESOLVED' ? { ...market, platformFeeClaimed: true } : market))
    setLedger((current) => ({ ...current, platformClaimedBaseUnits: (BigInt(current.platformClaimedBaseUnits) + amountToClaim).toString() }))
    notify(`${formatBaseUnits(amountToClaim.toString())} platform demo fees moved to the simulated treasury.`)
  }

  const clearOpenPicks = () => {
    setPortfolio((current) => current.filter((pick) => pick.status !== 'OPEN'))
    notify('Unresolved local picks were cleared. Settled claim history remains.')
  }

  const removeDemoPick = (id: string) => {
    setPortfolio((current) => current.filter((pick) => pick.id !== id || pick.status !== 'OPEN'))
    notify('Open demo pick removed from this browser.')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="BeatX home"><span className="brand-mark"><span /></span><span>Beat<span className="brand-x">X</span></span></a>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a className="active" href="#explore">Explore</a><a href="#demo-pick">Try a pick</a><a href="#claims">Claims</a><a href="#how-it-works">How it works</a>
        </nav>
        <div className="top-actions"><span className="launch-pill"><Sparkles size={14} /> Demo mode · no live markets</span><WalletButton /></div>
      </header>

      <main id="top">
        <section className="hero wrap">
          <div className="hero-copy">
            <div className="eyebrow"><span className="pulse-dot" /> LOCAL PREVIEW · ZERO TRANSACTIONS <span className="eyebrow-line" /></div>
            <h1>Make a market.<br /><em>See the payout.</em></h1>
            <p>Create a sample market, try a pick, then simulate the result and explore winner, creator, and platform claims. Everything stays in this browser.</p>
            <div className="hero-actions"><a className="primary" href="#explore"><Compass size={15} /> Explore demo markets</a><a className="secondary" href="#claims">View claim center</a></div>
            <div className="meta-row"><span><ShieldCheck size={14} /> Local-only simulation</span><span>3% platform · 2% creator demo fees</span></div>
          </div>
          <div className="hero-orbit" aria-hidden="true"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-core"><div className="core-label">BEATX PREVIEW</div><strong>{selectedMarket.question}</strong></div></div>
        </section>

        <section className="ticker" aria-label="Preview status"><div className="ticker-inner"><span>NO LIVE DEVNET MARKETS</span><i /><span className="ticker-item">MARKETS SAVED LOCALLY</span><span className="ticker-item">MOCK CLAIMS ONLY</span><span className="ticker-item">NO TOKENS MOVE</span></div></section>

        <section className="section wrap" id="explore">
          <div className="section-heading">
            <div><div className="section-kicker">SAMPLE MARKETS · NOT LIVE ON DEVNET</div><h2>Find your <em>next pick.</em></h2></div>
            <div className="market-heading-actions"><span className="market-count">{visibleMarkets.length} demo {visibleMarkets.length === 1 ? 'market' : 'markets'}</span><button type="button" className="create-market-trigger" onClick={() => setShowCreateMarket((value) => !value)}><Plus size={15} /> Create demo market</button></div>
          </div>

          {showCreateMarket && <CreateDemoMarketForm onCreate={handleCreateMarket} onCancel={() => setShowCreateMarket(false)} />}

          <div className="market-controls">
            <label className="sr-only" htmlFor="market-search">Search demo markets</label>
            <input id="market-search" aria-label="Search demo markets" type="search" placeholder="Search a topic or outcome…" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            <div className="category-filters" aria-label="Filter markets by category">{categories.map((category) => <button type="button" key={category} aria-pressed={activeCategory === category} className={activeCategory === category ? 'category-chip active' : 'category-chip'} onClick={() => setActiveCategory(category)}>{category}</button>)}</div>
          </div>

          {visibleMarkets.length > 0 ? <div className="market-grid">
            {visibleMarkets.map((market) => (
              <button type="button" key={market.id} aria-pressed={selectedMarket.id === market.id} className={`${market.featured ? 'market-card featured' : 'market-card'}${selectedMarket.id === market.id ? ' selected-market' : ''}`} onClick={() => setSelectedMarketId(market.id)}>
                <div className="card-top"><div className="creator-badge" style={{ background: market.accent }}>{market.initials}</div><div className="card-copy"><div className="card-kind">{market.category} · {market.status === 'RESOLVED' ? 'SETTLED DEMO' : 'SAMPLE'}</div><div className="card-title">{market.question}</div></div></div>
                <div className="card-meta"><div><div className="meta-label">{market.creatorIsUser ? 'Simulated pool' : 'Sample volume'}</div><div className="meta-value">{formatVolume(market.volume)}</div></div><div><div className="meta-label">Sample picks</div><div className="meta-value">{market.participants}</div></div></div>
                <div className="card-options">{market.options.map((option, index) => <span key={option.label} className={market.resolvedOptionIndex === index ? 'option-pill resolved-option-pill' : 'option-pill'}>{option.label}{market.resolvedOptionIndex === index ? ' ✓' : ''}</span>)}</div>
                <span className={market.status === 'RESOLVED' ? 'market-state resolved' : 'market-state'}>{market.status === 'RESOLVED' ? 'Resolved locally' : 'Demo market'}</span>
              </button>
            ))}
          </div> : <div className="market-empty"><Sparkles size={20} /><strong>No demo markets match that search.</strong><span>Try another topic or clear the filters.</span><button type="button" onClick={() => { setSearchTerm(''); setActiveCategory('All') }}>Show all markets</button></div>}
        </section>

        <section className="room-section" id="demo-pick"><div className="wrap">
          <div className="section-heading room-heading"><div><div className="section-kicker">DEMO PICK · RESOLUTION SIMULATOR</div><h2>Try the <em>whole flow.</em></h2></div><span className="fee-pill">Platform {DEMO_PLATFORM_BPS / 100}% · creator {DEMO_CREATOR_BPS / 100}%</span></div>
          <div className="market-room">
            <div className="room-panel">
              <div className="room-panel-header"><div><div className="section-kicker">{selectedMarket.category} · LOCAL SAMPLE MARKET</div><h2>{selectedMarket.question}</h2><p className="market-creator-line">Created by <strong>{selectedMarket.creator}</strong></p></div><span className={selectedMarket.status === 'RESOLVED' ? 'sample-badge settled-badge' : 'sample-badge'}>{selectedMarket.status === 'RESOLVED' ? 'Resolved' : 'Preview'}</span></div>
              <div className="room-panel-body">
                {selectedMarket.status === 'OPEN' ? <>
                  <div className="option-list" role="group" aria-label="Choose a demo outcome">{selectedMarket.options.map((option, index) => <button type="button" key={option.label} aria-pressed={selectedOption === index} className={selectedOption === index ? 'option-active' : ''} onClick={() => setSelectedOption(index)}><span className="option-name">{option.label}</span><span className="option-rate">{Math.round((option.volume / selectedMarket.options.reduce((sum, item) => sum + item.volume, 0)) * 100)}% sample share</span>{selectedOption === index && <span className="choice-check"><Check size={13} /></span>}</button>)}</div>
                  <label className="demo-size-label" htmlFor="demo-amount">How big is your demo pick? <span>Hypothetical BEATX amount</span></label>
                  <div className="demo-amount-row"><div className="demo-amount-field"><input id="demo-amount" aria-label="Hypothetical BEATX amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="5" /><span>BEATX</span></div><div className="quick-amounts" aria-label="Quick demo amounts">{['1', '5', '25'].map((value) => <button type="button" key={value} aria-pressed={amount === value} onClick={() => setAmount(value)}>{value}</button>)}</div></div>
                  <button type="button" className="primary pick-submit" onClick={handleDemoPick}><Sparkles size={15} /> Save my demo pick</button>
                  <p className="demo-note">Saved only in this browser. The connected wallet is never used for picks or claims.</p>
                  <div className="resolution-box"><div className="resolution-heading"><div><div className="section-kicker">PRACTICE THE SETTLEMENT</div><strong>Pick a sample result</strong></div><span className="resolution-icon"><RotateCcw size={15} /></span></div><p>Resolve this preview market to calculate a winner payout plus creator and platform demo fees.</p><div className="resolution-controls"><select aria-label="Choose simulated winning outcome" value={resolutionOption} onChange={(event) => setResolutionOption(Number(event.target.value))}>{selectedMarket.options.map((option, index) => <option key={option.label} value={index}>{option.label} wins</option>)}</select><button type="button" className="resolve-button" onClick={handleResolveMarket}>Simulate result</button></div><small>Uses sample pool + picks saved in this browser. No oracle, wallet signature, or token transfer.</small></div>
                </> : <div className="resolved-summary"><div className="resolved-stamp"><Check size={16} /> DEMO RESULT</div><h3>{selectedMarket.options[selectedMarket.resolvedOptionIndex ?? 0]?.label ?? 'Resolved'}</h3><div className="settlement-breakdown"><span>Total simulated pool <strong>{formatBaseUnits(selectedMarket.totalPoolBaseUnits ?? '0')} BEATX</strong></span><span>Winner pool after fees <strong>{formatBaseUnits(selectedMarket.winnerPoolBaseUnits ?? '0')} BEATX</strong></span><span>Creator fee · 2% <strong>{formatBaseUnits(selectedMarket.creatorFeeBaseUnits)} BEATX</strong></span><span>Platform fee · 3% <strong>{formatBaseUnits(selectedMarket.platformFeeBaseUnits)} BEATX</strong></span></div><p>Values are a local simulation. The winner pool is shared pro-rata by winning sample and local picks.</p><a href="#claims" className="text-button">Open claim center <CircleDollarSign size={14} /></a></div>}
              </div>
            </div>

            <aside className="sidebar-card" id="portfolio">
              <div className="card-heading"><div><div className="section-kicker">SAVED ON THIS DEVICE</div><h2>My demo picks <span className="pick-count">{portfolio.length}</span></h2></div>{portfolio.some((pick) => pick.status === 'OPEN') && <button type="button" className="clear-picks" onClick={clearOpenPicks}><RotateCcw size={12} /> Clear open</button>}</div>
              <div className="portfolio-list">{portfolio.length > 0 ? portfolio.map((pick) => {
                const market = markets.find((item) => item.id === pick.marketId)
                const statusLabel = pick.status === 'OPEN' ? 'OPEN DEMO' : pick.status === 'CLAIMABLE' ? 'WINNER · CLAIMABLE' : pick.status === 'WON' ? 'WINNER · CLAIMED' : 'NOT A WINNER'
                return <div key={pick.id} className="portfolio-entry"><div className="pick-copy"><strong>{pick.option}</strong><span>{market?.question ?? 'Demo market'}</span><small>{statusLabel}</small></div><div className="pick-value">{pick.status === 'OPEN' ? formatBaseUnits(pick.amountBaseUnits) : formatBaseUnits(pick.payoutBaseUnits ?? '0')} <span>BEATX</span></div>{pick.status === 'OPEN' && <button type="button" className="remove-pick" aria-label={`Remove demo pick for ${pick.option}`} onClick={() => removeDemoPick(pick.id)}>×</button>}</div>
              }) : <div className="portfolio-empty"><Sparkles size={17} /><span>Your picks will show up here.</span><strong>Choose an outcome to get started.</strong></div>}</div>
              <p className="local-note">Private to this browser. All picks and claims are simulated.</p>
            </aside>
          </div>
        </div></section>

        <section className="claims-section wrap" id="claims">
          <div className="claims-heading"><div><div className="section-kicker">LOCAL SIMULATION · NO SIGNATURES</div><h2>Claim <em>center.</em></h2><p>Practice how payouts are split. These buttons update only this browser—they do not claim tokens.</p></div><div className="claim-total"><span>Available to simulate</span><strong>{formatBaseUnits(claimableTotal.toString())} <small>BEATX</small></strong></div></div>
          <div className="claim-grid">
            <ClaimCard icon={<Trophy size={19} />} title="Winner payouts" role="Your winning picks" available={claimableWinnings} claimed={ledger.winnerClaimedBaseUnits} button="Claim demo winnings" disabled={BigInt(claimableWinnings) === 0n} onClaim={handleClaimWinnings} />
            <ClaimCard icon={<Sparkles size={19} />} title="Creator earnings" role="Your locally created markets" available={claimableCreatorFees} claimed={ledger.creatorClaimedBaseUnits} button="Claim creator demo fees" disabled={BigInt(claimableCreatorFees) === 0n} onClaim={handleClaimCreatorFees} />
            <ClaimCard icon={<Landmark size={19} />} title="Platform treasury" role="Simulated platform fees" available={claimablePlatformFees} claimed={ledger.platformClaimedBaseUnits} button="Move to demo treasury" disabled={BigInt(claimablePlatformFees) === 0n} onClaim={handleClaimPlatformFees} />
          </div>
          <div className="claims-footnote"><ShieldCheck size={15} /><span>Simulation rules: {DEMO_CREATOR_BPS / 100}% creator fee + {DEMO_PLATFORM_BPS / 100}% platform fee; the remaining pool is shared by winning picks. Sample liquidity is fictional.</span></div>
        </section>

        <section className="how-section wrap" id="how-it-works"><div className="section-kicker">PLAY THROUGH A SAFE PREVIEW</div><h2>From curiosity<br />to <em>your first claim.</em></h2><div className="steps"><Step num="01" icon={<Plus size={18} />} title="Create a sample" text="Write a question and add two to four outcomes. It stays on this device." /><Step num="02" icon={<Compass size={18} />} title="Try a demo pick" text="Choose an outcome and use hypothetical BEATX amounts." /><Step num="03" icon={<RotateCcw size={18} />} title="Simulate a result" text="Set a sample outcome to see the pool and fee split." /><Step num="04" icon={<CircleDollarSign size={18} />} title="Explore claims" text="Preview winner, creator, and treasury claim flows—no tokens move." /></div></section>
      </main>

      <footer className="footer wrap"><div className="footer-top"><a className="brand" href="#top"><span className="brand-mark"><span /></span><span>Beat<span className="brand-x">X</span></span></a><div className="footer-links"><a href="#explore">Explore</a><a href="#portfolio">My demo picks</a><a href="#claims">Demo claims</a><a href="https://pump.fun/coin/HuoN3NEwkCv7JjZJPjkDWyX4oZ4UXT2hLKFWPnyvpump" target="_blank" rel="noreferrer">Official BEATX token</a><a href="https://explorer.solana.com/address/HuoN3NEwkCv7JjZJPjkDWyX4oZ4UXT2hLKFWPnyvpump" target="_blank" rel="noreferrer">Token Explorer</a></div></div></footer>
      {notice && <div className="toast" role="status"><Sparkles size={16} /> {notice}</div>}
    </div>
  )
}

function ClaimCard({ icon, title, role, available, claimed, button, disabled, onClaim }: { icon: ReactNode; title: string; role: string; available: string; claimed: string; button: string; disabled: boolean; onClaim: () => void }) {
  return <article className="claim-card"><div className="claim-card-top"><span className="claim-icon">{icon}</span><span className="claim-role">DEMO ONLY</span></div><h3>{title}</h3><p>{role}</p><div className="claim-amount"><span>Available</span><strong>{formatBaseUnits(available)} <small>BEATX</small></strong></div><div className="claim-claimed"><span>Claimed in this browser</span><strong>{formatBaseUnits(claimed)} BEATX</strong></div><button type="button" className="claim-action" disabled={disabled} onClick={onClaim}>{button}<CircleDollarSign size={15} /></button></article>
}

function CreateDemoMarketForm({ onCreate, onCancel }: { onCreate: (draft: DemoMarketDraft) => void; onCancel: () => void }) {
  const [question, setQuestion] = useState('')
  const [category, setCategory] = useState<MarketCategory>('Crypto')
  const [options, setOptions] = useState(['', ''])
  const [error, setError] = useState('')

  const updateOption = (index: number, value: string) => setOptions((current) => current.map((option, optionIndex) => optionIndex === index ? value : option))
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanQuestion = question.trim()
    const cleanOptions = options.map((option) => option.trim())
    if (cleanQuestion.length < 12 || cleanQuestion.length > 120) return setError('Write a clear question between 12 and 120 characters.')
    if (cleanOptions.some((option) => option.length < 1 || option.length > 32)) return setError('Every outcome needs a label of 1–32 characters.')
    if (new Set(cleanOptions.map((option) => option.toLowerCase())).size !== cleanOptions.length) return setError('Outcome labels must be unique.')
    onCreate({ question: cleanQuestion, category, options: cleanOptions })
  }

  return <form className="create-market-form" onSubmit={submit}>
    <div className="create-form-heading"><div><div className="section-kicker">MARKET BUILDER · LOCAL ONLY</div><h3>Create a demo market</h3></div><button type="button" className="close-create" aria-label="Close market builder" onClick={onCancel}><X size={17} /></button></div>
    <label className="field-label" htmlFor="create-question">Market question</label><input id="create-question" className="create-input" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={120} placeholder="What do you think will happen?" />
    <div className="create-form-row"><div><label className="field-label" htmlFor="create-category">Category</label><select id="create-category" className="create-input" value={category} onChange={(event) => setCategory(event.target.value as MarketCategory)}>{categories.filter((item): item is MarketCategory => item !== 'All').map((item) => <option key={item}>{item}</option>)}</select></div><div className="option-count-note">{options.length}/4 outcomes</div></div>
    <div className="create-outcomes"><span className="field-label">Outcomes</span>{options.map((option, index) => <div className="create-outcome-row" key={index}><span className="outcome-index">0{index + 1}</span><input className="create-input" aria-label={`Outcome ${index + 1}`} value={option} onChange={(event) => updateOption(index, event.target.value)} maxLength={32} placeholder={index === 0 ? 'First possible result' : 'Another possible result'} />{options.length > 2 && <button type="button" className="remove-outcome" aria-label={`Remove outcome ${index + 1}`} onClick={() => setOptions((current) => current.filter((_, optionIndex) => optionIndex !== index))}><X size={14} /></button>}</div>)}</div>
    <div className="create-form-bottom"><button type="button" className="add-outcome" disabled={options.length >= 4} onClick={() => setOptions((current) => [...current, ''])}><Plus size={14} /> Add outcome</button><span>Sample pool: 1,000 fictional BEATX</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="create-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button type="submit" className="primary"><Sparkles size={14} /> Launch local demo</button></div>
    <p className="create-disclaimer">Not published, not connected to a wallet, and not a real market.</p>
  </form>
}

function Step({ num, icon, title, text }: { num: string; icon: ReactNode; title: string; text: string }) {
  return <div className="step"><div className="step-top"><span>{num}</span><div className="step-icon">{icon}</div></div><h3>{title}</h3><p>{text}</p></div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
