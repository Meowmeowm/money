import { useSyncExternalStore } from 'react'
import type {
  AppData, Card, CardUsage, Category, HousingFund, Insurance, InsuranceKind,
  Savings, SavingsMove, SavingsMoveType,
  Settings, Template, TemplateConfig, Transaction, Trip, TxType,
} from './types'
import { defaultData, enqueue, flushQueue, loadLocal, pullAll, pushAllIfCloudEmpty, queueLength, saveLocal } from './lib/db'
import { supabase, isCloudConfigured } from './lib/supabase'
import { nowIso, round2, todayStr, uid } from './lib/utils'
import { CAT_CARDS } from './data/categories'

export type AuthState = 'loading' | 'signedOut' | 'ready' // ready = 已登录 或 本地模式
export type SyncState = 'idle' | 'syncing' | 'offline'

export interface StoreState {
  data: AppData
  auth: AuthState
  sync: SyncState
  pending: number
  toast: { text: string; key: number } | null
}

let state: StoreState = {
  data: defaultData(),
  auth: 'loading',
  sync: 'idle',
  pending: 0,
  toast: null,
}

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function set(patch: Partial<StoreState>) {
  state = { ...state, ...patch }
  emit()
}

function setData(mutate: (d: AppData) => AppData) {
  const data = mutate(state.data)
  saveLocal(data)
  set({ data, pending: queueLength() })
  scheduleFlush()
}

export function useStore(): StoreState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

// ---------------- toast ----------------

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function showToast(text: string) {
  clearTimeout(toastTimer)
  set({ toast: { text, key: Date.now() } })
  toastTimer = setTimeout(() => set({ toast: null }), 1800)
}

// ---------------- 同步 ----------------

let flushTimer: ReturnType<typeof setTimeout> | undefined
function scheduleFlush(delay = 700) {
  if (!isCloudConfigured) return
  clearTimeout(flushTimer)
  flushTimer = setTimeout(() => void doFlush(), delay)
}

async function doFlush() {
  if (!isCloudConfigured) return
  if (!navigator.onLine) {
    set({ sync: 'offline', pending: queueLength() })
    return
  }
  set({ sync: 'syncing' })
  const ok = await flushQueue()
  set({ sync: ok ? 'idle' : navigator.onLine ? 'idle' : 'offline', pending: queueLength() })
  if (!ok && queueLength() > 0) scheduleFlush(15000) // 稍后重试
}

export async function initStore() {
  const data = loadLocal()
  set({ data, pending: queueLength() })
  if (!isCloudConfigured) {
    set({ auth: 'ready' })
    return
  }
  const { data: sess } = await supabase!.auth.getSession()
  if (!sess.session) {
    set({ auth: 'signedOut' })
    return
  }
  set({ auth: 'ready' })
  void refreshFromCloud()
  window.addEventListener('online', () => void doFlush())
}

/** 登录后 / 启动时：先推本地队列，队列清空后拉云端全量替换本地 */
export async function refreshFromCloud() {
  if (!isCloudConfigured || !navigator.onLine) return
  set({ sync: 'syncing' })
  await pushAllIfCloudEmpty(state.data)
  const ok = await flushQueue()
  if (ok && queueLength() === 0) {
    const remote = await pullAll()
    if (remote && queueLength() === 0) {
      saveLocal(remote)
      set({ data: remote })
    }
  }
  set({ sync: 'idle', pending: queueLength() })
}

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return '未配置云端'
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return error.message
  set({ auth: 'ready' })
  void refreshFromCloud()
  window.addEventListener('online', () => void doFlush())
  return null
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut()
  set({ auth: 'signedOut' })
}

// ---------------- 记账 ----------------

export interface NewTxInput {
  type: TxType
  amountCny: number
  originalAmount?: number | null
  currency?: string
  fxRate?: number | null
  category: string
  subcategory?: string | null
  note?: string
  date?: string
  tripId?: string | null
  isCardPurchase?: boolean
  fromSavings?: boolean // 从存钱卡付：照记花销，并自动在存钱卡记一笔取出
  templateId?: string | null
}

export function addTransaction(input: NewTxInput): Transaction {
  const t: Transaction = {
    id: uid(),
    date: input.date ?? todayStr(),
    type: input.type,
    amount_cny: round2(input.amountCny),
    original_amount: input.originalAmount ?? null,
    currency: input.currency ?? 'CNY',
    fx_rate: input.fxRate ?? null,
    category: input.category,
    subcategory: input.subcategory ?? null,
    note: (input.note ?? '').slice(0, 20),
    trip_id: input.tripId ?? null,
    refund_status: 'none',
    refund_amount: 0,
    is_card_purchase: input.isCardPurchase ?? false,
    template_id: input.templateId ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  setData((d) => ({ ...d, transactions: [t, ...d.transactions] }))
  enqueue('transactions', 'upsert', t.id, t as never)
  scheduleFlush()
  // 从存钱卡付：同步在存钱卡记一笔取出（消费类，进净存扣减）
  if (input.fromSavings && t.type === 'expense' && t.amount_cny > 0) {
    addSavingsMove({ type: 'out', amount: t.amount_cny, date: t.date, note: t.note || '存钱卡消费' })
  }
  return t
}

export function updateTransaction(id: string, patch: Partial<Transaction>) {
  let updated: Transaction | undefined
  setData((d) => ({
    ...d,
    transactions: d.transactions.map((t) => {
      if (t.id !== id) return t
      updated = { ...t, ...patch, updated_at: nowIso() }
      return updated
    }),
  }))
  if (updated) enqueue('transactions', 'upsert', id, updated as never)
  scheduleFlush()
}

export function deleteTransaction(id: string) {
  setData((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) }))
  enqueue('transactions', 'delete', id)
  scheduleFlush()
}

/** 退款：整笔=净额清零；部分=净额减去退款额。不产生收入记录。 */
export function markRefund(id: string, kind: 'full' | 'partial' | 'none', refundAmount = 0) {
  const t = state.data.transactions.find((x) => x.id === id)
  if (!t) return
  const gross = round2(t.amount_cny + t.refund_amount) // 原始总额
  if (kind === 'none') {
    updateTransaction(id, { refund_status: 'none', refund_amount: 0, amount_cny: gross })
  } else if (kind === 'full') {
    updateTransaction(id, { refund_status: 'full', refund_amount: gross, amount_cny: 0 })
  } else {
    const r = round2(Math.min(Math.max(refundAmount, 0), gross))
    updateTransaction(id, { refund_status: r >= gross ? 'full' : 'partial', refund_amount: r, amount_cny: round2(gross - r) })
  }
}

// ---------------- 充值卡 ----------------

export interface NewCardInput {
  name: string
  category?: string | null
  subcategory?: string | null
  kind: 'count' | 'balance'
  totalPrice?: number
  totalCount?: number
  balance?: number
  expireDate?: string | null
  seriesId?: string // 续卡时传入
}

export function addCard(input: NewCardInput): Card {
  const c: Card = {
    id: uid(),
    name: input.name,
    category: input.category ?? null,
    subcategory: input.subcategory ?? null,
    kind: input.kind,
    total_price: input.kind === 'count' ? round2(input.totalPrice ?? 0) : null,
    total_count: input.kind === 'count' ? Math.max(1, Math.round(input.totalCount ?? 1)) : null,
    balance: input.kind === 'balance' ? round2(input.balance ?? 0) : null,
    remaining_count: input.kind === 'count' ? Math.max(1, Math.round(input.totalCount ?? 1)) : null,
    remaining_balance: input.kind === 'balance' ? round2(input.balance ?? 0) : null,
    expire_date: input.expireDate ?? null,
    series_id: input.seriesId ?? uid(),
    status: 'active',
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  setData((d) => ({ ...d, cards: [c, ...d.cards] }))
  enqueue('cards', 'upsert', c.id, c as never)
  scheduleFlush()
  return c
}

export function updateCard(id: string, patch: Partial<Card>) {
  let updated: Card | undefined
  setData((d) => ({
    ...d,
    cards: d.cards.map((c) => {
      if (c.id !== id) return c
      updated = { ...c, ...patch, updated_at: nowIso() }
      return updated
    }),
  }))
  if (updated) enqueue('cards', 'upsert', id, updated as never)
  scheduleFlush()
}

export function deleteCard(id: string) {
  const usageIds = state.data.card_usages.filter((u) => u.card_id === id).map((u) => u.id)
  setData((d) => ({
    ...d,
    cards: d.cards.filter((c) => c.id !== id),
    card_usages: d.card_usages.filter((u) => u.card_id !== id),
  }))
  for (const uidToDel of usageIds) enqueue('card_usages', 'delete', uidToDel)
  enqueue('cards', 'delete', id)
  scheduleFlush()
}

/** 划卡：次卡扣次数 / 金额卡扣金额。折合金额只进统计，不进现金支出。 */
export function useCard(cardId: string, opts: { count?: number; amount?: number; date?: string }): CardUsage | null {
  const card = state.data.cards.find((c) => c.id === cardId)
  if (!card) return null
  let usage: CardUsage
  let cardPatch: Partial<Card>
  if (card.kind === 'count') {
    const n = Math.max(1, Math.round(opts.count ?? 1))
    const unit = card.total_count ? (card.total_price ?? 0) / card.total_count : 0
    usage = {
      id: uid(), card_id: cardId, used_at: opts.date ?? todayStr(),
      count_used: n, amount_used: 0, equivalent_cny: round2(unit * n),
      created_at: nowIso(), updated_at: nowIso(),
    }
    const remaining = Math.max(0, (card.remaining_count ?? 0) - n)
    cardPatch = { remaining_count: remaining, status: remaining === 0 ? 'archived' : card.status }
  } else {
    const amt = round2(Math.max(0, opts.amount ?? 0))
    usage = {
      id: uid(), card_id: cardId, used_at: opts.date ?? todayStr(),
      count_used: 0, amount_used: amt, equivalent_cny: amt,
      created_at: nowIso(), updated_at: nowIso(),
    }
    const remaining = round2(Math.max(0, (card.remaining_balance ?? 0) - amt))
    cardPatch = { remaining_balance: remaining, status: remaining <= 0 ? 'archived' : card.status }
  }
  setData((d) => ({ ...d, card_usages: [usage, ...d.card_usages] }))
  enqueue('card_usages', 'upsert', usage.id, usage as never)
  updateCard(cardId, cardPatch)
  return usage
}

/** 撤销一次划卡（把次数/金额还回去） */
export function deleteUsage(usageId: string) {
  const u = state.data.card_usages.find((x) => x.id === usageId)
  if (!u) return
  const card = state.data.cards.find((c) => c.id === u.card_id)
  setData((d) => ({ ...d, card_usages: d.card_usages.filter((x) => x.id !== usageId) }))
  enqueue('card_usages', 'delete', usageId)
  if (card) {
    if (card.kind === 'count') {
      updateCard(card.id, { remaining_count: (card.remaining_count ?? 0) + u.count_used, status: 'active' })
    } else {
      updateCard(card.id, { remaining_balance: round2((card.remaining_balance ?? 0) + u.amount_used), status: 'active' })
    }
  }
  scheduleFlush()
}

/** 续卡：同卡系新开一张，旧卡归档 */
export function renewCard(oldCardId: string, input: NewCardInput): Card | null {
  const old = state.data.cards.find((c) => c.id === oldCardId)
  if (!old) return null
  if (old.status === 'active') updateCard(old.id, { status: 'archived' })
  return addCard({ ...input, seriesId: old.series_id })
}

// ---------------- 旅行 ----------------

export function addTrip(name: string, activate: boolean): Trip {
  const t: Trip = { id: uid(), name, active: activate, created_at: nowIso(), updated_at: nowIso() }
  setData((d) => ({ ...d, trips: [t, ...d.trips] }))
  enqueue('trips', 'upsert', t.id, t as never)
  if (activate) setActiveTrip(t.id)
  scheduleFlush()
  return t
}

export function setActiveTrip(tripId: string | null) {
  updateSettings({ active_trip_id: tripId })
}

export function updateTrip(id: string, patch: Partial<Trip>) {
  let updated: Trip | undefined
  setData((d) => ({
    ...d,
    trips: d.trips.map((t) => {
      if (t.id !== id) return t
      updated = { ...t, ...patch, updated_at: nowIso() }
      return updated
    }),
  }))
  if (updated) enqueue('trips', 'upsert', id, updated as never)
  scheduleFlush()
}

export function deleteTrip(id: string) {
  // 解除所有交易的该标签
  const affected = state.data.transactions.filter((t) => t.trip_id === id)
  setData((d) => ({
    ...d,
    trips: d.trips.filter((t) => t.id !== id),
    transactions: d.transactions.map((t) => (t.trip_id === id ? { ...t, trip_id: null, updated_at: nowIso() } : t)),
    settings: d.settings.active_trip_id === id ? { ...d.settings, active_trip_id: null, updated_at: nowIso() } : d.settings,
  }))
  for (const t of affected) {
    const row = state.data.transactions.find((x) => x.id === t.id)
    if (row) enqueue('transactions', 'upsert', row.id, row as never)
  }
  enqueue('trips', 'delete', id)
  enqueue('kv', 'upsert', 'settings', { key: 'settings', value: state.data.settings })
  scheduleFlush()
}

// ---------------- 模板 ----------------

export function addTemplate(name: string, config: TemplateConfig): Template {
  const t: Template = { id: uid(), name, config, created_at: nowIso(), updated_at: nowIso() }
  setData((d) => ({ ...d, templates: [t, ...d.templates] }))
  enqueue('templates', 'upsert', t.id, t as never)
  scheduleFlush()
  return t
}

export function updateTemplate(id: string, patch: Partial<Template>) {
  let updated: Template | undefined
  setData((d) => ({
    ...d,
    templates: d.templates.map((t) => {
      if (t.id !== id) return t
      updated = { ...t, ...patch, updated_at: nowIso() }
      return updated
    }),
  }))
  if (updated) enqueue('templates', 'upsert', id, updated as never)
  scheduleFlush()
}

export function deleteTemplate(id: string) {
  setData((d) => ({ ...d, templates: d.templates.filter((t) => t.id !== id) }))
  enqueue('templates', 'delete', id)
  scheduleFlush()
}

/** 阿姨月费：总额拆两笔（固定家政 + 差额买菜） */
export function applyAyiTemplate(total: number, date?: string): void {
  const fixed = state.data.settings.ayi_fixed
  const fixedAmt = round2(Math.min(total, fixed))
  const diff = round2(total - fixedAmt)
  addTransaction({
    type: 'expense', amountCny: fixedAmt, category: 'living', subcategory: 'living_ayi', note: '阿姨月费', date,
  })
  if (diff > 0) {
    addTransaction({
      type: 'expense', amountCny: diff, category: 'food', subcategory: 'food_grocery', note: '阿姨代买菜', date,
    })
  }
}

// ---------------- 设置 / 公积金 / 分类 ----------------

export function updateSettings(patch: Partial<Settings>) {
  setData((d) => ({ ...d, settings: { ...d.settings, ...patch, updated_at: nowIso() } }))
  enqueue('kv', 'upsert', 'settings', { key: 'settings', value: state.data.settings })
  scheduleFlush()
}

export function setHousingFund(hf: HousingFund | null) {
  setData((d) => ({ ...d, housing_fund: hf }))
  if (hf) enqueue('kv', 'upsert', 'housing_fund', { key: 'housing_fund', value: hf })
  else enqueue('kv', 'delete', 'housing_fund')
  scheduleFlush()
}

// ---------------- 存钱卡 ----------------

function persistSavings(sv: Savings | null) {
  if (sv) enqueue('kv', 'upsert', 'savings', { key: 'savings', value: sv })
  else enqueue('kv', 'delete', 'savings')
  scheduleFlush()
}

/** 建账 / 校准起始余额 */
export function setSavingsOpening(opening: number) {
  let next: Savings
  setData((d) => {
    next = { opening: round2(opening), moves: d.savings?.moves ?? [] }
    return { ...d, savings: next }
  })
  persistSavings(next!)
}

export interface NewMoveInput {
  type: SavingsMoveType
  amount: number
  date?: string
  note?: string
  borrower?: string
}

export function addSavingsMove(input: NewMoveInput): SavingsMove {
  const m: SavingsMove = {
    id: uid(),
    date: input.date ?? todayStr(),
    type: input.type,
    amount: round2(input.amount),
    note: input.note ?? '',
    borrower: input.type === 'loan' ? (input.borrower ?? '').trim() || null : null,
    repaid: false,
    repaid_date: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  let next: Savings
  setData((d) => {
    const base: Savings = d.savings ?? { opening: 0, moves: [] }
    next = { ...base, moves: [m, ...base.moves] }
    return { ...d, savings: next }
  })
  persistSavings(next!)
  return m
}

export function updateSavingsMove(id: string, patch: Partial<SavingsMove>) {
  let next: Savings | null = null
  setData((d) => {
    if (!d.savings) return d
    next = {
      ...d.savings,
      moves: d.savings.moves.map((m) => (m.id === id ? { ...m, ...patch, updated_at: nowIso() } : m)),
    }
    return { ...d, savings: next }
  })
  if (next) persistSavings(next)
}

export function deleteSavingsMove(id: string) {
  let next: Savings | null = null
  setData((d) => {
    if (!d.savings) return d
    next = { ...d.savings, moves: d.savings.moves.filter((m) => m.id !== id) }
    return { ...d, savings: next }
  })
  if (next) persistSavings(next)
}

/** 借款收回 / 撤销收回：不改余额逻辑，仅切标记（未收回的借出才占用余额） */
export function setLoanRepaid(id: string, repaid: boolean) {
  updateSavingsMove(id, { repaid, repaid_date: repaid ? todayStr() : null })
}

// ---------------- 保险 ----------------

function persistInsurances() {
  const list = state.data.insurances
  if (list.length > 0) enqueue('kv', 'upsert', 'insurances', { key: 'insurances', value: list })
  else enqueue('kv', 'delete', 'insurances')
  scheduleFlush()
}

export interface NewInsuranceInput {
  name: string
  kind: InsuranceKind
  annual: number
  payMonth: number
  paidYear?: number | null // 若给定则为该年份留一条缴费记录（金额取 annual）
  note?: string
}

export function addInsurance(input: NewInsuranceInput): Insurance {
  const p: Insurance = {
    id: uid(),
    name: input.name.trim(),
    kind: input.kind,
    annual: round2(input.annual),
    pay_month: input.payMonth,
    payments: input.paidYear != null ? [{ year: input.paidYear, amount: round2(input.annual) }] : [],
    note: input.note ?? '',
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  setData((d) => ({ ...d, insurances: [...d.insurances, p] }))
  persistInsurances()
  return p
}

export function updateInsurance(id: string, patch: Partial<Insurance>) {
  setData((d) => ({
    ...d,
    insurances: d.insurances.map((p) => (p.id === id ? { ...p, ...patch, updated_at: nowIso() } : p)),
  }))
  persistInsurances()
}

/** 标记某年已缴（新增或更新该年记录，历史其它年份不动） */
export function setInsurancePayment(id: string, year: number, amount: number) {
  setData((d) => ({
    ...d,
    insurances: d.insurances.map((p) => {
      if (p.id !== id) return p
      const others = p.payments.filter((x) => x.year !== year)
      const payments = [...others, { year, amount: round2(amount) }].sort((a, b) => a.year - b.year)
      return { ...p, payments, updated_at: nowIso() }
    }),
  }))
  persistInsurances()
}

/** 撤销某年的缴费记录 */
export function removeInsurancePayment(id: string, year: number) {
  setData((d) => ({
    ...d,
    insurances: d.insurances.map((p) =>
      p.id === id ? { ...p, payments: p.payments.filter((x) => x.year !== year), updated_at: nowIso() } : p,
    ),
  }))
  persistInsurances()
}

export function deleteInsurance(id: string) {
  setData((d) => ({ ...d, insurances: d.insurances.filter((p) => p.id !== id) }))
  persistInsurances()
}

export function upsertCategory(cat: Category) {
  const next = { ...cat, updated_at: nowIso() }
  setData((d) => {
    const exists = d.categories.some((c) => c.key === cat.key)
    return {
      ...d,
      categories: exists ? d.categories.map((c) => (c.key === cat.key ? next : c)) : [...d.categories, next],
    }
  })
  enqueue('categories', 'upsert', cat.key, next as never)
  scheduleFlush()
}

export function deleteCategory(key: string) {
  const used = state.data.transactions.some((t) => t.category === key || t.subcategory === key)
  if (used) {
    // 有历史记录的分类只停用不删除，保历史可读
    const cat = state.data.categories.find((c) => c.key === key)
    if (cat) upsertCategory({ ...cat, active: false })
    return
  }
  setData((d) => ({ ...d, categories: d.categories.filter((c) => c.key !== key && c.parent_key !== key) }))
  enqueue('categories', 'delete', key)
  scheduleFlush()
}

// ---------------- 派生数据 helpers ----------------

export function isCardCategory(catKey: string): boolean {
  return catKey === CAT_CARDS
}
