import { useEffect, useState } from 'react'
import { useStore, initStore, signIn, addTransaction, showToast } from './store'
import EntryPage, { type UrlPrefill } from './pages/Entry'
import DetailsPage from './pages/Details'
import StatsPage from './pages/Stats'
import MinePage from './pages/Mine'
import { round2, fmtCny } from './lib/utils'

type Tab = 'entry' | 'details' | 'stats' | 'mine'

/** 快捷指令 URL 协议：#amount=45.5[&type=][&cat=][&note=][&save=1]，读完立即清 hash 防刷新重复 */
function consumeUrlEntry(): { prefill?: Omit<UrlPrefill, 'key'>; save?: { amount: number; type: 'expense' | 'income'; cat: string | null; note: string } } | null {
  const h = window.location.hash
  if (!h || !h.includes('amount=')) return null
  const params = new URLSearchParams(h.replace(/^#\/?/, ''))
  const amount = parseFloat(params.get('amount') ?? '')
  history.replaceState(null, '', window.location.pathname + window.location.search)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const parsed = {
    amount: round2(amount),
    type: (params.get('type') === 'income' ? 'income' : 'expense') as 'expense' | 'income',
    cat: params.get('cat'),
    note: (params.get('note') ?? '').slice(0, 20),
  }
  return params.get('save') === '1' ? { save: parsed } : { prefill: parsed }
}

const TABS: { key: Tab; label: string; ico: string }[] = [
  { key: 'entry', label: '记账', ico: '✏️' },
  { key: 'details', label: '明细', ico: '📋' },
  { key: 'stats', label: '统计', ico: '📊' },
  { key: 'mine', label: '我的', ico: '🎫' },
]

export default function App() {
  const { auth, toast } = useStore()
  const [tab, setTab] = useState<Tab>('entry')
  const [prefill, setPrefill] = useState<UrlPrefill | null>(null)

  useEffect(() => {
    void initStore()
    const handle = () => {
      const r = consumeUrlEntry()
      if (!r) return
      if (r.save) {
        addTransaction({
          type: r.save.type,
          amountCny: r.save.amount,
          category: r.save.cat ?? 'other',
          note: r.save.note,
        })
        showToast(`已直接记下 ${fmtCny(r.save.amount)}`)
        setTab('details')
        return
      }
      if (r.prefill) {
        setPrefill({ ...r.prefill, key: Date.now() })
        setTab('entry')
      }
    }
    handle()
    window.addEventListener('hashchange', handle)
    return () => window.removeEventListener('hashchange', handle)
  }, [])

  if (auth === 'loading') {
    return (
      <div className="login-wrap">
        <div className="login-logo">🧾</div>
        <div className="sync-dot">加载中…</div>
      </div>
    )
  }

  if (auth === 'signedOut') return <Login hasPendingEntry={prefill !== null} />

  return (
    <div className="app">
      {tab === 'entry' && <EntryPage prefill={prefill} />}
      {tab === 'details' && <DetailsPage />}
      {tab === 'stats' && <StatsPage />}
      {tab === 'mine' && <MinePage />}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            <span className="tab-ico">{t.ico}</span>
            {t.label}
          </button>
        ))}
      </nav>
      {toast && <div className="toast" key={toast.key}>{toast.text}</div>}
    </div>
  )
}

function Login(props: { hasPendingEntry: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const hasPendingEntry = props.hasPendingEntry
  return (
    <div className="login-wrap">
      <div className="login-logo">🧾</div>
      <div className="login-title">Monica's Money</div>
      {hasPendingEntry && <div className="hint-bar">登录后自动继续这笔记账 ⚡</div>}
      <div className="field">
        <label>邮箱</label>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label>密码</label>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {err && <div className="banner warn">{err}</div>}
      <button
        className="btn"
        disabled={busy || !email || !password}
        onClick={async () => {
          setBusy(true)
          setErr(null)
          const e = await signIn(email.trim(), password)
          if (e) setErr(e === 'Invalid login credentials' ? '邮箱或密码不对' : e)
          setBusy(false)
        }}
      >
        {busy ? '登录中…' : '登录'}
      </button>
      <div className="sync-dot" style={{ marginTop: 14 }}>
        单人使用 · 会话长期保持，登录一次即可
      </div>
    </div>
  )
}
