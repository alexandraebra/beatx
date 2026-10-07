import { StrictMode, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Compass, Flame, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import { useWallet } from './hooks/useWallet'
import { useApi } from './hooks/useApi'
import './styles.css'

type Category = 'All' | 'Crypto' | 'Technology' | 'Games' | 'Social' | 'Science'
type Market = {
  id: string
  question: string
  category: Exclude<Category, 'All'>
  creator: string
  initials: string
  accent: string
  ends: string
  volume: number
  participants: number
  featured?: boolean
  options: { label: string; volume: number }[]
  status?: 'OPEN' | 'LOCKED' | 'CLOSED' | 'RESOLVED'
  closeAt?: string
  description?: string
  creatorAddress?: string
  policyHash?: string
}

const marketSeed: Market[] = [
  { id: 'market-cap', question: 'Which project reaches $10M market cap first?', category: 'Crypto', creator: 'Mira Chen', initials: 'MC', accent: '#b6ff61', ends: '2d 14h', volume: 39020, participants: 140, featured: true, options: [{ label: 'Monad', volume: 42 }, { label: 'Sui', volume: 38 }, { label: 'Berachain', volume: 20 }] },
  { id: 'hackathon', question: 'Which team wins the next Solana hackathon?', category: 'Technology', creator: 'Alex Rivera', initials: 'AR', accent: '#7dd3fc', ends: '5d 03h', volume: 24780, participants: 96, options: [{ label: 'Monad', volume: 46 }, { label: 'Solana', volume: 34 }, { label: 'Other', volume: 20 }] },
  { id: 'sol-threshold', question: 'Will SOL break $220 before the monthly close?', category: 'Crypto', creator: 'Nadia Park', initials: 'NP', accent: '#fbbf24', ends: '9d 06h', volume: 18640, participants: 82, options: [{ label: 'Yes', volume: 62 }, { label: 'No', volume: 38 }] },
  { id: 'launch-date', question: 'Will Atlas release its public beta before October 15?', category: 'Games', creator: 'Owen Brooks', initials: 'OB', accent: '#f472b6', ends: '12d 11h', volume: 9210, participants: 51, options: [{ label: 'Yes', volume: 57 }, { label: 'No', volume: 43 }] },
]

const categories: Category[] = ['All', 'Crypto', 'Technology', 'Games', 'Social', 'Science']

function formatVolume(value: number) {
  return value >= 1000 ? `$${(value / 1000).toFixed(1)}K` : `$${value}`
}

function pct(option: Market['options'][number], all: Market['options']) {
  const total = all.reduce((sum, item) => sum + item.volume, 0)
  return total === 0 ? Math.round(100 / all.length) : Math.round((option.volume / total) * 100)
}

function toBaseUnits(value: string): string | null {
  const normalized = value.trim()
  if (!/^\d+(\.\d{1,6})?$/.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split('.')
  const base = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
  return base > 0n ? base.toString() : null
}

type DraftMarket = {
  question: string
  category: Exclude<Category, 'All'>
  description?: string
  options: string[]
  closeAtDays?: number
  resolutionDeadlineDays?: number
}

function App() {
  const { address, isConnected, network, balance, connect, disconnect } = useWallet()
  const { getMarkets, createMarket, placePosition, getPortfolio, claimPayout, closeMarket, resolveMarket } = useApi()
  const [activeCategory, setActiveCategory] = useState<Category>('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [marketList, setMarketList] = useState<Market[]>(marketSeed)
  const [selectedMarket, setSelectedMarket] = useState<Market>(marketSeed[0])
  const [selectedOption, setSelectedOption] = useState(0)
  const [amount, setAmount] = useState('25')
  const [showCreate, setShowCreate] = useState(false)
  const [showProof, setShowProof] = useState(false)
  const [notice, setNotice] = useState('')
  const [portfolio, setPortfolio] = useState<any[]>([])

  const visibleMarkets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return marketList.filter((market) => {
      const matchesCategory = activeCategory === 'All' || market.category === activeCategory
      const matchesSearch = !term || market.question.toLowerCase().includes(term)
      return matchesCategory && matchesSearch
    })
  }, [activeCategory, searchTerm, marketList])

  const notify = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const loadMarkets = async () => {
    try {
      const data = await getMarkets()
      if (Array.isArray(data) && data.length > 0) {
        setMarketList(data as Market[])
        setSelectedMarket((data as Market[])[0])
      }
    } catch {
      setMarketList(marketSeed)
    }
  }

  useEffect(() => { void loadMarkets() }, [])

  const loadPortfolio = async () => {
    if (!address) return
    try {
      const data = await getPortfolio(address)
      setPortfolio(data.positions || [])
    } catch {
      setPortfolio([])
    }
  }

  useEffect(() => { void loadPortfolio() }, [address])

  const handleWallet = async () => {
    if (isConnected && address) {
      await disconnect()
      notify('Wallet disconnected')
      return
    }

    try {
      await connect()
      if (address) notify('Wallet connected successfully')
    } catch {
      notify('Wallet could not be connected')
    }
  }

  const handlePosition = async () => {
    if (!isConnected || !address) {
      notify('Connect wallet before placing a bet')
      return
    }

    const amountBaseUnits = toBaseUnits(amount)
    if (!amountBaseUnits) {
      notify('Enter a valid amount in SOL-style format')
      return
    }

    try {
      await placePosition(selectedMarket.id, selectedOption, amountBaseUnits, address)
      notify(`Position recorded for ${selectedMarket.options[selectedOption].label}`)
    } catch (error: any) {
      notify(error.message || 'Could not place position')
    }
  }

  const handleCreate = async (draft: DraftMarket) => {
    try {
      const created = await createMarket(draft)
      const nextMarket: Market = {
        ...created,
        question: created.question || draft.question,
        category: created.category || draft.category,
        creator: 'You',
        initials: 'YO',
        accent: '#b6ff61',
        ends: '7d',
        volume: 0,
        participants: 0,
        options: created.options || draft.options.map((label) => ({ label, volume: 0 })),
      }
      setMarketList((current) => [nextMarket, ...current])
      setSelectedMarket(nextMarket)
      setShowCreate(false)
      notify('Market created successfully')
    } catch (error: any) {
      notify(error.message || 'Market could not be created')
    }
  }

  const handleCloseMarket = async () => {
    try {
      await closeMarket(selectedMarket.id)
      notify('Market closed')
    } catch (error: any) {
      notify(error.message || 'Could not close market')
    }
  }

  const handleResolve = async () => {
    try {
      if (!selectedMarket.policyHash) {
        notify('Policy hash missing')
        return
      }
      await resolveMarket(selectedMarket.id, selectedMarket.policyHash, selectedMarket.options[selectedOption].label)
      notify('Market resolved')
    } catch (error: any) {
      notify(error.message || 'Could not resolve market')
    }
  }

  const handleClaim = async () => {
    if (!address) {
      notify('Connect wallet first')
      return
    }

    try {
      const matched = portfolio.find((item) => item.marketId === selectedMarket.id)
      if (!matched) {
        notify('No claim available')
        return
      }
      await claimPayout(selectedMarket.id, matched.id, address)
      notify('Payout claimed')
    } catch (error: any) {
      notify(error.message || 'Could not claim payout')
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="BeatX home">
          <span className="brand-mark"><span /></span>
          <span>Beat<span className="brand-x">X</span></span>
        </a>

        <nav className="desktop-nav">
          <a className="active" href="#explore">Explore</a>
          <button onClick={() => setShowCreate(true)}>Create</button>
          <a href="#live">Live</a>
          <a href="#creators">Creators</a>
        </nav>

        <div className="top-actions">
          <button className="wallet-button" onClick={handleWallet} type="button">
            <Wallet size={16} />
            {isConnected ? 'Connected' : 'Connect Wallet'}
          </button>
        </div>
      </header>

      <main id="top">
        <section className="hero wrap">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="pulse-dot" />
              LIVE ON SOLANA DEVNET
              <span className="eyebrow-line" />
            </div>

            <h1>Predict what<br /><em>happens next.</em></h1>

            <div className="hero-actions">
              <button className="primary" onClick={() => setShowCreate(true)}>Create Market</button>
              <button className="secondary" onClick={handleWallet}>Connect Wallet</button>
            </div>

            <div className="meta-row">
              <span><ShieldCheck size={14} /> {isConnected ? address?.slice(0, 8) + '...' : 'No wallet connected'}</span>
              <span>Network: {network === 'unknown' ? 'Checking...' : network}</span>
              <span><Flame size={14} /> {balance.toFixed(2)} SOL</span>
            </div>
          </div>

          <div className="hero-orbit">
            <div className="orbit-ring ring-one" />
            <div className="orbit-ring ring-two" />
            <div className="orbit-core">
              <div className="core-label">LIVE MARKET</div>
              <strong>{selectedMarket.question}</strong>
            </div>
          </div>
        </section>

        <section className="ticker">
          <div className="ticker-inner">
            <span>MARKETS LIVE</span>
            <i />
            <span className="ticker-item">SOL / $184.22 <b className="up">+3.8%</b></span>
            <span className="ticker-item">BTC / $63.1K <b className="down">-1.2%</b></span>
            <span className="ticker-item">ETH / $81.4K <b className="down">-0.6%</b></span>
          </div>
        </section>

        <section className="section wrap" id="explore">
          <div className="section-heading">
            <div>
              <div className="section-kicker">DISCOVER THE SIGNAL</div>
              <h2>Trending <em>Beats</em></h2>
            </div>
            <a className="view-link" href="#live">View all markets</a>
          </div>

          <div className="market-grid">
            {visibleMarkets.map((market) => (
              <button key={market.id} className={market.featured ? 'market-card featured' : 'market-card'} onClick={() => { setSelectedMarket(market); setSelectedOption(0) }}>
                <div className="card-top">
                  <div className="creator-badge" style={{ background: market.accent }}>{market.initials}</div>
                  <div className="card-copy">
                    <div className="card-kind">{market.category}</div>
                    <div className="card-title">{market.question}</div>
                  </div>
                </div>

                <div className="card-meta">
                  <div>
                    <div className="meta-label">Volume</div>
                    <div className="meta-value">{formatVolume(market.volume)}</div>
                  </div>
                  <div>
                    <div className="meta-label">Participants</div>
                    <div className="meta-value">{market.participants}</div>
                  </div>
                </div>

                <div className="card-options">
                  {market.options.map((option) => (
                    <div key={option.label} className="option-pill">
                      {option.label}
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="room-section" id="live">
          <div className="wrap">
            <div className="section-heading room-heading">
              <div>
                <div className="section-kicker">THE MARKET ROOM</div>
                <h2>Make your <em>choice.</em></h2>
              </div>
            </div>

            <div className="market-room">
              <div className="room-panel">
                <div className="room-panel-header">
                  <div>
                    <div className="section-kicker">CURRENT MARKET</div>
                    <h2>{selectedMarket.question}</h2>
                  </div>
                  <button className="ghost" onClick={() => setShowProof(true)}>Proof</button>
                </div>

                <div className="room-panel-body">
                  <div className="option-list">
                    {selectedMarket.options.map((option, index) => (
                      <button
                        key={option.label}
                        className={selectedOption === index ? 'option-active' : ''}
                        onClick={() => setSelectedOption(index)}
                      >
                        <div className="option-name">{option.label}</div>
                        <div className="option-rate">{pct(option, selectedMarket.options)}%</div>
                      </button>
                    ))}
                  </div>

                  <div className="position-inline">
                    <input
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="0.01"
                    />
                    <button className="primary" onClick={handlePosition}>
                      Place bet
                    </button>
                  </div>

                  <div className="room-panel-actions">
                    <button className="secondary" onClick={handleCloseMarket}>Close Market</button>
                    <button className="secondary" onClick={handleResolve}>Resolve</button>
                    <button className="secondary" onClick={handleClaim}>Claim</button>
                  </div>
                </div>
              </div>

              <div className="sidebar-card">
                <div className="card-heading">
                  <div>
                    <div className="section-kicker">YOUR SIGNAL</div>
                    <h2>Portfolio</h2>
                  </div>
                </div>

                <div className="portfolio-list">
                  {portfolio.length > 0 ? (
                    portfolio.map((entry) => (
                      <div key={entry.id} className="portfolio-entry">
                        <div className="portfolio-label">{entry.option || entry.marketId}</div>
                        <div className="portfolio-value">{entry.amount || ''}</div>
                      </div>
                    ))
                  ) : (
                    <div className="portfolio-empty">No positions yet</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="how-section wrap">
          <div className="section-kicker">SIMPLE BY DESIGN</div>
          <h2>From curiosity<br />to <em>conviction.</em></h2>

          <div className="steps">
            <Step num="01" icon={<Compass size={18} />} title="Connect your wallet" text="Link your Phantom, Solflare, or Backpack wallet." />
            <Step num="02" icon={<Sparkles size={18} />} title="Create a market" text="Draft a question, add outcomes, set your close date." />
            <Step num="03" icon={<Sparkles size={18} />} title="Place a bet" text="Choose an outcome and lock in your stake." />
            <Step num="04" icon={<ShieldCheck size={18} />} title="Settle and claim" text="Resolve the market and distribute winnings automatically." />
          </div>
        </section>
      </main>

      <footer className="footer wrap">
        <div className="footer-top">
          <a className="brand" href="#top">
            <span className="brand-mark"><span /></span>
            <span>Beat<span className="brand-x">X</span></span>
          </a>
          <div className="footer-links">
            <a href="#explore">Explore</a>
            <a href="#create">Create</a>
            <a href="#portfolio">Portfolio</a>
          </div>
        </div>
      </footer>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreate={(draft) => void handleCreate(draft)}
        />
      )}

      {showProof && (
        <ProofModal
          market={selectedMarket}
          onClose={() => setShowProof(false)}
        />
      )}

      {notice && <div className="toast"><ShieldCheck size={16} /> {notice}</div>}
    </div>
  )
}

function ProofModal({ market, onClose }: { market: any; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="proof-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="section-kicker">PROOF</div>
            <h2>{market.question}</h2>
          </div>
        </div>

        <div className="proof-body">
          <div className="proof-box">
            <div className="proof-label">Policy hash</div>
            <div className="proof-value">{market.policyHash || 'No hash yet'}</div>
          </div>
          <div className="proof-box">
            <div className="proof-label">Wallet</div>
            <div className="proof-value">{market.creatorAddress || 'Wallet not connected'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (draft: DraftMarket) => void }) {
  const [question, setQuestion] = useState('')
  const [category, setCategory] = useState<Exclude<Category, 'All'>>('Crypto')
  const [outcomes, setOutcomes] = useState('Option A, Option B')

  const submit = () => {
    const options = outcomes.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 8)
    if (question.trim().length < 12 || options.length < 2) return
    onCreate({ question: question.trim(), category, options })
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="create-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="section-kicker">CREATE MARKET</div>
            <h2>New market draft</h2>
          </div>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>

        <div className="modal-body">
          <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a market question..." />
          <select value={category} onChange={(event) => setCategory(event.target.value as Exclude<Category, 'All'>)}>
            <option value="Crypto">Crypto</option>
            <option value="Technology">Technology</option>
            <option value="Games">Games</option>
            <option value="Social">Social</option>
            <option value="Science">Science</option>
          </select>

          <textarea value={outcomes} onChange={(event) => setOutcomes(event.target.value)} placeholder="Option A, Option B" />
          <button className="primary" onClick={submit}>Create market</button>
        </div>
      </div>
    </div>
  )
}

function Step({ num, icon, title, text }: { num: string; icon: ReactNode; title: string; text: string }) {
  return (
    <div className="step">
      <div className="step-top">
        <span>{num}</span>
        <div className="step-icon">{icon}</div>
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
