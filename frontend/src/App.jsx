import { useState, useEffect } from 'react'
import {
  connectWallet, createCampaign, donate, closeCampaign,
  getCampaign, getRecentIds, getCampaignCount,
  xlm, short, pct, CONTRACT_ID,
} from './lib/stellar'

// ── Match meter ────────────────────────────────────────────────────────────
function MatchMeter({ remaining, total }) {
  const used    = Number(total) - Number(remaining)
  const usedPct = pct(used, total)

  return (
    <div className="match-meter">
      <div className="mm-bar">
        <div className="mm-fill" style={{ width: `${usedPct}%` }} />
        {usedPct < 98 && (
          <div className="mm-pulse" style={{ left: `${usedPct}%` }} />
        )}
      </div>
      <div className="mm-labels">
        <span className="mm-used">{xlm(used)} XLM matched</span>
        <span className="mm-remain">{xlm(remaining)} XLM left</span>
      </div>
    </div>
  )
}

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    Active:    { label: '🟢 MATCHING',  cls: 'badge-active'    },
    Exhausted: { label: '🟡 EXHAUSTED', cls: 'badge-exhausted' },
    Closed:    { label: '⚫ CLOSED',    cls: 'badge-closed'    },
  }
  const s = map[status] || { label: status, cls: '' }
  return <span className={`status-badge ${s.cls}`}>{s.label}</span>
}

// ── Campaign card ──────────────────────────────────────────────────────────
function CampaignCard({ campaign, wallet, onAction }) {
  const [amount,     setAmount]     = useState('1')
  const [showDonate, setShowDonate] = useState(false)
  const [busy,       setBusy]       = useState(false)

  const isMatcher  = wallet && campaign.matcher?.toString() === wallet
  const canDonate  = campaign.status === 'Active' && !isMatcher
  const matchedPct = pct(campaign.matched_total, campaign.match_pool)
  const totalImpact = Number(campaign.donated_total) + Number(campaign.matched_total)

  const predictedMatch = Math.min(
    parseFloat(amount || 0) * 10_000_000,
    Number(campaign.match_remaining)
  )

  const handle = async (fn, msg) => {
    setBusy(true)
    try {
      const hash = await fn()
      onAction({ ok: true, msg, hash, refresh: true })
      setShowDonate(false)
    } catch (e) { onAction({ ok: false, msg: e.message }) }
    finally { setBusy(false) }
  }

  return (
    <div className={`campaign-card ${campaign.status !== 'Active' ? 'card-dim' : ''}`}>
      {/* Header */}
      <div className="cc-header">
        <StatusBadge status={campaign.status} />
        <span className="cc-id">#{campaign.id?.toString().padStart(3,'0')}</span>
      </div>

      <h3 className="cc-title">{campaign.title}</h3>
      <p className="cc-desc">{campaign.description}</p>

      {/* Impact numbers */}
      <div className="impact-grid">
        <div className="impact-cell">
          <div className="ic-val">{xlm(campaign.donated_total)}</div>
          <div className="ic-label">XLM donated</div>
        </div>
        <div className="impact-cell impact-match">
          <div className="ic-val">{xlm(campaign.matched_total)}</div>
          <div className="ic-label">XLM matched</div>
        </div>
        <div className="impact-cell impact-total">
          <div className="ic-val">{xlm(totalImpact)}</div>
          <div className="ic-label">total impact</div>
        </div>
      </div>

      {/* Match pool meter */}
      <div className="match-section">
        <div className="ms-header">
          <span className="ms-label">Match pool</span>
          <span className="ms-pool">{xlm(campaign.match_pool)} XLM</span>
        </div>
        <MatchMeter remaining={campaign.match_remaining} total={campaign.match_pool} />
      </div>

      {/* Meta */}
      <div className="cc-meta">
        <span className="cm-item">
          <span className="cm-icon">👥</span>
          {campaign.donor_count?.toString()} donors
        </span>
        <span className="cm-item">
          <span className="cm-icon">🏦</span>
          Matcher: {short(campaign.matcher)}
        </span>
        <span className="cm-item">
          <span className="cm-icon">🎯</span>
          Beneficiary: {short(campaign.beneficiary)}
        </span>
      </div>

      {/* Actions */}
      {wallet && (
        <div className="cc-actions">
          {canDonate && (
            <button
              className={`btn-donate-toggle ${showDonate ? 'active' : ''}`}
              onClick={() => setShowDonate(d => !d)}
            >
              💚 Donate & Get Matched
            </button>
          )}
          {isMatcher && (campaign.status === 'Active' || campaign.status === 'Exhausted') && (
            <button className="btn-close-campaign" disabled={busy}
              onClick={() => handle(() => closeCampaign(wallet, campaign.id), 'Campaign closed')}>
              {busy ? '…' : 'Close Campaign'}
            </button>
          )}
        </div>
      )}

      {/* Donate panel */}
      {showDonate && canDonate && (
        <div className="donate-panel">
          <div className="dp-presets">
            {['0.5','1','5','10','25'].map(v => (
              <button key={v}
                className={`dp-preset ${amount === v ? 'dp-active' : ''}`}
                onClick={() => setAmount(v)}>
                {v} XLM
              </button>
            ))}
          </div>
          <div className="dp-custom-row">
            <input type="number" min="0.1" step="0.1"
              value={amount} onChange={e => setAmount(e.target.value)}
              className="dp-input" disabled={busy} />
            <span className="dp-unit">XLM</span>
          </div>
          <div className="dp-preview">
            <div className="dpp-row">
              <span>Your donation</span>
              <span>{amount} XLM</span>
            </div>
            <div className="dpp-row dpp-match">
              <span>+ Match</span>
              <span>+{(predictedMatch / 10_000_000).toFixed(2)} XLM</span>
            </div>
            <div className="dpp-row dpp-total">
              <span>Beneficiary receives</span>
              <span>{(parseFloat(amount || 0) + predictedMatch / 10_000_000).toFixed(2)} XLM</span>
            </div>
          </div>
          <button className="btn-donate-confirm" disabled={busy}
            onClick={() => handle(
              () => donate(wallet, campaign.id, parseFloat(amount)),
              `Donated ${amount} XLM — matched! 💚`
            )}>
            {busy ? 'Signing…' : `Donate ${amount} XLM`}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Create campaign form ───────────────────────────────────────────────────
function CreateForm({ wallet, onCreated }) {
  const [title,    setTitle]    = useState('')
  const [desc,     setDesc]     = useState('')
  const [benef,    setBenef]    = useState('')
  const [pool,     setPool]     = useState('50')
  const [busy,     setBusy]     = useState(false)
  const [err,      setErr]      = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const hash = await createCampaign(wallet, benef, title, desc, parseFloat(pool))
      onCreated(hash)
      setTitle(''); setDesc(''); setBenef(''); setPool('50')
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <form className="create-form" onSubmit={handleSubmit}>
      <div className="cf-head">CREATE A MATCHING CAMPAIGN</div>
      <div className="cf-field">
        <label>CAMPAIGN TITLE</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="What are you fundraising for?"
          maxLength={80} required disabled={!wallet || busy} />
      </div>
      <div className="cf-field">
        <label>DESCRIPTION</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="Tell donors why this matters…"
          maxLength={300} rows={4} disabled={!wallet || busy} />
        <span className="cf-chars">{desc.length}/300</span>
      </div>
      <div className="cf-field">
        <label>BENEFICIARY ADDRESS</label>
        <input value={benef} onChange={e => setBenef(e.target.value)}
          placeholder="G… — who receives donations + match"
          required disabled={!wallet || busy} />
      </div>
      <div className="cf-field">
        <label>YOUR MATCH POOL (XLM)</label>
        <div className="pool-presets">
          {['10','25','50','100','250'].map(v => (
            <button key={v} type="button"
              className={`pool-btn ${pool === v ? 'pool-active' : ''}`}
              onClick={() => setPool(v)}>{v}</button>
          ))}
        </div>
        <input type="number" min="1" step="0.1"
          value={pool} onChange={e => setPool(e.target.value)}
          className="pool-custom" disabled={busy} />
        <span className="cf-hint">
          You deposit {pool} XLM as the match pool. Donations are matched 1:1 until the pool is exhausted.
          Potential impact: up to {(parseFloat(pool || 0) * 2).toFixed(0)} XLM total.
        </span>
      </div>
      {err && <p className="cf-err">{err}</p>}
      <button type="submit" className="btn-create"
        disabled={!wallet || busy || !title || !benef}>
        {!wallet ? 'Connect wallet first' : busy ? 'Deploying…' : `Launch with ${pool} XLM Match Pool`}
      </button>
    </form>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function App() {
  const [wallet,    setWallet]    = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [count,     setCount]     = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState('campaigns')
  const [toast,     setToast]     = useState(null)

  const loadCampaigns = async () => {
    setLoading(true)
    try {
      const [ids, c] = await Promise.all([getRecentIds(), getCampaignCount()])
      setCount(c)
      const loaded = await Promise.allSettled(ids.map(id => getCampaign(id)))
      setCampaigns(loaded.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value))
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadCampaigns() }, [])

  const handleConnect = async () => {
    try { setWallet(await connectWallet()) }
    catch (e) { showToast(false, e.message) }
  }

  const showToast = (ok, msg, hash) => {
    setToast({ ok, msg, hash })
    setTimeout(() => setToast(null), 6000)
  }

  const handleAction = ({ ok, msg, hash, refresh }) => {
    showToast(ok, msg, hash)
    if (ok && refresh) loadCampaigns()
  }

  const handleCreated = (hash) => {
    showToast(true, 'Matching campaign live! 💚', hash)
    setTab('campaigns')
    loadCampaigns()
  }

  const totalMatched = campaigns.reduce((s, c) => s + Number(c.matched_total), 0)
  const activeCamps  = campaigns.filter(c => c.status === 'Active').length
  const totalPool    = campaigns.filter(c => c.status === 'Active')
    .reduce((s, c) => s + Number(c.match_remaining), 0)

  return (
    <div className="app">
      {/* ── Hero header ── */}
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-heart">💚</div>
            <div>
              <div className="brand-name">DonationMatch</div>
              <div className="brand-tag">every XLM doubled · stellar testnet</div>
            </div>
          </div>

          <div className="header-stats">
            <div className="hs">
              <span className="hs-n">{xlm(totalMatched)}</span>
              <span className="hs-l">XLM matched</span>
            </div>
            <div className="hs-div"/>
            <div className="hs">
              <span className="hs-n">{activeCamps}</span>
              <span className="hs-l">active campaigns</span>
            </div>
            <div className="hs-div"/>
            <div className="hs">
              <span className="hs-n">{xlm(totalPool)}</span>
              <span className="hs-l">XLM available</span>
            </div>
          </div>

          <div className="header-right">
            {wallet
              ? <div className="wallet-pill"><span className="wdot" />{short(wallet)}</div>
              : <button className="btn-connect" onClick={handleConnect}>Connect Wallet</button>
            }
          </div>
        </div>
      </header>

      {/* ── Sub nav ── */}
      <div className="subnav">
        <button className={`sn-btn ${tab === 'campaigns' ? 'sn-active' : ''}`}
          onClick={() => setTab('campaigns')}>Campaigns</button>
        <button className={`sn-btn ${tab === 'create' ? 'sn-active' : ''}`}
          onClick={() => setTab('create')}>+ New Campaign</button>
        <button className="sn-refresh" onClick={loadCampaigns}>↻</button>
        <a className="sn-contract"
          href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
          target="_blank" rel="noreferrer">Contract ↗</a>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={`toast ${toast.ok ? 'toast-ok' : 'toast-err'}`}>
          <span>{toast.msg}</span>
          {toast.hash && (
            <a href={`https://stellar.expert/explorer/testnet/tx/${toast.hash}`}
              target="_blank" rel="noreferrer" className="toast-link">TX ↗</a>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <main className="main">
        {tab === 'campaigns' && (
          loading ? (
            <div className="skeleton-grid">
              {[1,2,3].map(i => <div key={i} className="campaign-skeleton"/>)}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon">💚</div>
              <div className="es-title">No campaigns yet.</div>
              <p className="es-sub">Be the first to launch a matched giving campaign on Stellar.</p>
              <button className="btn-first" onClick={() => setTab('create')}>
                Launch First Campaign
              </button>
            </div>
          ) : (
            <div className="campaign-grid">
              {campaigns.map(c => (
                <CampaignCard key={c.id?.toString()} campaign={c}
                  wallet={wallet} onAction={handleAction} />
              ))}
            </div>
          )
        )}

        {tab === 'create' && (
          <div className="create-wrap">
            {!wallet ? (
              <div className="connect-prompt">
                <div className="cp-icon">💚</div>
                <h2 className="cp-title">Launch a matched giving campaign.</h2>
                <p className="cp-sub">Deposit your match pool in XLM. Every donation triggers an instant match and pays the beneficiary automatically.</p>
                <button className="btn-connect-lg" onClick={handleConnect}>Connect Freighter</button>
              </div>
            ) : (
              <CreateForm wallet={wallet} onCreated={handleCreated} />
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <span>DonationMatch · Stellar Testnet · Soroban</span>
        <a href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
          target="_blank" rel="noreferrer">Contract ↗</a>
      </footer>
    </div>
  )
}
