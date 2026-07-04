import type { AppData, Category, TxType } from '../types'
import { CAT_COLORS } from '../data/categories'

export function catOf(data: AppData, key: string): Category | undefined {
  return data.categories.find((c) => c.key === key)
}

export function catLabel(data: AppData, key: string): string {
  return catOf(data, key)?.label ?? key
}

export function catEmoji(data: AppData, key: string): string {
  return catOf(data, key)?.emoji ?? '📦'
}

export function catColor(key: string, parentKey?: string | null): string {
  return CAT_COLORS[key] ?? (parentKey ? CAT_COLORS[parentKey] : undefined) ?? '#EBEBEC'
}

export function majorCategories(data: AppData, type: TxType): Category[] {
  return data.categories
    .filter((c) => c.type === type && c.parent_key === null && c.active)
    .sort((a, b) => a.sort - b.sort)
}

export function subCategories(data: AppData, parentKey: string): Category[] {
  return data.categories
    .filter((c) => c.parent_key === parentKey && c.active)
    .sort((a, b) => a.sort - b.sort)
}
