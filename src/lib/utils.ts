export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function todayStr(): string {
  return dateToStr(new Date())
}

export function dateToStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7) // YYYY-MM
}

export function thisMonthKey(): string {
  return todayStr().slice(0, 7)
}

export function shiftMonth(mk: string, delta: number): string {
  const [y, m] = mk.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(mk: string): string {
  const [y, m] = mk.split('-').map(Number)
  return `${y}年${m}月`
}

/** 金额格式化：千分位 + 最多2位小数（整数不带小数） */
export function fmtMoney(n: number): string {
  const neg = n < 0
  const abs = Math.abs(n)
  const hasFrac = Math.round(abs * 100) % 100 !== 0
  const s = abs.toLocaleString('en-US', {
    minimumFractionDigits: hasFrac ? 2 : 0,
    maximumFractionDigits: 2,
  })
  return (neg ? '-' : '') + s
}

export function fmtCny(n: number): string {
  return '¥' + fmtMoney(n)
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 明细日期头：今天/昨天/M月D日 周X（跨年带年份） */
export function dayLabel(dateStr: string): string {
  const today = todayStr()
  if (dateStr === today) return '今天'
  const yest = dateToStr(new Date(Date.now() - 86400000))
  if (dateStr === yest) return '昨天'
  const [y, m, d] = dateStr.split('-').map(Number)
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()]
  const thisYear = new Date().getFullYear()
  return y === thisYear ? `${m}月${d}日 ${wd}` : `${y}年${m}月${d}日 ${wd}`
}

export function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const target = new Date(y, m - 1, d).getTime()
  const today = new Date()
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return Math.round((target - t0) / 86400000)
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
