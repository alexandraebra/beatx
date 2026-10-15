import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Check, Compass, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import type { Position } from './types'
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
}

const marketSeed: Market[] = [
  { id: 'market-cap', question: 'Which project reaches $10M market cap first?', category: 'Crypto', creator: 'Mira Chen', initials: 'MC', accent: '#b6ff61', ends: '2d 14h', volume: 39020, participants: 140, featured: true, options: [{ label: 'Monad', volume: 42 }, { label: 'Sui', volume: 38 }, { label: 'Berachain', volume: 20 }] },
  { id: 'hackathon', question: 'Which team wins the next Solana hackathon?', category: 'Technology', creator: 'Alex Rivera', initials: 'AR', accent: '#7dd3fc', ends: '5d 03h', volume: 24780, participants: 96, options: [{ label: 'Monad', volume: 46 }, { label: 'Solana', volume: 34 }, { label: 'Other', volume: 20 }] },
  { id: 'sol-threshold', question: 'Will SOL break $220 before the monthly close?', category: 'Crypto', creator: 'Nadia Park', initials: 'NP', accent: '#fbbf24', ends: '9d 06h', volume: 18640, participants: 82, options: [{ label: 'Yes', volume: 62 }, { label: 'No', volume: 38 }] },
  { id: 'launch-date', question: 'Will Atlas launch a public beta by November 15, 2026?', category: 'Games', creator: 'Owen Brooks', initials: 'OB', accent: '#f472b6', ends: '30d 11h', volume: 9210, participants: 51, options: [{ label: 'Yes', volume: 57 }, { label: 'No', volume: 43 }] },
]

const categories: Category[] = ['All', 'Crypto', 'Technology', 'Games', 'Social', 'Science']
const DEMO_PICKS_KEY = 'beatx-demo-picks-v1'

function formatVolume(value: number) {
  const amount = value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return `${amount} BEATX`
}

function formatBaseUnits(value: string) {
  try {
    const units = BigInt(value)
    const whole = units / 1_000_000n
    const fraction = (units % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
    return fraction ? `${whole}.${fraction}` : `${whole}`
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

function readDemoPicks(): Position[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(DEMO_PICKS_KEY) ?? '[]')
    if (!Array.isArray(stored)) return []
    return stored.filter((item): item is Position =>
      item && typeof item.id === 'string' && typeof item.marketId === 'string' &&
      typeof item.option === 'string' && typeof item.amountBaseUnits === 'string' &&
      item.wallet === 'local-demo' && item.status === 'OPEN',
    )
  } catch {
    return []
  }
}

function App() {
  const [activeCategory, setActiveCategory] = useState<Category>('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedMarket, setSelectedMarket] = useState<Market>(marketSeed[0])
  const [selectedOption, setSelectedOption] = useState(0)
  const [amount, setAmount] = useState('5')
  const [notice, setNotice] = useState('')
  const [portfolio, setPortfolio] = useState<Position[]>(readDemoPicks)
  const noticeTimer = useRef<number | undefined>(undefined)

  const visibleMarkets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return marketSeed.filter((market) => {
      const matchesCategory = activeCategory === 'All' || market.category === activeCategory
      const matchesSearch = !term || `${market.question} ${market.category} ${market.options.map((option) => option.label).join(' ')}`.toLowerCase().includes(term)
      return matchesCategory && matchesSearch
    })
  }, [activeCategory, searchTerm])

  useEffect(() => {
    try { window.localStorage.setItem(DEMO_PICKS_KEY, JSON.stringify(portfolio)) } catch { /* Local storage is optional. */ }
  }, [portfolio])

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  const notify = (message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3200)
  }

  const handleDemoPick = () => {
    const amountBaseUnits = toBaseUnits(amount)
    if (!amountBaseUnits) {
      notify('Enter a demo amount greater than 0 (up to 6 decimals).')
      return
    }

    const option = selectedMarket.options[selectedOption]
    const pick: Position = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      marketId: selectedMarket.id,
      option: option.label,
      optionIndex: selectedOption,
      amountBaseUnits,
      wallet: 'local-demo',
      claimed: false,
      payoutBaseUnits: null,
      status: 'OPEN',
    }
    setPortfolio((current) => [pick, ...current])
    notify(`${option.label} saved as a demo pick. No wallet, Devnet, or tokens involved.`)
  }

  const clearDemoPicks = () => {
    setPortfolio([])
    notify('Your local demo picks were cleared.')
  }

  const removeDemoPick = (id: string) => {
    setPortfolio((current) => current.filter((pick) => pick.id !== id))
    notify('Demo pick removed from this browser.')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="BeatX home">
          <span className="brand-mark"><span /></span>
          <span>Beat<span className="brand-x">X</span></span>
        </a>

        <nav className="desktop-nav" aria-label="Main navigation">
          <a className="active" href="#explore">Explore</a>
          <a href="#demo-pick">Try a pick</a>
          <a href="#how-it-works">How it works</a>
        </nav>

        <div className="top-actions">
          <span className="launch-pill"><Sparkles size={14} /> Mainnet launch in preparation</span>
        </div>
      </header>

      <main id="top">
        <section className="hero wrap">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="pulse-dot" />
              PREVIEW ONLY · NO LIVE DEVNET MARKETS
              <span className="eyebrow-line" />
            </div>

            <h1>Pick a side.<br /><em>See what happens.</em></h1>
            <p>Explore sample markets and save a playful demo pick. No wallet, Devnet activity, or real BEATX required.</p>

            <div className="hero-actions">
              <a className="primary" href="#explore"><Compass size={15} /> Explore demo markets</a>
              <a className="secondary" href="#how-it-works">How it works</a>
            </div>

            <div className="meta-row">
              <span><ShieldCheck size={14} /> Sample data only</span>
              <span>Planned settlement asset: BEATX</span>
            </div>
          </div>

          <div className="hero-orbit" aria-hidden="true">
            <div className="orbit-ring ring-one" />
            <div className="orbit-ring ring-two" />
            <div className="orbit-core">
              <div className="core-label">BEATX PREVIEW</div>
              <strong>{selectedMarket.question}</strong>
            </div>
          </div>
        </section>

        <section className="ticker" aria-label="Preview status">
          <div className="ticker-inner">
            <span>NO LIVE DEVNET MARKETS</span>
            <i />
            <span className="ticker-item">SAMPLE DATA ONLY</span>
            <span className="ticker-item">PLANNED TOKEN <b>BEATX</b></span>
            <span className="ticker-item">NO TRANSACTIONS</span>
          </div>
        </section>

        <section className="section wrap" id="explore">
          <div className="section-heading">
            <div>
              <div className="section-kicker">SAMPLE MARKETS · NOT LIVE ON DEVNET</div>
              <h2>Find your <em>next pick.</em></h2>
            </div>
            <span className="market-count">{visibleMarkets.length} sample {visibleMarkets.length === 1 ? 'market' : 'markets'}</span>
          </div>

          <div className="market-controls">
            <label className="sr-only" htmlFor="market-search">Search sample markets</label>
            <input id="market-search" aria-label="Search sample markets" type="search" placeholder="Search a topic or outcome…" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            <div className="category-filters" aria-label="Filter sample markets by category">
              {categories.map((category) => (
                <button type="button" key={category} aria-pressed={activeCategory === category} className={activeCategory === category ? 'category-chip active' : 'category-chip'} onClick={() => setActiveCategory(category)}>{category}</button>
              ))}
            </div>
          </div>

          {visibleMarkets.length > 0 ? (
            <div className="market-grid">
              {visibleMarkets.map((market) => (
                <button type="button" key={market.id} aria-pressed={selectedMarket.id === market.id} className={`${market.featured ? 'market-card featured' : 'market-card'}${selectedMarket.id === market.id ? ' selected-market' : ''}`} onClick={() => { setSelectedMarket(market); setSelectedOption(0) }}>
                  <div className="card-top">
                    <div className="creator-badge" style={{ background: market.accent }}>{market.initials}</div>
                    <div className="card-copy">
                      <div className="card-kind">{market.category} · SAMPLE</div>
                      <div className="card-title">{market.question}</div>
                    </div>
                  </div>
                  <div className="card-meta">
                    <div><div className="meta-label">Sample volume</div><div className="meta-value">{formatVolume(market.volume)}</div></div>
                    <div><div className="meta-label">Sample picks</div><div className="meta-value">{market.participants}</div></div>
                  </div>
                  <div className="card-options">{market.options.map((option) => <span key={option.label} className="option-pill">{option.label}</span>)}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="market-empty">
              <Sparkles size={20} />
              <strong>No sample markets match that search.</strong>
              <span>Try another topic or clear the filters.</span>
              <button type="button" onClick={() => { setSearchTerm(''); setActiveCategory('All') }}>Show all sample markets</button>
            </div>
          )}
        </section>

        <section className="room-section" id="demo-pick">
          <div className="wrap">
            <div className="section-heading room-heading">
              <div>
                <div className="section-kicker">A NO-WALLET PREVIEW</div>
                <h2>Make your <em>demo pick.</em></h2>
              </div>
            </div>

            <div className="market-room">
              <div className="room-panel">
                <div className="room-panel-header">
                  <div>
                    <div className="section-kicker">{selectedMarket.category} · SAMPLE MARKET</div>
                    <h2>{selectedMarket.question}</h2>
                  </div>
                  <span className="sample-badge">Preview</span>
                </div>

                <div className="room-panel-body">
                  <div className="option-list" role="group" aria-label="Choose a sample outcome">
                    {selectedMarket.options.map((option, index) => (
                      <button type="button" key={option.label} aria-pressed={selectedOption === index} className={selectedOption === index ? 'option-active' : ''} onClick={() => setSelectedOption(index)}>
                        <span className="option-name">{option.label}</span>
                        <span className="option-rate">{Math.round((option.volume / selectedMarket.options.reduce((sum, item) => sum + item.volume, 0)) * 100)}% sample share</span>
                        {selectedOption === index && <span className="choice-check"><Check size={13} /></span>}
                      </button>
                    ))}
                  </div>

                  <label className="demo-size-label" htmlFor="demo-amount">How big is your demo pick? <span>Hypothetical BEATX amount</span></label>
                  <div className="demo-amount-row">
                    <div className="demo-amount-field">
                      <input id="demo-amount" aria-label="Hypothetical BEATX amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="5" />
                      <span>BEATX</span>
                    </div>
                    <div className="quick-amounts" aria-label="Quick demo amounts">
                      {['1', '5', '25'].map((value) => <button type="button" key={value} aria-pressed={amount === value} onClick={() => setAmount(value)}>{value}</button>)}
                    </div>
                  </div>
                  <button type="button" className="primary pick-submit" onClick={handleDemoPick}><Sparkles size={15} /> Save my demo pick</button>
                  <p className="demo-note">This is a local simulation saved only in this browser. No wallet connects, nothing is sent to Devnet, and no tokens move.</p>
                </div>
              </div>

              <aside className="sidebar-card" id="portfolio">
                <div className="card-heading">
                  <div>
                    <div className="section-kicker">SAVED ON THIS DEVICE</div>
                    <h2>My demo picks <span className="pick-count">{portfolio.length}</span></h2>
                  </div>
                  {portfolio.length > 0 && <button type="button" className="clear-picks" onClick={clearDemoPicks}><RotateCcw size={12} /> Reset</button>}
                </div>

                <div className="portfolio-list">
                  {portfolio.length > 0 ? portfolio.map((pick) => {
                    const market = marketSeed.find((item) => item.id === pick.marketId)
                    return (
                      <div key={pick.id} className="portfolio-entry">
                        <div className="pick-copy">
                          <strong>{pick.option}</strong>
                          <span>{market?.question ?? 'Sample market'}</span>
                          <small>DEMO ONLY</small>
                        </div>
                        <div className="pick-value">{formatBaseUnits(pick.amountBaseUnits)} <span>BEATX</span></div>
                        <button type="button" className="remove-pick" aria-label={`Remove demo pick for ${pick.option}`} onClick={() => removeDemoPick(pick.id)}>×</button>
                      </div>
                    )
                  }) : (
                    <div className="portfolio-empty">
                      <Sparkles size={17} />
                      <span>Your picks will show up here.</span>
                      <strong>Choose an outcome to get started.</strong>
                    </div>
                  )}
                </div>
                <p className="local-note">Private to this browser. Clear it any time.</p>
              </aside>
            </div>
          </div>
        </section>

        <section className="how-section wrap" id="how-it-works">
          <div className="section-kicker">SIMPLE, SAFE, AND READY TO GROW</div>
          <h2>From curiosity<br />to <em>your first pick.</em></h2>
          <div className="steps">
            <Step num="01" icon={<Compass size={18} />} title="Explore a sample" text="Browse the preview markets and find a topic you like." />
            <Step num="02" icon={<Check size={18} />} title="Choose an outcome" text="Tap the answer you think is most likely." />
            <Step num="03" icon={<Sparkles size={18} />} title="Try a demo pick" text="Use sample BEATX amounts—no wallet or tokens needed." />
            <Step num="04" icon={<ShieldCheck size={18} />} title="Mainnet comes later" text="Real wallet-backed markets will wait for the reviewed Mainnet launch." />
          </div>
        </section>
      </main>

      <footer className="footer wrap">
        <div className="footer-top">
          <a className="brand" href="#top"><span className="brand-mark"><span /></span><span>Beat<span className="brand-x">X</span></span></a>
          <div className="footer-links">
            <a href="#explore">Explore</a>
            <a href="#portfolio">My demo picks</a>
            <a href="https://pump.fun/coin/HuoN3NEwkCv7JjZJPjkDWyX4oZ4UXT2hLKFWPnyvpump" target="_blank" rel="noreferrer">Official BEATX token</a>
            <a href="https://explorer.solana.com/address/HuoN3NEwkCv7JjZJPjkDWyX4oZ4UXT2hLKFWPnyvpump" target="_blank" rel="noreferrer">Token Explorer</a>
          </div>
        </div>
      </footer>

      {notice && <div className="toast" role="status"><Sparkles size={16} /> {notice}</div>}
    </div>
  )
}

function Step({ num, icon, title, text }: { num: string; icon: ReactNode; title: string; text: string }) {
  return (
    <div className="step">
      <div className="step-top"><span>{num}</span><div className="step-icon">{icon}</div></div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
