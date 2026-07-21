export type TxType = 'expense' | 'income'
export type RefundStatus = 'none' | 'partial' | 'full'

export interface Transaction {
  id: string
  date: string // YYYY-MM-DD
  type: TxType
  amount_cny: number // 净额（退款后）
  original_amount: number | null // 外币原金额
  currency: string // 'CNY' | 'JPY' | ...
  fx_rate: number | null
  category: string // 大类 key
  subcategory: string | null
  note: string
  trip_id: string | null
  refund_status: RefundStatus
  refund_amount: number
  is_card_purchase: boolean // 办卡/充值：归本类别，但可被“不含充值卡”口径剔除
  template_id: string | null
  created_at: string
  updated_at: string
}

export type CardKind = 'count' | 'balance'

export interface Card {
  id: string
  name: string
  category: string | null // 卡消费所属大类（用于“消费水平”口径把划卡价值归类）
  subcategory: string | null
  kind: CardKind
  total_price: number | null // 次卡总价
  total_count: number | null // 次卡总次数
  balance: number | null // 金额卡充值总额
  remaining_count: number | null
  remaining_balance: number | null
  expire_date: string | null
  series_id: string
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
}

export interface CardUsage {
  id: string
  card_id: string
  used_at: string // date
  count_used: number
  amount_used: number
  equivalent_cny: number
  created_at: string
  updated_at: string
}

export interface Trip {
  id: string
  name: string
  active: boolean
  start_date: string | null // 旅行开始日（YYYY-MM-DD）；落在区间内才自动带标签
  end_date: string | null // 旅行结束日；过期后自动收工
  created_at: string
  updated_at: string
}

export interface TemplateConfig {
  kind: 'split_ayi' | 'simple'
  // split_ayi
  fixed?: number
  fixed_cat?: string
  fixed_sub?: string | null
  fixed_note?: string
  diff_cat?: string
  diff_sub?: string | null
  diff_note?: string
  // simple
  type?: TxType
  category?: string
  subcategory?: string | null
  note?: string
  amount?: number | null
}

export interface Template {
  id: string
  name: string
  config: TemplateConfig
  created_at: string
  updated_at: string
}

export interface Category {
  key: string
  parent_key: string | null
  label: string
  emoji: string
  type: TxType
  sort: number
  active: boolean
  updated_at: string
}

export type SavingsMoveType = 'in' | 'out' | 'loan'

export interface SavingsMove {
  id: string
  date: string // YYYY-MM-DD
  type: SavingsMoveType // in=存入 out=取出（消费/挪钱） loan=借出
  amount: number
  note: string
  borrower: string | null // loan 专用：借给谁
  repaid: boolean // loan 专用：是否已收回
  repaid_date: string | null
  created_at: string
  updated_at: string
}

export interface Savings {
  opening: number // 建账起始余额
  moves: SavingsMove[]
}

export type InsuranceKind = 'protect' | 'savings' // 消费型保障 / 储蓄型

export interface InsurancePayment {
  year: number // 缴费年份
  amount: number // 当年实缴保费（保费逐年可变，各年独立留档）
}

export interface Insurance {
  id: string
  name: string
  kind: InsuranceKind
  annual: number // 当前年缴保费（新一年缴费时的默认金额）
  pay_month: number // 缴费月 1-12
  payments: InsurancePayment[] // 逐年缴费记录（每年一条，历史不被覆盖）
  note: string
  created_at: string
  updated_at: string
}

export interface HousingFund {
  balance: number
  monthly_deposit: number
  loan_a: number
  loan_b: number
  updated_at: string // 校准时间
}

export interface Settings {
  budget_enabled: boolean
  budget_include_cards: boolean
  budget_total: number | null
  budget_by_category: Record<string, number>
  ayi_fixed: number
  fx_rates: Record<string, number> // 外币 -> CNY
  stats_include_cards: boolean
  updated_at: string
}

export interface AppData {
  transactions: Transaction[]
  cards: Card[]
  card_usages: CardUsage[]
  trips: Trip[]
  templates: Template[]
  categories: Category[]
  housing_fund: HousingFund | null
  savings: Savings | null
  insurances: Insurance[]
  settings: Settings
}

export type SyncTable =
  | 'transactions'
  | 'cards'
  | 'card_usages'
  | 'trips'
  | 'templates'
  | 'categories'
  | 'kv'

export interface SyncOp {
  seq: number
  table: SyncTable
  op: 'upsert' | 'delete'
  id: string // categories 用 key；kv 用固定 key
  row?: Record<string, unknown>
}
