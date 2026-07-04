import { useMemo, useState } from 'react'
import type { Transaction } from '../types'
import { useStore, updateTransaction, deleteTransaction, markRefund, addTemplate, showToast } from '../store'
import { catColor, catEmoji, catLabel, majorCategories, subCategories } from '../lib/catalog'
import { dayLabel, fmtCny, fmtMoney, round2, todayStr } from '../lib/utils'
import { Sheet, parseAmount } from '../components/ui'
import { CURRENCIES, CURRENCY_SYMBOL } from '../lib/fx'

export default function DetailsPage() {
  const { data } = useStore()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Transaction | null>(null)

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = data.transactions.filter((t) => {
      if (!q) return true
      const hay = [t.note, catLabel(data, t.category), t.subcategory ? catLabel(data, t.subcategory) : '']
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
    const byDay = new Map<string, Transaction[]>()
    for (const t of list) {
      const arr = byDay.get(t.date) ?? []
      arr.push(t)
      byDay.set(t.date, arr)
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, txs]) => ({
        date,
        txs: txs.sort((a, b) => b.created_at.localeCompare(a.created_at)),
        expense: round2(txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount_cny, 0)),
        income: round2(txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount_cny, 0)),
      }))
  }, [data, query])

  return (
    <div className="page">
      <div className="search-row">
        <input type="text" placeholder="🔍 搜备注 / 分类" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {grouped.length === 0 && <div className="empty">{query ? '没有匹配的记录' : '还没有账目，去记一笔吧'}</div>}
      {grouped.map((g) => (
        <div className="day-group" key={g.date}>
          <div className="day-head">
            <span>{dayLabel(g.date)}</span>
            <span className="sub num">
              {g.expense > 0 ? `支 ${fmtMoney(g.expense)}` : ''}
              {g.expense > 0 && g.income > 0 ? ' · ' : ''}
              {g.income > 0 ? `收 ${fmtMoney(g.income)}` : ''}
            </span>
          </div>
          <div className="tx-list">
            {g.txs.map((t) => (
              <TxRow key={t.id} t={t} onTap={() => setEditing(t)} />
            ))}
          </div>
        </div>
      ))}
      {editing && <EditSheet t={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function TxRow(props: { t: Transaction; onTap: () => void }) {
  const { data } = useStore()
  const { t } = props
  const trip = t.trip_id ? data.trips.find((x) => x.id === t.trip_id) : null
  const displayKey = t.subcategory ?? t.category
  return (
    <button className="tx-item" onClick={props.onTap}>
      <span className="tx-ico" style={{ background: catColor(t.category) }}>
        {catEmoji(data, displayKey)}
      </span>
      <span className="tx-main">
        <span className="tx-cat">
          {catLabel(data, t.category)}
          {t.subcategory && <span className="sub"> · {catLabel(data, t.subcategory)}</span>}
        </span>
        <span className="tx-note">
          {trip && <span className="badge">✈️ {trip.name}</span>}
          {t.refund_status === 'full' && <span className="badge rf">已退款</span>}
          {t.refund_status === 'partial' && <span className="badge rf">部分退款 -{fmtMoney(t.refund_amount)}</span>}
          {t.note}
        </span>
      </span>
      <span className={`tx-amt ${t.type === 'income' ? 'inc' : 'exp'} ${t.refund_status === 'full' ? 'refunded' : ''}`}>
        {t.type === 'income' ? '+' : '-'}
        {fmtMoney(t.refund_status === 'full' ? t.amount_cny + t.refund_amount : t.amount_cny)}
        {t.currency !== 'CNY' && t.original_amount != null && (
          <span className="orig">
            {CURRENCY_SYMBOL[t.currency] ?? t.currency}
            {fmtMoney(t.original_amount)}
          </span>
        )}
      </span>
    </button>
  )
}

function EditSheet(props: { t: Transaction; onClose: () => void }) {
  const { data } = useStore()
  const t = data.transactions.find((x) => x.id === props.t.id) ?? props.t
  const gross = round2(t.amount_cny + t.refund_amount)

  const [amountStr, setAmountStr] = useState(String(t.currency === 'CNY' ? gross : t.original_amount ?? gross))
  const [currency, setCurrency] = useState(t.currency)
  const [rateStr, setRateStr] = useState(String(t.fx_rate ?? data.settings.fx_rates[t.currency] ?? 1))
  const [cat, setCat] = useState(t.category)
  const [sub, setSub] = useState<string | null>(t.subcategory)
  const [note, setNote] = useState(t.note)
  const [date, setDate] = useState(t.date)
  const [tripId, setTripId] = useState<string | null>(t.trip_id)
  const [refundMode, setRefundMode] = useState(false)
  const [refundStr, setRefundStr] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [tplName, setTplName] = useState<string | null>(null)

  const majors = majorCategories(data, t.type)
  const subs = subCategories(data, cat)

  function doSave() {
    const amt = parseAmount(amountStr)
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('金额无效')
      return
    }
    const isForeign = currency !== 'CNY'
    const rate = isForeign ? parseAmount(rateStr) : 1
    const grossCny = round2(amt * (Number.isFinite(rate) && rate > 0 ? rate : 1))
    const refund = Math.min(t.refund_amount, grossCny)
    updateTransaction(t.id, {
      amount_cny: round2(grossCny - refund),
      refund_amount: refund,
      original_amount: isForeign ? amt : null,
      currency,
      fx_rate: isForeign ? rate : null,
      category: cat,
      subcategory: sub,
      note: note.slice(0, 20),
      date,
      trip_id: tripId,
    })
    showToast('已保存')
    props.onClose()
  }

  return (
    <Sheet title="编辑这笔账" onClose={props.onClose}>
      <div className="field">
        <label>金额{currency !== 'CNY' ? `（${currency} 原币）` : ''}{t.refund_status !== 'none' ? '（退款前原额）' : ''}</label>
        <input className="num" type="text" inputMode="decimal" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
      </div>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>币种</label>
          <select
            value={currency}
            onChange={(e) => {
              const c = e.target.value
              setCurrency(c)
              setRateStr(String(c === 'CNY' ? 1 : data.settings.fx_rates[c] ?? 1))
            }}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {CURRENCY_SYMBOL[c]} {c}
              </option>
            ))}
          </select>
        </div>
        {currency !== 'CNY' && (
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>汇率 → CNY</label>
            <input className="num" type="text" inputMode="decimal" value={rateStr} onChange={(e) => setRateStr(e.target.value)} />
          </div>
        )}
      </div>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>大类</label>
          <select
            value={cat}
            onChange={(e) => {
              setCat(e.target.value)
              setSub(null)
            }}
          >
            {majors.map((c) => (
              <option key={c.key} value={c.key}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>小类</label>
          <select value={sub ?? ''} onChange={(e) => setSub(e.target.value || null)} disabled={subs.length === 0}>
            <option value="">一般</option>
            {subs.map((c) => (
              <option key={c.key} value={c.key}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>备注</label>
        <input type="text" maxLength={20} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>日期</label>
          <input type="date" value={date} max={todayStr()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        {t.type === 'expense' && (
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>旅行标签</label>
            <select value={tripId ?? ''} onChange={(e) => setTripId(e.target.value || null)}>
              <option value="">无</option>
              {data.trips.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  ✈️ {tr.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {t.type === 'expense' && (
        <div className="card" style={{ background: 'var(--expense-soft)', boxShadow: 'none' }}>
          <div className="card-title" style={{ marginBottom: refundMode || t.refund_status !== 'none' ? 10 : 0 }}>
            <span>退款处理{t.refund_status !== 'none' ? `（已退 ${fmtCny(t.refund_amount)}）` : ''}</span>
            {!refundMode && t.refund_status === 'none' && (
              <button className="link-btn" onClick={() => setRefundMode(true)}>
                标记退款
              </button>
            )}
            {t.refund_status !== 'none' && (
              <button
                className="link-btn"
                onClick={() => {
                  markRefund(t.id, 'none')
                  showToast('已取消退款标记')
                  props.onClose()
                }}
              >
                取消退款
              </button>
            )}
          </div>
          {refundMode && t.refund_status === 'none' && (
            <>
              <button
                className="btn ghost"
                style={{ marginBottom: 8 }}
                onClick={() => {
                  markRefund(t.id, 'full')
                  showToast('整笔已冲销为 0')
                  props.onClose()
                }}
              >
                整笔退款（冲销为 0）
              </button>
              <div className="btn-row">
                <input
                  className="num"
                  type="text"
                  inputMode="decimal"
                  placeholder="部分退款金额"
                  value={refundStr}
                  onChange={(e) => setRefundStr(e.target.value)}
                  style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 11, padding: '10px 12px', background: '#fff' }}
                />
                <button
                  className="btn sm"
                  disabled={!Number.isFinite(parseAmount(refundStr)) || parseAmount(refundStr) <= 0}
                  onClick={() => {
                    markRefund(t.id, 'partial', parseAmount(refundStr))
                    showToast('已按净额入账')
                    props.onClose()
                  }}
                >
                  退这么多
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <button className="btn" onClick={doSave} style={{ marginBottom: 10 }}>
        保存修改
      </button>
      <div className="btn-row">
        <button className="btn ghost" onClick={() => setTplName(t.note || catLabel(data, sub ?? cat))}>
          存为模板
        </button>
        <button
          className={confirmDel ? 'btn' : 'btn danger-ghost'}
          style={confirmDel ? { background: 'var(--danger)' } : undefined}
          onClick={() => {
            if (!confirmDel) {
              setConfirmDel(true)
              return
            }
            deleteTransaction(t.id)
            showToast('已删除')
            props.onClose()
          }}
        >
          {confirmDel ? '确认删除？' : '删除'}
        </button>
      </div>

      {tplName !== null && (
        <Sheet title="存为模板" onClose={() => setTplName(null)}>
          <div className="field">
            <label>模板名</label>
            <input type="text" value={tplName} maxLength={10} onChange={(e) => setTplName(e.target.value)} autoFocus />
          </div>
          <button
            className="btn"
            disabled={!tplName.trim()}
            onClick={() => {
              addTemplate(tplName.trim(), {
                kind: 'simple',
                type: t.type,
                category: cat,
                subcategory: sub,
                note,
                amount: parseAmount(amountStr) || null,
              })
              showToast('模板已保存，记账页「模板」里可用')
              setTplName(null)
            }}
          >
            保存模板
          </button>
        </Sheet>
      )}
    </Sheet>
  )
}
