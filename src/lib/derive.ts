import type { AppData, Card, CardUsage, Savings, SavingsMove, Transaction } from '../types'
import { CAT_CARDS } from '../data/categories'
import { monthKey, round2 } from './utils'

export function txInMonth(data: AppData, mk: string): Transaction[] {
  return data.transactions.filter((t) => monthKey(t.date) === mk)
}

export interface MonthSummary {
  expense: number
  income: number
  balance: number
}

/** 月度汇总；includeCards=false 时剔除大类=充值卡的支出（口径开关） */
export function monthSummary(data: AppData, mk: string, includeCards: boolean): MonthSummary {
  let expense = 0
  let income = 0
  for (const t of txInMonth(data, mk)) {
    if (t.type === 'income') income += t.amount_cny
    else if (includeCards || !t.is_card_purchase) expense += t.amount_cny
  }
  // 消费水平口径：并入本月划卡的折算价值（按摩用 1 次、画画用 1 次…）
  if (!includeCards) expense += cardUsageInMonth(data, mk).total
  return { expense: round2(expense), income: round2(income), balance: round2(income - expense) }
}

export interface CatStat {
  key: string
  amount: number
  count: number
  pct: number
}

/** 大类排行（支出）。传 parentKey 则下钻该大类的小类分布（无小类的归 '_none'）。 */
export function categoryBreakdown(data: AppData, mk: string, includeCards: boolean, parentKey?: string): CatStat[] {
  const map = new Map<string, { amount: number; count: number }>()
  let total = 0
  for (const t of txInMonth(data, mk)) {
    if (t.type !== 'expense') continue
    if (!includeCards && t.is_card_purchase) continue
    if (parentKey) {
      if (t.category !== parentKey) continue
      const k = t.subcategory ?? '_none'
      const e = map.get(k) ?? { amount: 0, count: 0 }
      e.amount += t.amount_cny
      e.count += 1
      map.set(k, e)
      total += t.amount_cny
    } else {
      const e = map.get(t.category) ?? { amount: 0, count: 0 }
      e.amount += t.amount_cny
      e.count += 1
      map.set(t.category, e)
      total += t.amount_cny
    }
  }
  // 消费水平口径：把本月划卡的折算价值按“卡所属分类”并入分类占比
  if (!includeCards) {
    for (const u of data.card_usages) {
      if (monthKey(u.used_at) !== mk) continue
      const card = data.cards.find((c) => c.id === u.card_id)
      if (!card) continue
      const cardCat = card.category ?? 'other'
      if (parentKey) {
        if (cardCat !== parentKey) continue
        const k = card.subcategory ?? '_none'
        const e = map.get(k) ?? { amount: 0, count: 0 }
        e.amount += u.equivalent_cny
        e.count += 1
        map.set(k, e)
        total += u.equivalent_cny
      } else {
        const e = map.get(cardCat) ?? { amount: 0, count: 0 }
        e.amount += u.equivalent_cny
        e.count += 1
        map.set(cardCat, e)
        total += u.equivalent_cny
      }
    }
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, amount: round2(v.amount), count: v.count, pct: total > 0 ? v.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

export interface CardMonthUsage {
  card: Card
  times: number
  amountUsed: number
  equivalent: number
}

/** 本月卡消耗汇总（含已归档卡当月的消耗） */
export function cardUsageInMonth(data: AppData, mk: string): { rows: CardMonthUsage[]; total: number } {
  const byCard = new Map<string, { times: number; amountUsed: number; equivalent: number }>()
  for (const u of data.card_usages) {
    if (monthKey(u.used_at) !== mk) continue
    const e = byCard.get(u.card_id) ?? { times: 0, amountUsed: 0, equivalent: 0 }
    e.times += u.count_used
    e.amountUsed += u.amount_used
    e.equivalent += u.equivalent_cny
    byCard.set(u.card_id, e)
  }
  const rows: CardMonthUsage[] = []
  let total = 0
  for (const [cardId, v] of byCard) {
    const card = data.cards.find((c) => c.id === cardId)
    if (!card) continue
    rows.push({ card, times: v.times, amountUsed: round2(v.amountUsed), equivalent: round2(v.equivalent) })
    total += v.equivalent
  }
  rows.sort((a, b) => b.equivalent - a.equivalent)
  return { rows, total: round2(total) }
}

export interface TripSummary {
  tripId: string
  name: string
  total: number
  count: number
  byCategory: { key: string; amount: number }[]
}

export function tripSummaries(data: AppData): TripSummary[] {
  const res: TripSummary[] = []
  for (const trip of data.trips) {
    const txs = data.transactions.filter((t) => t.trip_id === trip.id && t.type === 'expense')
    const byCat = new Map<string, number>()
    let total = 0
    for (const t of txs) {
      byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount_cny)
      total += t.amount_cny
    }
    res.push({
      tripId: trip.id,
      name: trip.name,
      total: round2(total),
      count: txs.length,
      byCategory: [...byCat.entries()].map(([key, amount]) => ({ key, amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
    })
  }
  return res.sort((a, b) => b.total - a.total)
}

// ---------------- 存钱卡 ----------------

/** 当前余额 = 起始 + 存入 − 取出 − 未收回的借出（已收回的借出进出相抵为 0） */
export function savingsBalance(sv: Savings | null): number {
  if (!sv) return 0
  let bal = sv.opening
  for (const m of sv.moves) {
    if (m.type === 'in') bal += m.amount
    else if (m.type === 'out') bal -= m.amount
    else if (m.type === 'loan' && !m.repaid) bal -= m.amount
  }
  return round2(bal)
}

export interface SavingsYear {
  deposit: number // 今年存入
  withdraw: number // 今年取出（消费/挪钱）
  net: number // 今年净存 = 存入 − 取出
  income: number // 今年赚（记账里的收入）
}

/** 年度赚/存看板（year 传四位年份数字） */
export function savingsYear(data: AppData, year: number): SavingsYear {
  const y = String(year)
  let deposit = 0
  let withdraw = 0
  for (const m of data.savings?.moves ?? []) {
    if (m.date.slice(0, 4) !== y) continue
    if (m.type === 'in') deposit += m.amount
    else if (m.type === 'out') withdraw += m.amount
  }
  let income = 0
  for (const t of data.transactions) {
    if (t.type === 'income' && t.date.slice(0, 4) === y) income += t.amount_cny
  }
  return { deposit: round2(deposit), withdraw: round2(withdraw), net: round2(deposit - withdraw), income: round2(income) }
}

/** 未收回的借出（按日期新→旧） */
export function outstandingLoans(sv: Savings | null): SavingsMove[] {
  return (sv?.moves ?? [])
    .filter((m) => m.type === 'loan' && !m.repaid)
    .sort((a, b) => b.date.localeCompare(a.date))
}

export interface FundStatus {
  net: number // 每月净变化
  monthsLeft: number | null // 负时可撑月数
  runOutLabel: string | null // 预计需补足的年月
  warn: boolean // 是否该提醒（提前2个月）
}

export function housingFundStatus(data: AppData): FundStatus | null {
  const hf = data.housing_fund
  if (!hf) return null
  const net = round2(hf.monthly_deposit - hf.loan_a - hf.loan_b)
  if (net >= 0) return { net, monthsLeft: null, runOutLabel: null, warn: false }
  const months = Math.floor(hf.balance / -net)
  const base = new Date(hf.updated_at)
  const runOut = new Date(base.getFullYear(), base.getMonth() + months, 1)
  const now = new Date()
  const monthsFromNow = (runOut.getFullYear() - now.getFullYear()) * 12 + (runOut.getMonth() - now.getMonth())
  return {
    net,
    monthsLeft: months,
    runOutLabel: `${runOut.getFullYear()}年${runOut.getMonth() + 1}月`,
    warn: monthsFromNow <= 2,
  }
}

/** 卡余量状态：low=剩≤3次或≤15%；expiring=≤30天到期 */
export function cardWarnState(card: Card): { low: boolean; expiring: boolean } {
  let low = false
  if (card.kind === 'count') low = (card.remaining_count ?? 0) <= 3
  else if (card.balance && card.balance > 0) low = (card.remaining_balance ?? 0) / card.balance <= 0.15
  let expiring = false
  if (card.expire_date) {
    const days = (new Date(card.expire_date).getTime() - Date.now()) / 86400000
    expiring = days <= 30
  }
  return { low, expiring }
}

export function cardUnitPrice(card: Card): number {
  if (card.kind !== 'count' || !card.total_count) return 0
  return round2((card.total_price ?? 0) / card.total_count)
}

/** 同卡系累计：期数 + 累计投入 */
export function seriesStats(data: AppData, card: Card): { period: number; totalInvested: number; count: number } {
  const sameSeries = data.cards
    .filter((c) => c.series_id === card.series_id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const idx = sameSeries.findIndex((c) => c.id === card.id)
  const invested = sameSeries.reduce((s, c) => s + (c.kind === 'count' ? (c.total_price ?? 0) : (c.balance ?? 0)), 0)
  return { period: idx + 1, totalInvested: round2(invested), count: sameSeries.length }
}

export function usagesOfCard(data: AppData, cardId: string): CardUsage[] {
  return data.card_usages
    .filter((u) => u.card_id === cardId)
    .sort((a, b) => b.used_at.localeCompare(a.used_at) || b.created_at.localeCompare(a.created_at))
}
