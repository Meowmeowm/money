import type { AppData } from '../types'
import { catLabel } from './catalog'

function esc(v: unknown): string {
  const s = v == null ? '' : String(v)
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function exportCsv(data: AppData): void {
  const header = [
    'id', '日期', '类型', '金额CNY', '原币金额', '币种', '汇率',
    '大类', '小类', '备注', '旅行', '退款状态', '退款金额', '创建时间',
  ]
  const tripName = (id: string | null) => (id ? data.trips.find((t) => t.id === id)?.name ?? '' : '')
  const rows = [...data.transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
    .map((t) => [
      t.id, t.date, t.type === 'expense' ? '支出' : '收入', t.amount_cny,
      t.original_amount ?? '', t.currency, t.fx_rate ?? '',
      catLabel(data, t.category), t.subcategory ? catLabel(data, t.subcategory) : '',
      t.note, tripName(t.trip_id),
      t.refund_status === 'none' ? '' : t.refund_status === 'full' ? '整笔退款' : '部分退款',
      t.refund_amount || '', t.created_at,
    ])
  const csv = '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `monicas-money-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
