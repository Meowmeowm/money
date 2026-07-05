import { useMemo, useState } from 'react'
import { useStore, updateSettings } from '../store'
import {
  monthSummary, categoryBreakdown, cardUsageInMonth, tripSummaries, housingFundStatus,
} from '../lib/derive'
import { catColor, catFg, catEmoji, catLabel } from '../lib/catalog'
import { CatGlyph } from '../components/icons'
import { fmtCny, fmtMoney, monthLabel, shiftMonth, thisMonthKey, clamp } from '../lib/utils'
import { Segmented, Sheet } from '../components/ui'
import { CAT_CARDS } from '../data/categories'

export default function StatsPage() {
  const { data } = useStore()
  const s = data.settings
  const [mk, setMk] = useState(thisMonthKey())
  const [drill, setDrill] = useState<string | null>(null)
  const [tripOpen, setTripOpen] = useState<string | null>(null)

  const includeCards = s.stats_include_cards
  const sum = useMemo(() => monthSummary(data, mk, includeCards), [data, mk, includeCards])
  const ranks = useMemo(() => categoryBreakdown(data, mk, includeCards), [data, mk, includeCards])
  const consume = useMemo(() => cardUsageInMonth(data, mk), [data, mk])
  const trips = useMemo(() => tripSummaries(data).filter((t) => t.count > 0), [data])
  const fund = useMemo(() => housingFundStatus(data), [data])

  const isThisMonth = mk === thisMonthKey()

  // 预算（默认口径不含充值卡，可跟随开关）
  const budgetSum = useMemo(
    () => monthSummary(data, mk, s.budget_include_cards),
    [data, mk, s.budget_include_cards],
  )

  return (
    <div className="page">
      <div className="month-switch">
        <button onClick={() => setMk(shiftMonth(mk, -1))} aria-label="上个月">‹</button>
        <span className="mo">{monthLabel(mk)}</span>
        <button onClick={() => setMk(shiftMonth(mk, 1))} disabled={isThisMonth} aria-label="下个月">›</button>
      </div>

      {fund?.warn && (
        <div className="banner warn">
          🏦 公积金余额约可撑 {fund.monthsLeft} 个月，预计 {fund.runOutLabel} 起需现金补足月供
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <span>本月汇总</span>
          <Segmented
            options={[
              { value: 'excl', label: '不含充值卡' },
              { value: 'incl', label: '含充值卡' },
            ]}
            value={includeCards ? 'incl' : 'excl'}
            onChange={(v) => updateSettings({ stats_include_cards: v === 'incl' })}
          />
        </div>
        <div className="sum-grid">
          <div>
            <div className="k">支出</div>
            <div className="v exp">{fmtMoney(sum.expense)}</div>
          </div>
          <div>
            <div className="k">收入</div>
            <div className="v inc">{fmtMoney(sum.income)}</div>
          </div>
          <div>
            <div className="k">结余</div>
            <div className="v">{fmtMoney(sum.balance)}</div>
          </div>
        </div>
      </div>

      {s.budget_enabled && s.budget_total != null && s.budget_total > 0 && (
        <BudgetBlock spent={budgetSum.expense} total={s.budget_total} byCat={s.budget_by_category} data={data} mk={mk} includeCards={s.budget_include_cards} />
      )}

      <div className="card">
        <div className="card-title">
          <span>分类占比{includeCards ? '' : '（不含充值卡）'}</span>
        </div>
        {ranks.length === 0 && <div className="empty">本月还没有支出</div>}
        {ranks.map((r) => (
          <button key={r.key} className="rank-row" onClick={() => setDrill(r.key)}>
            <span className="rank-ico" style={{ background: catColor(r.key), color: catFg(r.key) }}>
              <CatGlyph keyName={r.key} emoji={catEmoji(data, r.key)} size={18} />
            </span>
            <span className="rank-main">
              <span className="rank-top">
                <span>
                  {catLabel(data, r.key)}
                  <span className="meta">{r.count} 笔 · {Math.round(r.pct * 100)}%</span>
                </span>
                <span className="num">{fmtMoney(r.amount)}</span>
              </span>
              <span className="rank-bar">
                <span style={{ display: 'block', width: `${Math.max(3, r.pct * 100)}%`, height: '100%', borderRadius: 3, background: 'var(--primary)' }} />
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-title"><span>本月卡消耗（非现金，不计入上方支出）</span></div>
        {consume.rows.length === 0 && <div className="empty">本月没有划卡记录</div>}
        {consume.rows.map((row) => (
          <div className="consume-row" key={row.card.id}>
            <span>
              {row.card.name}
              <span className="meta">
                {' '}
                {row.card.kind === 'count'
                  ? `${row.times} 次${row.card.status === 'active' ? ` · 剩 ${row.card.remaining_count} 次` : ' · 已用完'}`
                  : `划扣${row.card.status === 'active' ? ` · 剩 ${fmtCny(row.card.remaining_balance ?? 0)}` : ' · 已用完'}`}
              </span>
            </span>
            <span className="r">≈ {fmtCny(row.equivalent)}</span>
          </div>
        ))}
        {consume.rows.length > 0 && (
          <div className="consume-row consume-total">
            <span>合计折合</span>
            <span className="r">≈ {fmtCny(consume.total)}</span>
          </div>
        )}
      </div>

      {trips.length > 0 && (
        <div className="card">
          <div className="card-title"><span>旅行汇总</span></div>
          {trips.map((t) => (
            <button key={t.tripId} className="rank-row" onClick={() => setTripOpen(t.tripId)}>
              <span className="rank-ico" style={{ background: 'var(--primary-soft)' }}>✈️</span>
              <span className="rank-main">
                <span className="rank-top">
                  <span>
                    {t.name}
                    <span className="meta">{t.count} 笔</span>
                  </span>
                  <span className="num">{fmtMoney(t.total)}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {drill && (
        <Sheet title={`${catEmoji(data, drill)} ${catLabel(data, drill)} · ${monthLabel(mk)}`} onClose={() => setDrill(null)}>
          <DrillList mk={mk} parent={drill} includeCards={includeCards} />
        </Sheet>
      )}

      {tripOpen && (
        <Sheet title="旅行汇总" onClose={() => setTripOpen(null)}>
          {(() => {
            const t = trips.find((x) => x.tripId === tripOpen)
            if (!t) return null
            return (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
                  ✈️ {t.name} · 共 {fmtCny(t.total)}
                </div>
                {t.byCategory.map((c) => (
                  <div className="consume-row" key={c.key}>
                    <span>
                      {catEmoji(data, c.key)} {catLabel(data, c.key)}
                    </span>
                    <span className="r">{fmtCny(c.amount)}</span>
                  </div>
                ))}
              </>
            )
          })()}
        </Sheet>
      )}
    </div>
  )
}

function DrillList(props: { mk: string; parent: string; includeCards: boolean }) {
  const { data } = useStore()
  const rows = categoryBreakdown(data, props.mk, props.includeCards, props.parent)
  if (rows.length === 0) return <div className="empty">没有记录</div>
  return (
    <div>
      {rows.map((r) => (
        <div className="consume-row" key={r.key}>
          <span>
            {r.key === '_none' ? '一般' : `${catEmoji(data, r.key)} ${catLabel(data, r.key)}`}
            <span className="meta"> {r.count} 笔 · {Math.round(r.pct * 100)}%</span>
          </span>
          <span className="r">{fmtCny(r.amount)}</span>
        </div>
      ))}
    </div>
  )
}

function BudgetBlock(props: {
  spent: number
  total: number
  byCat: Record<string, number>
  data: ReturnType<typeof useStore>['data']
  mk: string
  includeCards: boolean
}) {
  const pct = props.total > 0 ? props.spent / props.total : 0
  const cls = pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : ''
  const catEntries = Object.entries(props.byCat).filter(([, v]) => v > 0)
  const catSpend = useMemo(
    () => categoryBreakdown(props.data, props.mk, props.includeCards),
    [props.data, props.mk, props.includeCards],
  )
  return (
    <div className="card">
      <div className="card-title">
        <span>本月预算{props.includeCards ? '（含充值卡）' : '（不含充值卡）'}</span>
        <span className="num" style={{ fontWeight: 700, color: pct >= 1 ? 'var(--expense)' : 'var(--ink)' }}>
          剩 {fmtCny(Math.max(0, props.total - props.spent))}
        </span>
      </div>
      <div className="progress">
        <div className={cls} style={{ width: `${clamp(pct * 100, 2, 100)}%` }} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-2)' }} className="num">
        {fmtMoney(props.spent)} / {fmtMoney(props.total)}（{Math.round(pct * 100)}%）
      </div>
      {catEntries.map(([key, budget]) => {
        const spent = catSpend.find((c) => c.key === key)?.amount ?? 0
        const p = spent / budget
        const c = p >= 1 ? 'over' : p >= 0.8 ? 'warn' : ''
        return (
          <div key={key} style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
              <span>
                {catEmoji(props.data, key)} {catLabel(props.data, key)}
              </span>
              <span className="num" style={{ color: 'var(--ink-2)' }}>
                {fmtMoney(spent)} / {fmtMoney(budget)}
              </span>
            </div>
            <div className="progress" style={{ height: 6, margin: '4px 0 0' }}>
              <div className={c} style={{ width: `${clamp(p * 100, 2, 100)}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
