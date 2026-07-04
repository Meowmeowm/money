import type { AppData, Settings, SyncOp, SyncTable } from '../types'
import { DEFAULT_CATEGORIES } from '../data/categories'
import { DEFAULT_FX_RATES } from './fx'
import { nowIso } from './utils'
import { supabase } from './supabase'

const STATE_KEY = 'mm.state.v1'
const QUEUE_KEY = 'mm.queue.v1'

export function defaultSettings(): Settings {
  return {
    budget_enabled: false,
    budget_include_cards: false,
    budget_total: null,
    budget_by_category: {},
    ayi_fixed: 1780,
    fx_rates: { ...DEFAULT_FX_RATES },
    active_trip_id: null,
    stats_include_cards: true,
    updated_at: nowIso(),
  }
}

export function defaultData(): AppData {
  return {
    transactions: [],
    cards: [],
    card_usages: [],
    trips: [],
    templates: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    housing_fund: null,
    settings: defaultSettings(),
  }
}

export function loadLocal(): AppData {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (!raw) return defaultData()
    const parsed = JSON.parse(raw) as Partial<AppData>
    const base = defaultData()
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      categories: parsed.categories && parsed.categories.length > 0 ? parsed.categories : base.categories,
    }
  } catch {
    return defaultData()
  }
}

export function saveLocal(data: AppData): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(data))
  } catch {
    // 存储满等极端情况：静默，云端仍有队列
  }
}

// ---------------- 同步队列 ----------------

function loadQueue(): SyncOp[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as SyncOp[]
  } catch {
    return []
  }
}

function saveQueue(q: SyncOp[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
  } catch {
    /* ignore */
  }
}

let seqCounter = Date.now()

export function enqueue(table: SyncTable, op: 'upsert' | 'delete', id: string, row?: Record<string, unknown>): void {
  if (!supabase) return // 纯本地模式无需队列
  const q = loadQueue()
  // 同一行的旧 upsert 被新 upsert 覆盖；delete 清掉之前的 upsert
  const filtered = q.filter((o) => !(o.table === table && o.id === id))
  filtered.push({ seq: seqCounter++, table, op, id, row })
  saveQueue(filtered)
}

export function queueLength(): number {
  return loadQueue().length
}

const PK: Record<SyncTable, string> = {
  transactions: 'id',
  cards: 'id',
  card_usages: 'id',
  trips: 'id',
  templates: 'id',
  categories: 'key',
  kv: 'key',
}

let flushing = false

/** 把队列推到 Supabase；返回是否全部成功。网络失败保留队列，数据错误丢弃该条避免卡死。 */
export async function flushQueue(): Promise<boolean> {
  if (!supabase || flushing) return false
  const { data: sess } = await supabase.auth.getSession()
  if (!sess.session) return false
  flushing = true
  try {
    let q = loadQueue()
    while (q.length > 0) {
      const op = q[0]
      try {
        if (op.op === 'upsert' && op.row) {
          const { error } = await supabase.from(op.table).upsert(op.row, { onConflict: PK[op.table] })
          if (error) {
            // 4xx 数据类错误丢弃该条，其余（网络/5xx）保留稍后重试
            if (isDataError(error.code)) console.warn('sync drop', op.table, op.id, error.message)
            else return false
          }
        } else if (op.op === 'delete') {
          const { error } = await supabase.from(op.table).delete().eq(PK[op.table], op.id)
          if (error && !isDataError(error.code)) return false
        }
      } catch {
        return false // fetch 抛错=断网
      }
      q = q.slice(1)
      saveQueue(q)
    }
    return true
  } finally {
    flushing = false
  }
}

function isDataError(code: string | null | undefined): boolean {
  // PostgREST/PG 错误码（约束、类型等）；网络错误没有 code
  return !!code && code !== 'PGRST301' && !code.startsWith('08') && code !== '57014'
}

// ---------------- 云端拉取 ----------------

/** 从 Supabase 拉全量数据。任何一张表失败则返回 null（保持本地）。 */
export async function pullAll(): Promise<AppData | null> {
  if (!supabase) return null
  try {
    const [tx, cards, usages, trips, templates, cats, kv] = await Promise.all([
      supabase.from('transactions').select('*'),
      supabase.from('cards').select('*'),
      supabase.from('card_usages').select('*'),
      supabase.from('trips').select('*'),
      supabase.from('templates').select('*'),
      supabase.from('categories').select('*'),
      supabase.from('kv').select('*'),
    ])
    for (const r of [tx, cards, usages, trips, templates, cats, kv]) {
      if (r.error) return null
    }
    const kvMap: Record<string, unknown> = {}
    for (const row of (kv.data ?? []) as { key: string; value: unknown }[]) kvMap[row.key] = row.value
    const base = defaultData()
    const strip = <T extends Record<string, unknown>>(rows: T[]): T[] =>
      rows.map((r) => {
        const { user_id: _u, ...rest } = r
        return rest as unknown as T
      })
    const remoteCats = strip((cats.data ?? []) as never[]) as AppData['categories']
    return {
      transactions: strip((tx.data ?? []) as never[]),
      cards: strip((cards.data ?? []) as never[]),
      card_usages: strip((usages.data ?? []) as never[]),
      trips: strip((trips.data ?? []) as never[]),
      templates: strip((templates.data ?? []) as never[]),
      categories: remoteCats.length > 0 ? remoteCats : base.categories,
      housing_fund: (kvMap['housing_fund'] as AppData['housing_fund']) ?? null,
      settings: { ...base.settings, ...((kvMap['settings'] as Partial<Settings>) ?? {}) },
    }
  } catch {
    return null
  }
}

/** 首次登录（云端为空）时，把本地已有数据整体推上去 */
export async function pushAllIfCloudEmpty(data: AppData): Promise<void> {
  if (!supabase) return
  try {
    const { count, error } = await supabase.from('transactions').select('id', { count: 'exact', head: true })
    if (error || (count ?? 0) > 0) return
    const { count: catCount } = await supabase.from('categories').select('key', { count: 'exact', head: true })
    if ((catCount ?? 0) > 0 && data.transactions.length === 0) return
    for (const t of data.transactions) enqueue('transactions', 'upsert', t.id, t as never)
    for (const c of data.cards) enqueue('cards', 'upsert', c.id, c as never)
    for (const u of data.card_usages) enqueue('card_usages', 'upsert', u.id, u as never)
    for (const t of data.trips) enqueue('trips', 'upsert', t.id, t as never)
    for (const t of data.templates) enqueue('templates', 'upsert', t.id, t as never)
    for (const c of data.categories) enqueue('categories', 'upsert', c.key, c as never)
    enqueue('kv', 'upsert', 'settings', { key: 'settings', value: data.settings })
    if (data.housing_fund) enqueue('kv', 'upsert', 'housing_fund', { key: 'housing_fund', value: data.housing_fund })
    await flushQueue()
  } catch {
    /* 下次再同步 */
  }
}
