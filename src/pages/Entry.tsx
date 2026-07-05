import { useEffect, useMemo, useRef, useState } from 'react'
import type { Category, TxType } from '../types'
import { useStore, addTransaction, showToast, addTrip, setActiveTrip, applyAyiTemplate, addCard, renewCard } from '../store'
import { catColor, catFg, majorCategories, subCategories, catLabel } from '../lib/catalog'
import { CatGlyph } from '../components/icons'
import { CURRENCIES, CURRENCY_SYMBOL } from '../lib/fx'
import { fmtCny, fmtMoney, round2, todayStr, dayLabel } from '../lib/utils'
import { Sheet, Segmented, parseAmount } from '../components/ui'
import { CAT_CARDS } from '../data/categories'

export interface UrlPrefill {
  key: number // 每次触发递增，保证重复识别也能生效
  amount: number
  type: TxType
  cat: string | null
  note: string
}

export default function EntryPage(props: { prefill: UrlPrefill | null }) {
  const { data } = useStore()
  const s = data.settings

  const [type, setType] = useState<TxType>('expense')
  const [amountStr, setAmountStr] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayStr())
  const [currency, setCurrency] = useState('CNY')
  const [fxRate, setFxRate] = useState<number | null>(null)
  const [tripOverride, setTripOverride] = useState<'default' | 'off' | string>('default')
  const [preselCat, setPreselCat] = useState<{ cat: string; sub: string | null } | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [pop, setPop] = useState(0)
  const [isCardPurchase, setIsCardPurchase] = useState(false)

  const [subSheet, setSubSheet] = useState<Category | null>(null)
  const [dateSheet, setDateSheet] = useState(false)
  const [curSheet, setCurSheet] = useState(false)
  const [tripSheet, setTripSheet] = useState(false)
  const [tplSheet, setTplSheet] = useState(false)
  const [cardLink, setCardLink] = useState<{ amount: number; cat: string; sub: string | null } | null>(null)

  const majors = useMemo(() => majorCategories(data, type), [data, type])
  const amount = parseAmount(amountStr)
  const hasAmount = Number.isFinite(amount) && amount > 0

  const effRate = currency === 'CNY' ? 1 : fxRate ?? s.fx_rates[currency] ?? 1
  const amountCny = hasAmount ? round2(amount * effRate) : 0

  const activeTrip = s.active_trip_id ? data.trips.find((t) => t.id === s.active_trip_id) : null
  const effTripId = tripOverride === 'off' ? null : tripOverride === 'default' ? (activeTrip?.id ?? null) : tripOverride
  const effTrip = effTripId ? data.trips.find((t) => t.id === effTripId) : null

  // 快捷指令 URL 协议（由 App 解析后传入）
  useEffect(() => {
    const p = props.prefill
    if (!p) return
    setType(p.type)
    setAmountStr(String(p.amount))
    setNote(p.note)
    if (p.cat && data.categories.some((c) => c.key === p.cat && c.parent_key === null)) {
      setPreselCat({ cat: p.cat, sub: null })
    } else {
      setPreselCat(null)
    }
    setHint('⚡ 已从截屏识别金额，选个分类就好')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.prefill?.key])

  function keyTap(k: string) {
    setAmountStr((prev) => {
      if (k === '⌫') return prev.slice(0, -1)
      if (k === '.') {
        if (prev.includes('.')) return prev
        return prev === '' ? '0.' : prev + '.'
      }
      const next = prev === '0' && k !== '.' ? k : prev + k
      const [int, dec] = next.split('.')
      if (int.length > 7) return prev
      if (dec !== undefined && dec.length > 2) return prev
      return next
    })
  }

  function resetForm() {
    setAmountStr('')
    setNote('')
    setDate(todayStr())
    setCurrency('CNY')
    setFxRate(null)
    setTripOverride('default')
    setPreselCat(null)
    setHint(null)
    setIsCardPurchase(false)
  }

  function save(cat: string, sub: string | null) {
    if (!hasAmount) {
      showToast('先输入金额')
      return
    }
    const isForeign = currency !== 'CNY'
    addTransaction({
      type,
      amountCny,
      originalAmount: isForeign ? amount : null,
      currency,
      fxRate: isForeign ? effRate : null,
      category: cat,
      subcategory: sub,
      note,
      date,
      tripId: type === 'expense' ? effTripId : null,
      isCardPurchase: type === 'expense' ? isCardPurchase : false,
    })
    setPop((n) => n + 1)
    showToast(`已记下 ${fmtCny(amountCny)}`)
    const savedAmount = amountCny
    resetForm()
    if (type === 'expense' && isCardPurchase) {
      setCardLink({ amount: savedAmount, cat, sub })
    }
  }

  // 点大类：有小类就拉起小类选择（图二那样），没有小类则直接记大类
  function pickMajor(cat: Category) {
    if (!hasAmount) {
      showToast('先输入金额')
      return
    }
    const subs = subCategories(data, cat.key)
    if (subs.length === 0) {
      save(cat.key, null)
      return
    }
    setSubSheet(cat)
  }

  const trips = data.trips

  return (
    <div className="page">
      {hint && <div className="hint-bar">{hint}</div>}

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
        <Segmented
          options={[
            { value: 'expense', label: '支出', cls: 'exp' },
            { value: 'income', label: '收入', cls: 'inc' },
          ]}
          value={type}
          onChange={(v) => {
            setType(v)
            setPreselCat(null)
          }}
        />
      </div>

      <div className="amount-display">
        <div key={pop} className={`amt ${hasAmount ? '' : 'zero'} ${pop > 0 ? 'pop' : ''}`}>
          <span className="cur-sym">{CURRENCY_SYMBOL[currency] ?? currency}</span>
          {amountStr === '' ? '0' : amountStr}
        </div>
        {currency !== 'CNY' && hasAmount && (
          <button className="fx-line" onClick={() => setCurSheet(true)}>
            ≈ {fmtCny(amountCny)} · 汇率 {effRate} ✎
          </button>
        )}
      </div>

      <div className="entry-chips">
        <button className={`chip ${date !== todayStr() ? 'on' : ''}`} onClick={() => setDateSheet(true)}>
          📅 {date === todayStr() ? '今天' : dayLabel(date)}
        </button>
        <button className={`chip ${currency !== 'CNY' ? 'on' : ''}`} onClick={() => setCurSheet(true)}>
          {currency === 'CNY' ? '¥ 人民币' : `${CURRENCY_SYMBOL[currency]} ${currency}`}
        </button>
        {type === 'expense' && (
          <button
            className={`chip ${effTrip ? 'on' : ''}`}
            onClick={() => {
              if (activeTrip && tripOverride === 'default') setTripOverride('off')
              else if (activeTrip && tripOverride === 'off') setTripOverride('default')
              else if (tripOverride !== 'default' && tripOverride !== 'off') setTripOverride('default') // 手动点亮的再点一下熄灭
              else setTripSheet(true)
            }}
          >
            ✈️ {effTrip ? effTrip.name : '旅行'}
          </button>
        )}
        {type === 'expense' && (
          <button
            className={`chip ${isCardPurchase ? 'on' : ''}`}
            onClick={() => setIsCardPurchase((v) => !v)}
          >
            🎫 {isCardPurchase ? '办卡/充值' : '办卡'}
          </button>
        )}
        <button className="chip" onClick={() => setTplSheet(true)}>
          ⭐ 模板
        </button>
      </div>

      <div className="note-row">
        <input
          type="text"
          maxLength={20}
          placeholder="备注（选填）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="card" style={{ padding: '10px 8px' }}>
        <div className="cat-grid">
          {majors.map((c) => (
            <button
              key={c.key}
              className={`cat-cell ${preselCat?.cat === c.key ? 'selected' : ''}`}
              onClick={() => pickMajor(c)}
            >
              <span className="ico" style={{ background: catColor(c.key), color: catFg(c.key) }}>
                <CatGlyph keyName={c.key} emoji={c.emoji} size={24} />
              </span>
              <span className="lbl">
                {c.label}
                {preselCat?.cat === c.key && preselCat.sub ? `·${catLabel(data, preselCat.sub)}` : ''}
              </span>
            </button>
          ))}
        </div>
        {preselCat && (
          <button className="btn" style={{ marginTop: 10 }} disabled={!hasAmount} onClick={() => save(preselCat.cat, preselCat.sub)}>
            保存到「{catLabel(data, preselCat.cat)}
            {preselCat.sub ? ` · ${catLabel(data, preselCat.sub)}` : ''}」
          </button>
        )}
      </div>

      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((k) => (
          <button key={k} onClick={() => keyTap(k)} aria-label={k === '⌫' ? '退格' : k}>
            {k}
          </button>
        ))}
      </div>

      {subSheet && (() => {
        const major = subSheet
        // 点空白/关闭/选“不细分” = 记大类不记小类；选小类 = 记到小类
        const recordMajorOnly = () => { setSubSheet(null); save(major.key, null) }
        return (
          <Sheet title={`${major.label} · 选个小类（可不选）`} onClose={recordMajorOnly}>
            <button className="opt" onClick={recordMajorOnly}>
              <span>就记「{major.label}」</span>
              <span className="sub">不细分小类</span>
            </button>
            <div className="opt-list" style={{ marginTop: 8 }}>
              {subCategories(data, major.key).map((sc) => (
                <button
                  key={sc.key}
                  className="opt"
                  onClick={() => { setSubSheet(null); save(major.key, sc.key) }}
                >
                  <span>{sc.emoji} {sc.label}</span>
                </button>
              ))}
            </div>
          </Sheet>
        )
      })()}

      {dateSheet && (
        <Sheet title="记账日期" onClose={() => setDateSheet(false)}>
          <div className="field">
            <label>日期（可补记历史）</label>
            <input type="date" value={date} max={todayStr()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => { setDate(todayStr()); setDateSheet(false) }}>
              回到今天
            </button>
            <button className="btn" onClick={() => setDateSheet(false)}>
              好了
            </button>
          </div>
        </Sheet>
      )}

      {curSheet && (
        <CurrencySheet
          currency={currency}
          rate={effRate}
          rates={s.fx_rates}
          onPick={(cur, rate) => {
            setCurrency(cur)
            setFxRate(cur === 'CNY' ? null : rate)
            setCurSheet(false)
          }}
          onClose={() => setCurSheet(false)}
        />
      )}

      {tripSheet && (
        <TripSheet
          trips={trips.map((t) => ({ id: t.id, name: t.name }))}
          activeTripId={activeTrip?.id ?? null}
          onPick={(id) => {
            setTripOverride(id)
            setTripSheet(false)
          }}
          onNew={(name, activate) => {
            const t = addTrip(name, activate)
            setTripOverride(t.id)
            setTripSheet(false)
            showToast(activate ? `旅行模式已开启：${name}` : `已创建旅行：${name}`)
          }}
          onEndTravelMode={() => {
            setActiveTrip(null)
            setTripOverride('default')
            setTripSheet(false)
            showToast('旅行模式已结束')
          }}
          onClose={() => setTripSheet(false)}
        />
      )}

      {tplSheet && (
        <TemplateSheet
          onClose={() => setTplSheet(false)}
          onApplySimple={(cfg) => {
            setTplSheet(false)
            setType(cfg.type ?? 'expense')
            if (cfg.amount) setAmountStr(String(cfg.amount))
            setNote(cfg.note ?? '')
            if (cfg.category) setPreselCat({ cat: cfg.category, sub: cfg.subcategory ?? null })
            showToast('模板已填入，点保存')
          }}
        />
      )}

      {cardLink && (
        <CardLinkSheet
          amount={cardLink.amount}
          cat={cardLink.cat}
          sub={cardLink.sub}
          onClose={() => setCardLink(null)}
        />
      )}
    </div>
  )
}

// ---------------- 子 Sheet ----------------

function CurrencySheet(props: {
  currency: string
  rate: number
  rates: Record<string, number>
  onPick: (cur: string, rate: number) => void
  onClose: () => void
}) {
  const [cur, setCur] = useState(props.currency)
  const [rateStr, setRateStr] = useState(String(props.currency === 'CNY' ? props.rates[cur] ?? 1 : props.rate))
  return (
    <Sheet title="币种与汇率" onClose={props.onClose}>
      <div className="field">
        <label>币种</label>
        <select
          value={cur}
          onChange={(e) => {
            const c = e.target.value
            setCur(c)
            setRateStr(String(c === 'CNY' ? 1 : props.rates[c] ?? 1))
          }}
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {CURRENCY_SYMBOL[c]} {c === 'CNY' ? '人民币（默认）' : c}
            </option>
          ))}
        </select>
      </div>
      {cur !== 'CNY' && (
        <div className="field">
          <label>本次汇率（1 {cur} = ? CNY，可手改）</label>
          <input className="num" type="text" inputMode="decimal" value={rateStr} onChange={(e) => setRateStr(e.target.value)} />
        </div>
      )}
      <button
        className="btn"
        onClick={() => {
          const r = parseAmount(rateStr)
          props.onPick(cur, cur === 'CNY' ? 1 : Number.isFinite(r) && r > 0 ? r : 1)
        }}
      >
        确定
      </button>
    </Sheet>
  )
}

function TripSheet(props: {
  trips: { id: string; name: string }[]
  activeTripId: string | null
  onPick: (id: string) => void
  onNew: (name: string, activate: boolean) => void
  onEndTravelMode: () => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [activate, setActivate] = useState(true)
  return (
    <Sheet title="旅行标签" onClose={props.onClose}>
      {props.activeTripId && (
        <button className="btn danger-ghost" style={{ marginBottom: 12 }} onClick={props.onEndTravelMode}>
          结束当前旅行模式
        </button>
      )}
      {props.trips.length > 0 && (
        <div className="opt-list">
          {props.trips.map((t) => (
            <button key={t.id} className="opt" onClick={() => props.onPick(t.id)}>
              <span>✈️ {t.name}</span>
              {t.id === props.activeTripId && <span className="sub">进行中</span>}
            </button>
          ))}
        </div>
      )}
      <div className="field" style={{ marginTop: 6 }}>
        <label>新建旅行（如「6月杭州」）</label>
        <input type="text" value={name} maxLength={12} placeholder="旅行名称" onChange={(e) => setName(e.target.value)} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, margin: '0 2px 12px' }}>
        <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} style={{ width: 18, height: 18 }} />
        开启旅行模式（之后每笔默认带此标签）
      </label>
      <button className="btn" disabled={!name.trim()} onClick={() => props.onNew(name.trim(), activate)}>
        创建
      </button>
    </Sheet>
  )
}

function TemplateSheet(props: {
  onClose: () => void
  onApplySimple: (cfg: { type?: TxType; category?: string; subcategory?: string | null; note?: string; amount?: number | null }) => void
}) {
  const { data } = useStore()
  const [ayiInput, setAyiInput] = useState<string | null>(null)
  const fixed = data.settings.ayi_fixed
  if (ayiInput !== null) {
    const total = parseAmount(ayiInput)
    const diff = Number.isFinite(total) ? round2(total - Math.min(total, fixed)) : 0
    return (
      <Sheet title="🧹 阿姨月费" onClose={props.onClose}>
        <div className="field">
          <label>本次转账总额（固定 {fmtMoney(fixed)} 归家政，差额归买菜）</label>
          <input
            className="num"
            type="text"
            inputMode="decimal"
            autoFocus
            placeholder="如 1906"
            value={ayiInput}
            onChange={(e) => setAyiInput(e.target.value)}
          />
        </div>
        {Number.isFinite(total) && total > 0 && (
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12 }}>
            将拆成：🏠 阿姨家政 {fmtCny(Math.min(total, fixed))}
            {diff > 0 ? ` ＋ 🍜 食材超市 ${fmtCny(diff)}` : ''}
          </div>
        )}
        <button
          className="btn"
          disabled={!Number.isFinite(total) || total <= 0}
          onClick={() => {
            applyAyiTemplate(total)
            showToast(`已拆两笔记下 ${fmtCny(total)}`)
            props.onClose()
          }}
        >
          确认入账
        </button>
      </Sheet>
    )
  }
  return (
    <Sheet title="常用模板" onClose={props.onClose}>
      <div className="opt-list">
        <button className="opt" onClick={() => setAyiInput('')}>
          <span>🧹 阿姨月费（自动拆两笔）</span>
          <span className="sub">固定 {fmtMoney(fixed)}＋差额买菜</span>
        </button>
        {data.templates.map((t) => (
          <button key={t.id} className="opt" onClick={() => props.onApplySimple(t.config)}>
            <span>⭐ {t.name}</span>
            <span className="sub">
              {t.config.category ? catLabel(data, t.config.subcategory || t.config.category) : ''}
              {t.config.amount ? ` · ${fmtCny(t.config.amount)}` : ''}
            </span>
          </button>
        ))}
      </div>
      {data.templates.length === 0 && <div className="empty">在明细里点开一笔账，可「存为模板」</div>}
    </Sheet>
  )
}

/** 记完充值卡支出后：一步建卡/续卡 */
function CardLinkSheet(props: { amount: number; cat: string; sub: string | null; onClose: () => void }) {
  const { data } = useStore()
  const [mode, setMode] = useState<'menu' | 'new-count' | 'new-balance' | 'renew'>('menu')
  const [renewFrom, setRenewFrom] = useState<string | null>(null)
  const defaultName = props.sub ? catLabel(data, props.sub) : ''
  const [name, setName] = useState(defaultName)
  const [countStr, setCountStr] = useState('')
  const [expire, setExpire] = useState('')

  if (mode === 'menu') {
    return (
      <Sheet title="🎫 关联充值卡？" onClose={props.onClose}>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12 }}>
          这笔 {fmtCny(props.amount)} 已标记办卡/充值，可顺手建卡/续卡（之后划卡消费永不重复计支出）
        </div>
        <div className="opt-list">
          <button className="opt" onClick={() => setMode('new-count')}>
            <span>🆕 新建次卡</span>
            <span className="sub">如健身 12 次</span>
          </button>
          <button className="opt" onClick={() => setMode('new-balance')}>
            <span>🆕 新建金额卡</span>
            <span className="sub">如美甲储值 3000</span>
          </button>
          {data.cards.length > 0 && (
            <button className="opt" onClick={() => setMode('renew')}>
              <span>🔁 给已有卡续卡</span>
            </button>
          )}
          <button className="opt" onClick={props.onClose}>
            <span style={{ color: 'var(--ink-3)' }}>跳过，只记账</span>
          </button>
        </div>
      </Sheet>
    )
  }

  if (mode === 'renew') {
    return (
      <Sheet title="选择要续的卡" onClose={props.onClose}>
        <div className="opt-list">
          {data.cards.map((c) => (
            <button
              key={c.id}
              className="opt"
              onClick={() => {
                setRenewFrom(c.id)
                setName(c.name)
                setMode(c.kind === 'count' ? 'new-count' : 'new-balance')
              }}
            >
              <span>{c.name}</span>
              <span className="sub">{c.status === 'archived' ? '已用完/归档' : '使用中'}</span>
            </button>
          ))}
        </div>
      </Sheet>
    )
  }

  const isCount = mode === 'new-count'
  const count = parseAmount(countStr)
  return (
    <Sheet title={renewFrom ? '🔁 续卡' : isCount ? '🆕 新建次卡' : '🆕 新建金额卡'} onClose={props.onClose}>
      <div className="field">
        <label>卡名称</label>
        <input type="text" value={name} maxLength={12} placeholder="如 健身私教" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>{isCount ? `总价（默认本笔 ${fmtCny(props.amount)}）` : `充值金额`}</label>
        <input className="num" type="text" inputMode="decimal" value={String(props.amount)} readOnly />
      </div>
      {isCount && (
        <div className="field">
          <label>总次数</label>
          <input className="num" type="text" inputMode="numeric" placeholder="如 12" value={countStr} onChange={(e) => setCountStr(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label>到期日（选填）</label>
        <input type="date" value={expire} onChange={(e) => setExpire(e.target.value)} />
      </div>
      <button
        className="btn"
        disabled={!name.trim() || (isCount && (!Number.isFinite(count) || count < 1))}
        onClick={() => {
          const input = {
            name: name.trim(),
            category: props.cat,
            subcategory: props.sub,
            kind: (isCount ? 'count' : 'balance') as 'count' | 'balance',
            totalPrice: props.amount,
            totalCount: isCount ? Math.round(count) : undefined,
            balance: isCount ? undefined : props.amount,
            expireDate: expire || null,
          }
          if (renewFrom) renewCard(renewFrom, input)
          else addCard(input)
          showToast(renewFrom ? '已续卡' : '已建卡')
          props.onClose()
        }}
      >
        {renewFrom ? '续卡' : '建卡'}
      </button>
    </Sheet>
  )
}
