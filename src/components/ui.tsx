import { type ReactNode, useEffect } from 'react'

export function Sheet(props: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  return (
    <div
      className="sheet-mask"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose()
      }}
    >
      <div className="sheet">
        <div className="sheet-title">
          <span>{props.title}</span>
          <button className="close" onClick={props.onClose} aria-label="关闭">
            ×
          </button>
        </div>
        {props.children}
      </div>
    </div>
  )
}

export function Segmented<T extends string>(props: {
  options: { value: T; label: string; cls?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="seg">
      {props.options.map((o) => (
        <button
          key={o.value}
          className={props.value === o.value ? `on ${o.cls ?? ''}` : ''}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** 数字输入辅助：字符串状态 → number（无效为 NaN） */
export function parseAmount(s: string): number {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : NaN
}
