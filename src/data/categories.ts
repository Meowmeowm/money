import type { Category } from '../types'

const T = '2026-01-01T00:00:00.000Z'

function c(key: string, parent: string | null, label: string, emoji: string, type: 'expense' | 'income', sort: number): Category {
  return { key, parent_key: parent, label, emoji, type, sort, active: true, updated_at: T }
}

// 大类 key 常量
export const CAT_CARDS = 'cards' // 充值卡（口径开关剔除对象）

export const DEFAULT_CATEGORIES: Category[] = [
  // ---- 支出大类 ----
  c('food', null, '吃喝', '🍜', 'expense', 10),
  c('transport', null, '交通', '🚕', 'expense', 20),
  c('shopping', null, '购物', '🛍️', 'expense', 30),
  c('cat', null, '猫咪', '🐱', 'expense', 40),
  c('beauty', null, '美容放松', '💆', 'expense', 50),
  c(CAT_CARDS, null, '充值卡', '🎫', 'expense', 60),
  c('social', null, '人情往来', '🤝', 'expense', 70),
  c('living', null, '生活固定', '🏠', 'expense', 80),
  c('fun', null, '娱乐', '🎮', 'expense', 90),
  c('medical', null, '医疗', '🏥', 'expense', 100),
  c('other', null, '其他', '📦', 'expense', 110),
  // ---- 支出小类 ----
  c('food_delivery', 'food', '外卖', '🛵', 'expense', 11),
  c('food_coffee', 'food', '咖啡奶茶', '🧋', 'expense', 12),
  c('food_restaurant', 'food', '下馆子', '🍽️', 'expense', 13),
  c('food_grocery', 'food', '食材超市', '🥬', 'expense', 14),
  c('transport_taxi', 'transport', '打车', '🚖', 'expense', 21),
  c('transport_metro', 'transport', '地铁公交', '🚇', 'expense', 22),
  c('transport_bike', 'transport', '单车', '🚲', 'expense', 23),
  c('transport_train', 'transport', '火车飞机', '✈️', 'expense', 24),
  c('shopping_clothes', 'shopping', '服饰鞋包', '👗', 'expense', 31),
  c('shopping_makeup', 'shopping', '美妆香水', '💄', 'expense', 32),
  c('shopping_digital', 'shopping', '数码', '📱', 'expense', 33),
  c('shopping_home', 'shopping', '家居日用', '🧻', 'expense', 34),
  c('cat_food', 'cat', '猫粮', '🍗', 'expense', 41),
  c('cat_litter', 'cat', '猫砂用品', '🧺', 'expense', 42),
  c('cat_medical', 'cat', '猫医疗', '💉', 'expense', 43),
  c('beauty_nail', 'beauty', '美甲', '💅', 'expense', 51),
  c('beauty_lash', 'beauty', '睫毛', '👁️', 'expense', 52),
  c('beauty_spa', 'beauty', '按摩SPA', '🧖', 'expense', 53),
  c('beauty_hair', 'beauty', '理发造型', '💇', 'expense', 54),
  c('beauty_medical', 'beauty', '医美单次', '✨', 'expense', 55),
  c('cards_gym', CAT_CARDS, '健身', '💪', 'expense', 61),
  c('cards_art', CAT_CARDS, '画画', '🎨', 'expense', 62),
  c('cards_medical', CAT_CARDS, '医美', '🌸', 'expense', 63),
  c('cards_nail', CAT_CARDS, '美甲卡', '💅', 'expense', 64),
  c('cards_lash', CAT_CARDS, '睫毛卡', '👁️', 'expense', 65),
  c('social_family', 'social', '给家人', '👨‍👩‍👧', 'expense', 71),
  c('social_aa', 'social', '同事AA代付', '🧾', 'expense', 72),
  c('social_gift', 'social', '红包礼物', '🎁', 'expense', 73),
  c('living_ayi', 'living', '阿姨家政', '🧹', 'expense', 81),
  c('living_phone', 'living', '话费网费', '📶', 'expense', 82),
  c('living_mortgage', 'living', '房贷补足', '🏦', 'expense', 83),
  c('living_utility', 'living', '水电燃气', '💡', 'expense', 84),
  c('fun_game', 'fun', '游戏', '🕹️', 'expense', 91),
  c('fun_show', 'fun', '电影演出', '🎬', 'expense', 92),
  c('fun_travel', 'fun', '旅游', '🧳', 'expense', 93),
  // ---- 收入大类 ----
  c('salary', null, '工资', '💰', 'income', 10),
  c('gift_income', null, '红包礼金', '🧧', 'income', 20),
  c('refund_income', null, '退款外收入', '✨', 'income', 30),
]

// 分类圆底配色（浅色圆底），按大类 key
export const CAT_COLORS: Record<string, string> = {
  food: '#FDEBD8',
  transport: '#DDEAF7',
  shopping: '#F7DFE7',
  cat: '#F3EAD9',
  beauty: '#EFE3F4',
  cards: '#E1EFE7',
  social: '#FCE9DC',
  living: '#E3ECEC',
  fun: '#E5E4F6',
  medical: '#FBE3E0',
  other: '#EBEBEC',
  salary: '#E1EFE7',
  gift_income: '#FBE3E0',
  refund_income: '#EFE3F4',
}
