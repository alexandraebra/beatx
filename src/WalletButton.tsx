import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, RefreshCw, Wallet as WalletIcon, X } from 'lucide-react'
import type { Wallet } from '@wallet-standard/base'
import { useWallet } from './hooks/useWallet'
import { MOBILE_WALLET_NAME, walletSupportsDevnet } from './wallet'

function isAndroidChrome() {
  if (typeof navigator === 'undefined') return false
  const agent = navigator.userAgent
  return /Android/i.test(agent) && /Chrome/i.test(agent) && !/EdgA|OPR|SamsungBrowser|Brave/i.test(agent)
}

function walletAddress(address: string) {
  return address.length > 12 ? `${address.slice(0, 5)}…${address.slice(-5)}` : address
}

export function WalletButton() {
  const wallet = useWallet()
  const [isOpen, setIsOpen] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const androidChrome = isAndroidChrome()
  const isIos = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
  const options = useMemo(
    () => wallet.wallets.filter((candidate) => candidate.name !== MOBILE_WALLET_NAME || androidChrome),
    [wallet.wallets, androidChrome],
  )
  const address = wallet.connection?.account.address

  useEffect(() => {
    if (!isOpen) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [isOpen])

  const chooseWallet = async (candidate: Wallet) => {
    const connected = await wallet.connect(candidate)
    if (connected) setIsOpen(false)
  }

  const copyAddress = async () => {
    if (!address || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(address)
    } catch {
      // Clipboard permissions vary by browser; the address remains visible for manual copy.
    }
  }

  return (
    <>
      <button
        type="button"
        className={`wallet-button${wallet.connection ? ' wallet-button-connected' : ''}`}
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <WalletIcon size={15} />
        <span>{wallet.connection ? walletAddress(wallet.connection.account.address) : wallet.isLoading ? 'Connecting…' : 'Connect wallet'}</span>
        {wallet.connection && <i className="wallet-status-dot" aria-label="Connected" />}
      </button>

      {isOpen && createPortal(
        <div
          className="wallet-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false)
          }}
        >
          <section ref={dialogRef} className="wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title">
            <button className="wallet-modal-close" type="button" aria-label="Close wallet dialog" onClick={() => setIsOpen(false)}>
              <X size={18} />
            </button>
            <div className="section-kicker">DEVNET · READ ONLY</div>
            <h2 id="wallet-modal-title">{wallet.connection ? 'Wallet connected' : 'Connect a wallet'}</h2>
            <p className="wallet-modal-intro">Connect to view a public address and its Devnet SOL balance. BeatX will not request a signature or send a transaction.</p>

            {wallet.connection ? (
              <div className="wallet-connected-card">
                <div className="wallet-connected-name">
                  <img src={wallet.connection.wallet.icon} alt="" />
                  <strong>{wallet.connection.wallet.name}</strong>
                  <span className={wallet.connection.supportsDevnet ? 'wallet-network-good' : 'wallet-network-warning'}>
                    {wallet.connection.supportsDevnet ? 'Devnet supported' : 'Address only'}
                  </span>
                </div>
                <div className="wallet-address-row">
                  <code>{wallet.connection.account.address}</code>
                  <button type="button" className="icon-button" onClick={() => void copyAddress()} aria-label="Copy wallet address" title="Copy address"><Copy size={15} /></button>
                </div>
                {!wallet.connection.supportsDevnet && <p className="wallet-warning">This account did not report Devnet support. The balance below is still queried from Devnet only; no signing is available.</p>}
                <div className="wallet-balance-row">
                  <span>Devnet SOL balance</span>
                  <strong>{wallet.balance === null ? (wallet.isRefreshingBalance ? 'Loading…' : '—') : `${wallet.balance.toFixed(4)} SOL`}</strong>
                </div>
                {wallet.balanceError && <p className="wallet-error" role="status">{wallet.balanceError}</p>}
                <div className="wallet-modal-actions">
                  <button type="button" className="secondary wallet-refresh" onClick={() => void wallet.refreshBalance()} disabled={wallet.isRefreshingBalance}>
                    <RefreshCw size={14} /> {wallet.isRefreshingBalance ? 'Refreshing…' : 'Refresh balance'}
                  </button>
                  <button type="button" className="secondary" onClick={() => { void wallet.disconnect(); setIsOpen(false) }} disabled={wallet.isLoading}>Disconnect</button>
                </div>
              </div>
            ) : (
              <>
                <div className="wallet-option-list">
                  {options.map((candidate) => {
                    const supportsDevnet = walletSupportsDevnet(candidate)
                    return (
                      <button
                        type="button"
                        className="wallet-option"
                        key={candidate.name}
                        onClick={() => void chooseWallet(candidate)}
                        disabled={!supportsDevnet || wallet.isLoading}
                      >
                        <img src={candidate.icon} alt="" />
                        <span className="wallet-option-copy"><strong>{candidate.name}</strong><small>{supportsDevnet ? 'Connect for Devnet read-only' : 'This wallet does not advertise Devnet support'}</small></span>
                        <span className="wallet-option-arrow">{wallet.isLoading ? '…' : supportsDevnet ? 'Connect' : 'Unavailable'}</span>
                      </button>
                    )
                  })}
                </div>
                {wallet.error && <p className="wallet-error" role="alert">{wallet.error}</p>}
                {options.length === 0 && <p className="wallet-empty">No compatible wallet was detected in this browser.</p>}
                <div className="wallet-help">
                  <strong>Using a phone?</strong>
                  {androidChrome ? (
                    <span>Choose Mobile Wallet Adapter, then approve the BeatX connection in a compatible Solana wallet app.</span>
                  ) : isIos ? (
                    <span>Open BeatX inside your wallet app’s browser. Mobile Wallet Adapter is not supported in iOS Safari.</span>
                  ) : (
                    <span>Install a Wallet Standard browser wallet. On Android, use Chrome with a wallet app that supports Mobile Wallet Adapter; on iPhone, open BeatX inside the wallet app.</span>
                  )}
                </div>
              </>
            )}

            <p className="wallet-safety-note"><span /> Sample markets stay local. No live Devnet markets, BEATX transfers, or transaction signing.</p>
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}
