// 近似汇率（外币 1 单位 → CNY），设置页可改，记账时可临时改
export const DEFAULT_FX_RATES: Record<string, number> = {
  JPY: 0.047,
  USD: 7.1,
  EUR: 7.8,
  HKD: 0.91,
  GBP: 9.1,
  KRW: 0.0052,
  THB: 0.2,
}

export const CURRENCIES = ['CNY', 'JPY', 'USD', 'EUR', 'HKD', 'GBP', 'KRW', 'THB']

export const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: '¥',
  JPY: 'JP¥',
  USD: '$',
  EUR: '€',
  HKD: 'HK$',
  GBP: '£',
  KRW: '₩',
  THB: '฿',
}
