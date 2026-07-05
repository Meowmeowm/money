import { useMemo, useState } from 'react'
import type { Card, Category, HousingFund } from '../types'
import {
  useStore, addCard, updateCard, deleteCard, useCard, deleteUsage, renewCard,
  updateSettings, setHousingFund, deleteTemplate, updateTrip, deleteTrip, setActiveTrip,
  upsertCategory, deleteCategory, signOut, showToast,
} from '../store'
import { cardWarnState, cardUnitPrice, seriesStats, usagesOfCard, housingFundStatus } from '../lib/derive'
import { exportCsv } from '../lib/csv'
import { fmtCny, fmtMoney, round2, todayStr, uid, dayLabel } from '../lib/utils'
import { Sheet, parseAmount } from '../components/ui'
import { catLabel, majorCategories, subCategories } from '../lib/catalog'
import { isCloudConfigured } from '../lib/supabase'
import { CURRENCIES } from '../lib/fx'

export default function MinePage() {
  const { data, pending, sync } = useStore()
  const [cardOpen, setCardOpen] = useState<string | null>(null)
  const [newCard, setNewCard] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [fundOpen, setFundOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState<null | 'budget' | 'fx' | 'cats' | 'trips' | 'ayi'>(null)

  const active = data.cards.filter((c) => c.status === 'active')
  const archived = data.cards.filter((c) => c.status === 'archived')
  const fund = housingFundStatus(data)

  return (
    <div className="page">
      <div className="section-h">
        <span>🎫 我的卡</span>
        <button className="link-btn" onClick={() => setNewCard(true)}>＋ 新建卡</button>
      </div>
      {active.length === 0 && <div className="empty">还没有充值卡。办卡记账时可一步建卡</div>}
      {active.map((c) => (
        <CardRow key={c.id} card={c} onTap={() => setCardOpen(c.id)} />
      ))}
      {archived.length > 0 && (
        <>
          <div className="section-h">
            <span>📁 历史卡（{archived.length}）</span>
            <button className="link-btn" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? '收起' : '展开'}
            </button>
          </div>
          {showArchived && archived.map((c) => <CardRow key={c.id} card={c} onTap={() => setCardOpen(c.id)} archived />)}
        </>
      )}

      <div className="section-h"><span>🏦 公积金监控</span></div>
      <button className="card" style={{ width: '100%', textAlign: 'left', display: 'block' }} onClick={() => setFundOpen(true)}>
        {!data.housing_fund && <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>录入余额、月缴存、月供，看看还能撑几个月 →</span>}
        {data.housing_fund && fund && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14.5, fontWeight: 600 }}>
              <span>余额 {fmtCny(data.housing_fund.balance)}</span>
              <span className="num" style={{ color: fund.net >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                {fund.net >= 0 ? '+' : ''}{fmtMoney(fund.net)}/月
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: fund.warn ? 'var(--warn)' : 'var(--ink-2)', marginTop: 4 }}>
              {fund.net >= 0
                ? '余额持续增长 ✓'
                : `约可撑 ${fund.monthsLeft} 个月，预计 ${fund.runOutLabel} 需现金补足`}
            </div>
          </>
        )}
      </button>

      <div className="section-h"><span>⭐ 我的模板</span></div>
      <div className="card">
        <div className="row-line">
          <span>🧹 阿姨月费（内置）<div className="rl-sub">固定 {fmtMoney(data.settings.ayi_fixed)} 家政 ＋ 差额买菜</div></span>
          <button className="link-btn" onClick={() => setSettingsOpen('ayi')}>改金额</button>
        </div>
        {data.templates.map((t) => (
          <div className="row-line" key={t.id}>
            <span>
              ⭐ {t.name}
              <div className="rl-sub">
                {t.config.category ? catLabel(data, t.config.subcategory || t.config.category) : ''}
                {t.config.amount ? ` · ${fmtCny(t.config.amount)}` : ''}
              </div>
            </span>
            <button className="link-btn danger-txt" onClick={() => { deleteTemplate(t.id); showToast('已删除模板') }}>删除</button>
          </div>
        ))}
      </div>

      <div className="section-h"><span>⚙️ 设置</span></div>
      <div className="card">
        <button className="row-line" onClick={() => setSettingsOpen('budget')}>
          <span>预算</span>
          <span className="rl-val">{data.settings.budget_enabled ? `已开启 · 总额 ${data.settings.budget_total ? fmtCny(data.settings.budget_total) : '未设'}` : '未开启'} ›</span>
        </button>
        <button className="row-line" onClick={() => setSettingsOpen('cats')}>
          <span>分类管理</span>
          <span className="rl-val">›</span>
        </button>
        <button className="row-line" onClick={() => setSettingsOpen('trips')}>
          <span>旅行管理</span>
          <span className="rl-val">{data.settings.active_trip_id ? '旅行模式进行中' : ''} ›</span>
        </button>
        <button className="row-line" onClick={() => setSettingsOpen('fx')}>
          <span>默认汇率</span>
          <span className="rl-val">›</span>
        </button>
        <button className="row-line" onClick={() => { exportCsv(data); showToast('CSV 已导出') }}>
          <span>导出全部记录 CSV</span>
          <span className="rl-val">{data.transactions.length} 笔 ›</span>
        </button>
        {isCloudConfigured ? (
          <>
            <div className="row-line">
              <span>云同步</span>
              <span className="rl-val">{sync === 'offline' ? `离线 · ${pending} 笔待同步` : pending > 0 ? `${pending} 笔待同步` : '已同步 ✓'}</span>
            </div>
            <button className="row-line" onClick={() => void signOut()}>
              <span className="danger-txt">退出登录</span>
              <span className="rl-val">›</span>
            </button>
          </>
        ) : (
          <div className="row-line">
            <span>云同步</span>
            <span className="rl-val">未配置（本地模式）</span>
          </div>
        )}
      </div>

      {cardOpen && <CardDetailSheet cardId={cardOpen} onClose={() => setCardOpen(null)} />}
      {newCard && <NewCardSheet onClose={() => setNewCard(false)} />}
      {fundOpen && <FundSheet onClose={() => setFundOpen(false)} />}
      {settingsOpen === 'budget' && <BudgetSheet onClose={() => setSettingsOpen(null)} />}
      {settingsOpen === 'fx' && <FxSheet onClose={() => setSettingsOpen(null)} />}
      {settingsOpen === 'cats' && <CatsSheet onClose={() => setSettingsOpen(null)} />}
      {settingsOpen === 'trips' && <TripsSheet onClose={() => setSettingsOpen(null)} />}
      {settingsOpen === 'ayi' && <AyiSheet onClose={() => setSettingsOpen(null)} />}
    </div>
  )
}

function CardRow(props: { card: Card; onTap: () => void; archived?: boolean }) {
  const c = props.card
  const { low, expiring } = cardWarnState(c)
  const warn = !props.archived && (low || expiring)
  return (
    <button className={`mycard ${warn ? 'low' : ''}`} onClick={props.onTap} style={props.archived ? { opacity: 0.65 } : undefined}>
      <div className="mycard-top">
        <span className="mycard-name">{c.name}</span>
        <span className="mycard-remain num">
          {c.kind === 'count' ? `剩 ${c.remaining_count} 次` : `剩 ${fmtCny(c.remaining_balance ?? 0)}`}
        </span>
      </div>
      <div className="mycard-meta">
        <span>
          {c.kind === 'count'
            ? `${c.total_count} 次卡 · 单次 ≈ ${fmtCny(cardUnitPrice(c))}`
            : `储值卡 · 充 ${fmtCny(c.balance ?? 0)}`}
        </span>
        <span className={warn ? 'warn-txt' : ''}>
          {props.archived ? '已归档' : expiring && c.expire_date ? `⚠ ${c.expire_date} 到期` : low ? '⚠ 余量不多' : c.expire_date ? `${c.expire_date} 到期` : ''}
        </span>
      </div>
    </button>
  )
}

function CardDetailSheet(props: { cardId: string; onClose: () => void }) {
  const { data } = useStore()
  const card = data.cards.find((c) => c.id === props.cardId)
  const [useAmtStr, setUseAmtStr] = useState('')
  const [useDate, setUseDate] = useState(todayStr())
  const [confirmUse, setConfirmUse] = useState(false)
  const [renewing, setRenewing] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const usages = useMemo(() => (card ? usagesOfCard(data, card.id) : []), [data, card])
  if (!card) return null
  const series = seriesStats(data, card)

  if (renewing) {
    return (
      <NewCardSheet
        onClose={() => setRenewing(false)}
        renewFrom={card}
        afterSave={() => {
          setRenewing(false)
          props.onClose()
        }}
      />
    )
  }

  return (
    <Sheet title={`${card.name}${card.status === 'archived' ? '（已归档）' : ''}`} onClose={props.onClose}>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="num" style={{ fontSize: 30, fontWeight: 800, color: 'var(--primary)' }}>
          {card.kind === 'count' ? `剩 ${card.remaining_count} / ${card.total_count} 次` : `剩 ${fmtCny(card.remaining_balance ?? 0)}`}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 4 }}>
          {card.kind === 'count' ? `总价 ${fmtCny(card.total_price ?? 0)} · 单次 ≈ ${fmtCny(cardUnitPrice(card))}` : `充值 ${fmtCny(card.balance ?? 0)}`}
          {card.expire_date ? ` · ${card.expire_date} 到期` : ''}
          {series.count > 1 ? ` · 第 ${series.period} 期 / 累计投入 ${fmtCny(series.totalInvested)}` : ''}
        </div>
      </div>

      {card.status === 'active' && (
        <div className="card">
          <div className="field">
            <label>划卡日期</label>
            <input type="date" value={useDate} max={todayStr()} onChange={(e) => e.target.value && setUseDate(e.target.value)} />
          </div>
          {card.kind === 'count' ? (
            <button
              className="btn"
              onClick={() => {
                if (!confirmUse) { setConfirmUse(true); return }
                useCard(card.id, { count: 1, date: useDate })
                setConfirmUse(false)
                showToast(`已扣 1 次，剩 ${(card.remaining_count ?? 1) - 1} 次`)
              }}
            >
              {confirmUse ? `确认扣 1 次？（剩 ${(card.remaining_count ?? 1) - 1} 次）` : '🎯 扣一次'}
            </button>
          ) : (
            <div className="btn-row">
              <input
                className="num"
                type="text"
                inputMode="decimal"
                placeholder="本次划扣金额"
                value={useAmtStr}
                onChange={(e) => setUseAmtStr(e.target.value)}
                style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 11, padding: '10px 12px', background: '#fff' }}
              />
              <button
                className="btn sm"
                disabled={!Number.isFinite(parseAmount(useAmtStr)) || parseAmount(useAmtStr) <= 0}
                onClick={() => {
                  useCard(card.id, { amount: parseAmount(useAmtStr), date: useDate })
                  setUseAmtStr('')
                  showToast('已划扣')
                }}
              >
                划扣
              </button>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-title"><span>扣减历史（{usages.length} 条）</span></div>
        {usages.length === 0 && <div className="empty">还没有划卡记录</div>}
        {usages.map((u) => (
          <div className="consume-row" key={u.id}>
            <span>
              {dayLabel(u.used_at)}
              <span className="meta"> {card.kind === 'count' ? `扣 ${u.count_used} 次` : `划 ${fmtCny(u.amount_used)}`}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="r">≈ {fmtCny(u.equivalent_cny)}</span>
              <button className="link-btn danger-txt" onClick={() => { deleteUsage(u.id); showToast('已撤销这次划卡') }}>撤销</button>
            </span>
          </div>
        ))}
      </div>

      <div className="btn-row" style={{ marginBottom: 10 }}>
        <button className="btn ghost" onClick={() => setRenewing(true)}>🔁 续卡</button>
        {card.status === 'active' ? (
          <button className="btn ghost" onClick={() => { updateCard(card.id, { status: 'archived' }); showToast('已归档'); props.onClose() }}>归档</button>
        ) : (
          <button className="btn ghost" onClick={() => { updateCard(card.id, { status: 'active' }); showToast('已恢复') }}>恢复</button>
        )}
      </div>
      <button
        className={confirmDel ? 'btn' : 'btn danger-ghost'}
        style={confirmDel ? { background: 'var(--danger)' } : undefined}
        onClick={() => {
          if (!confirmDel) { setConfirmDel(true); return }
          deleteCard(card.id)
          showToast('卡已删除')
          props.onClose()
        }}
      >
        {confirmDel ? '确认删除？扣卡记录一并删除' : '删除这张卡'}
      </button>
    </Sheet>
  )
}

function NewCardSheet(props: { onClose: () => void; renewFrom?: Card; afterSave?: () => void }) {
  const r = props.renewFrom
  const { data } = useStore()
  const [kind, setKind] = useState<'count' | 'balance'>(r?.kind ?? 'count')
  const [name, setName] = useState(r?.name ?? '')
  const [priceStr, setPriceStr] = useState(r ? String(r.kind === 'count' ? r.total_price ?? '' : r.balance ?? '') : '')
  const [countStr, setCountStr] = useState(r?.total_count ? String(r.total_count) : '')
  const [expire, setExpire] = useState('')
  const [cardCat, setCardCat] = useState<string>(r?.category ?? 'beauty')
  const [cardSub, setCardSub] = useState<string | null>(r?.subcategory ?? null)
  const price = parseAmount(priceStr)
  const count = parseAmount(countStr)
  const valid = name.trim() && Number.isFinite(price) && price > 0 && (kind === 'balance' || (Number.isFinite(count) && count >= 1))
  return (
    <Sheet title={r ? `🔁 续卡 · ${r.name}` : '新建充值卡'} onClose={props.onClose}>
      {!r && (
        <div className="field">
          <label>类型</label>
          <div className="seg" style={{ display: 'flex' }}>
            <button className={kind === 'count' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setKind('count')}>次卡</button>
            <button className={kind === 'balance' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setKind('balance')}>金额卡</button>
          </div>
        </div>
      )}
      <div className="field">
        <label>名称</label>
        <input type="text" maxLength={12} placeholder="如 健身私教 / 画画课" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field-row">
        <div className="field grow" style={{ marginBottom: 0 }}>
          <label>属于哪类消费</label>
          <select value={cardCat} onChange={(e) => { setCardCat(e.target.value); setCardSub(null) }}>
            {majorCategories(data, 'expense').map((c) => (
              <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>
            ))}
          </select>
        </div>
        <div className="field grow" style={{ marginBottom: 0 }}>
          <label>小类</label>
          <select value={cardSub ?? ''} onChange={(e) => setCardSub(e.target.value || null)} disabled={subCategories(data, cardCat).length === 0}>
            <option value="">不细分</option>
            {subCategories(data, cardCat).map((c) => (
              <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>{kind === 'count' ? '总价（¥）' : '充值金额（¥）'}</label>
        <input className="num" type="text" inputMode="decimal" value={priceStr} onChange={(e) => setPriceStr(e.target.value)} />
      </div>
      {kind === 'count' && (
        <div className="field">
          <label>总次数{Number.isFinite(price) && Number.isFinite(count) && count >= 1 ? ` · 单次 ≈ ${fmtCny(round2(price / Math.round(count)))}` : ''}</label>
          <input className="num" type="text" inputMode="numeric" placeholder="如 12" value={countStr} onChange={(e) => setCountStr(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label>到期日（选填）</label>
        <input type="date" value={expire} onChange={(e) => setExpire(e.target.value)} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 10 }}>
        提示：卡消费会按上面选的「哪类消费」，折算进统计的「消费水平」口径
      </div>
      <button
        className="btn"
        disabled={!valid}
        onClick={() => {
          const input = {
            name: name.trim(), kind,
            category: cardCat,
            subcategory: cardSub,
            totalPrice: kind === 'count' ? price : undefined,
            totalCount: kind === 'count' ? Math.round(count) : undefined,
            balance: kind === 'balance' ? price : undefined,
            expireDate: expire || null,
          }
          if (r) renewCard(r.id, input)
          else addCard(input)
          showToast(r ? '已续卡，旧卡归档' : '已建卡')
          props.afterSave?.()
          props.onClose()
        }}
      >
        {r ? '续卡' : '建卡'}
      </button>
    </Sheet>
  )
}

function FundSheet(props: { onClose: () => void }) {
  const { data } = useStore()
  const hf = data.housing_fund
  const [balance, setBalance] = useState(hf ? String(hf.balance) : '')
  const [deposit, setDeposit] = useState(hf ? String(hf.monthly_deposit) : '')
  const [loanA, setLoanA] = useState(hf ? String(hf.loan_a) : '')
  const [loanB, setLoanB] = useState(hf ? String(hf.loan_b) : '')
  const nums = [balance, deposit, loanA, loanB].map(parseAmount)
  const valid = nums.every((n) => Number.isFinite(n) && n >= 0)
  const preview: HousingFund | null = valid
    ? { balance: nums[0], monthly_deposit: nums[1], loan_a: nums[2], loan_b: nums[3], updated_at: new Date().toISOString() }
    : null
  const status = preview ? housingFundStatus({ ...data, housing_fund: preview }) : null
  return (
    <Sheet title="🏦 公积金监控" onClose={props.onClose}>
      <div className="field">
        <label>账户当前余额（随时可校准）</label>
        <input className="num" type="text" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
      </div>
      <div className="field">
        <label>每月缴存额（个人＋公司）</label>
        <input className="num" type="text" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
      </div>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>月供A（公积金贷）</label>
          <input className="num" type="text" inputMode="decimal" value={loanA} onChange={(e) => setLoanA(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>月供B（商贷）</label>
          <input className="num" type="text" inputMode="decimal" value={loanB} onChange={(e) => setLoanB(e.target.value)} />
        </div>
      </div>
      {status && (
        <div className="banner" style={{ background: status.net >= 0 ? 'var(--income-soft)' : 'var(--warn-soft)', color: status.net >= 0 ? 'var(--income)' : '#8a5f08' }}>
          每月净变化 {status.net >= 0 ? '+' : ''}{fmtMoney(status.net)} ·{' '}
          {status.net >= 0 ? '余额持续增长 ✓' : `约可撑 ${status.monthsLeft} 个月，预计 ${status.runOutLabel} 需现金补足`}
        </div>
      )}
      <button className="btn" disabled={!valid} onClick={() => { setHousingFund(preview); showToast('已保存'); props.onClose() }}>
        保存
      </button>
      {hf && (
        <button className="btn danger-ghost" style={{ marginTop: 8 }} onClick={() => { setHousingFund(null); props.onClose() }}>
          清除监控数据
        </button>
      )}
    </Sheet>
  )
}

function BudgetSheet(props: { onClose: () => void }) {
  const { data } = useStore()
  const s = data.settings
  const [enabled, setEnabled] = useState(s.budget_enabled)
  const [totalStr, setTotalStr] = useState(s.budget_total ? String(s.budget_total) : '')
  const [includeCards, setIncludeCards] = useState(s.budget_include_cards)
  const [byCat, setByCat] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(s.budget_by_category).map(([k, v]) => [k, String(v)])),
  )
  const majors = majorCategories(data, 'expense')
  return (
    <Sheet title="预算设置" onClose={props.onClose}>
      <div className="card">
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 15, fontWeight: 600 }}>
          启用预算
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 20, height: 20 }} />
        </label>
      </div>
      {enabled && (
        <>
          <div className="field">
            <label>每月总预算（建议先设 11000–12000 渐进）</label>
            <input className="num" type="text" inputMode="decimal" placeholder="如 12000" value={totalStr} onChange={(e) => setTotalStr(e.target.value)} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, margin: '0 2px 12px' }}>
            <input type="checkbox" checked={includeCards} onChange={(e) => setIncludeCards(e.target.checked)} style={{ width: 18, height: 18 }} />
            预算算「真实花销」（含办卡大额）；不勾则按「消费水平」
          </label>
          <div className="card">
            <div className="card-title"><span>分大类预算（选填）</span></div>
            {majors.map((c) => (
              <div className="consume-row" key={c.key}>
                <span>{c.emoji} {c.label}</span>
                <input
                  className="num"
                  type="text"
                  inputMode="decimal"
                  placeholder="不限"
                  value={byCat[c.key] ?? ''}
                  onChange={(e) => setByCat({ ...byCat, [c.key]: e.target.value })}
                  style={{ width: 100, border: '1px solid var(--line)', borderRadius: 9, padding: '6px 9px', textAlign: 'right', background: '#fff' }}
                />
              </div>
            ))}
          </div>
        </>
      )}
      <button
        className="btn"
        onClick={() => {
          const total = parseAmount(totalStr)
          const byCatNum: Record<string, number> = {}
          for (const [k, v] of Object.entries(byCat)) {
            const n = parseAmount(v)
            if (Number.isFinite(n) && n > 0) byCatNum[k] = n
          }
          updateSettings({
            budget_enabled: enabled,
            budget_total: Number.isFinite(total) && total > 0 ? total : null,
            budget_include_cards: includeCards,
            budget_by_category: byCatNum,
          })
          showToast('预算已保存')
          props.onClose()
        }}
      >
        保存
      </button>
    </Sheet>
  )
}

function FxSheet(props: { onClose: () => void }) {
  const { data } = useStore()
  const [rates, setRates] = useState<Record<string, string>>(
    Object.fromEntries(CURRENCIES.filter((c) => c !== 'CNY').map((c) => [c, String(data.settings.fx_rates[c] ?? '')])),
  )
  return (
    <Sheet title="默认汇率（1 外币 = ? CNY）" onClose={props.onClose}>
      {CURRENCIES.filter((c) => c !== 'CNY').map((c) => (
        <div className="consume-row" key={c}>
          <span>{c}</span>
          <input
            className="num"
            type="text"
            inputMode="decimal"
            value={rates[c]}
            onChange={(e) => setRates({ ...rates, [c]: e.target.value })}
            style={{ width: 110, border: '1px solid var(--line)', borderRadius: 9, padding: '6px 9px', textAlign: 'right', background: '#fff' }}
          />
        </div>
      ))}
      <button
        className="btn"
        style={{ marginTop: 10 }}
        onClick={() => {
          const next: Record<string, number> = { ...data.settings.fx_rates }
          for (const [k, v] of Object.entries(rates)) {
            const n = parseAmount(v)
            if (Number.isFinite(n) && n > 0) next[k] = n
          }
          updateSettings({ fx_rates: next })
          showToast('汇率已更新')
          props.onClose()
        }}
      >
        保存
      </button>
    </Sheet>
  )
}

function CatsSheet(props: { onClose: () => void }) {
  const { data } = useStore()
  const [editing, setEditing] = useState<Category | null>(null)
  const [adding, setAdding] = useState<{ parent: string | null; type: 'expense' | 'income' } | null>(null)
  const majors = [...majorCategories(data, 'expense'), ...majorCategories(data, 'income')]
  return (
    <Sheet title="分类管理" onClose={props.onClose}>
      {majors.map((m) => (
        <div className="card" key={m.key}>
          <div className="row-line" style={{ borderBottom: subCategories(data, m.key).length ? undefined : 'none' }}>
            <span>{m.emoji} {m.label} <span className="rl-sub">{m.type === 'income' ? '收入' : '支出'}大类</span></span>
            <span style={{ display: 'flex', gap: 12 }}>
              <button className="link-btn" onClick={() => setAdding({ parent: m.key, type: m.type })}>＋小类</button>
              <button className="link-btn" onClick={() => setEditing(m)}>编辑</button>
            </span>
          </div>
          {subCategories(data, m.key).map((sc) => (
            <div className="row-line" key={sc.key}>
              <span style={{ paddingLeft: 12 }}>{sc.emoji} {sc.label}</span>
              <button className="link-btn" onClick={() => setEditing(sc)}>编辑</button>
            </div>
          ))}
        </div>
      ))}
      <div className="btn-row">
        <button className="btn ghost" onClick={() => setAdding({ parent: null, type: 'expense' })}>＋支出大类</button>
        <button className="btn ghost" onClick={() => setAdding({ parent: null, type: 'income' })}>＋收入大类</button>
      </div>
      {editing && <CatEditSheet cat={editing} onClose={() => setEditing(null)} />}
      {adding && <CatEditSheet parent={adding.parent} type={adding.type} onClose={() => setAdding(null)} />}
    </Sheet>
  )
}

function CatEditSheet(props: { cat?: Category; parent?: string | null; type?: 'expense' | 'income'; onClose: () => void }) {
  const { data } = useStore()
  const c = props.cat
  const [label, setLabel] = useState(c?.label ?? '')
  const [emoji, setEmoji] = useState(c?.emoji ?? '📦')
  const [sortStr, setSortStr] = useState(String(c?.sort ?? 500))
  return (
    <Sheet title={c ? `编辑 ${c.label}` : '新建分类'} onClose={props.onClose}>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <div className="field" style={{ flex: 2, marginBottom: 0 }}>
          <label>名称</label>
          <input type="text" maxLength={6} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>emoji</label>
          <input type="text" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>排序（小的在前）</label>
        <input className="num" type="text" inputMode="numeric" value={sortStr} onChange={(e) => setSortStr(e.target.value)} />
      </div>
      <button
        className="btn"
        disabled={!label.trim()}
        onClick={() => {
          const sort = parseAmount(sortStr)
          upsertCategory({
            key: c?.key ?? `custom_${uid().slice(0, 8)}`,
            parent_key: c ? c.parent_key : props.parent ?? null,
            label: label.trim(),
            emoji: emoji.trim() || '📦',
            type: c?.type ?? props.type ?? 'expense',
            sort: Number.isFinite(sort) ? sort : 500,
            active: true,
            updated_at: '',
          })
          showToast('已保存')
          props.onClose()
        }}
      >
        保存
      </button>
      {c && (
        <button
          className="btn danger-ghost"
          style={{ marginTop: 8 }}
          onClick={() => {
            deleteCategory(c.key)
            showToast(
              data.transactions.some((t) => t.category === c.key || t.subcategory === c.key)
                ? '该分类有历史记录，已停用（历史仍可读）'
                : '已删除',
            )
            props.onClose()
          }}
        >
          删除 / 停用
        </button>
      )}
    </Sheet>
  )
}

function TripsSheet(props: { onClose: () => void }) {
  const { data } = useStore()
  const activeId = data.settings.active_trip_id
  return (
    <Sheet title="旅行管理" onClose={props.onClose}>
      {data.trips.length === 0 && <div className="empty">还没有旅行。记账页点「✈️ 旅行」创建</div>}
      {data.trips.map((t) => (
        <div className="card" key={t.id}>
          <div className="row-line" style={{ borderBottom: 'none' }}>
            <span>✈️ {t.name}{t.id === activeId && <span className="badge" style={{ marginLeft: 6 }}>进行中</span>}</span>
            <span style={{ display: 'flex', gap: 12 }}>
              {t.id === activeId ? (
                <button className="link-btn" onClick={() => { setActiveTrip(null); showToast('旅行模式已结束') }}>结束</button>
              ) : (
                <button className="link-btn" onClick={() => { setActiveTrip(t.id); showToast(`旅行模式：${t.name}`) }}>设为进行中</button>
              )}
              <button
                className="link-btn"
                onClick={() => {
                  const name = window.prompt('修改旅行名', t.name)
                  if (name?.trim()) updateTrip(t.id, { name: name.trim() })
                }}
              >
                改名
              </button>
              <button
                className="link-btn danger-txt"
                onClick={() => {
                  if (window.confirm(`删除「${t.name}」？相关账目会保留但摘掉标签`)) {
                    deleteTrip(t.id)
                    showToast('已删除旅行')
                  }
                }}
              >
                删除
              </button>
            </span>
          </div>
        </div>
      ))}
    </Sheet>
  )
}

function AyiSheet(props: { onClose: () => void }) {
  const { data } = useStore()
  const [v, setV] = useState(String(data.settings.ayi_fixed))
  const n = parseAmount(v)
  return (
    <Sheet title="阿姨月费固定金额" onClose={props.onClose}>
      <div className="field">
        <label>每月固定家政费（差额自动归买菜）</label>
        <input className="num" type="text" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} />
      </div>
      <button
        className="btn"
        disabled={!Number.isFinite(n) || n <= 0}
        onClick={() => {
          updateSettings({ ayi_fixed: round2(n) })
          showToast('已更新')
          props.onClose()
        }}
      >
        保存
      </button>
    </Sheet>
  )
}
