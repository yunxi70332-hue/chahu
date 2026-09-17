/**
 * 枚举中文映射 + 金额/时间格式化(契约 §0 枚举、§8 金额与手机号规范)
 * 阶段 2 页面 Agent 请直接 import,不要重复写映射。
 */

export type TagType = 'primary' | 'success' | 'warning' | 'danger' | 'info'

export interface EnumMeta {
  label: string
  type: TagType
}

/* ---------------- 枚举映射 ---------------- */

/** 报单状态:PENDING 橙 / APPROVED 绿 / REJECTED 红 */
export const ORDER_STATUS: Record<string, EnumMeta> = {
  PENDING: { label: '待审核', type: 'warning' },
  APPROVED: { label: '已通过', type: 'success' },
  REJECTED: { label: '已驳回', type: 'danger' },
}

export interface TxnTypeMeta extends EnumMeta {
  /** income = 正金额(绿 +¥),expense = 支出(红 −¥),neutral = 视正负号 */
  direction: 'income' | 'expense' | 'neutral'
}

/** 流水类型 */
export const TXN_TYPE: Record<string, TxnTypeMeta> = {
  ORDER: { label: '报单打款', type: 'success', direction: 'income' },
  COMMISSION: { label: '佣金', type: 'success', direction: 'income' },
  WITHDRAW: { label: '提现', type: 'danger', direction: 'expense' },
  RECHARGE: { label: '补款', type: 'primary', direction: 'income' },
  ADJUST: { label: '调整', type: 'info', direction: 'neutral' },
}

/** 角色 */
export const ROLE: Record<string, EnumMeta> = {
  ADMIN: { label: '管理员', type: 'danger' },
  AGENT: { label: '代理', type: 'primary' },
  MEMBER: { label: '会员', type: 'info' },
}

/** 用户状态 */
export const USER_STATUS: Record<string, EnumMeta> = {
  ACTIVE: { label: '正常', type: 'success' },
  FROZEN: { label: '已冻结', type: 'danger' },
}

/** 产品状态 */
export const PRODUCT_STATUS: Record<string, EnumMeta> = {
  ACTIVE: { label: '上架', type: 'success' },
  DISABLED: { label: '下架', type: 'info' },
}

/** 实名认证状态:未实灰 / 待审橙 / 已实绿 / 驳回红 */
export const REALNAME_STATUS: Record<string, EnumMeta> = {
  NONE: { label: '未实名', type: 'info' },
  PENDING: { label: '待审核', type: 'warning' },
  APPROVED: { label: '已实名', type: 'success' },
  REJECTED: { label: '已驳回', type: 'danger' },
}

/** 提现申请状态(v2.7):待审橙 / 已通过绿 / 已驳回红 */
export const WITHDRAW_STATUS: Record<string, EnumMeta> = {
  PENDING: { label: '待审核', type: 'warning' },
  APPROVED: { label: '已通过', type: 'success' },
  REJECTED: { label: '已驳回', type: 'danger' },
}

/** 提现收款方式(v2.7) */
export const WITHDRAW_METHOD: Record<string, EnumMeta> = {
  ALIPAY: { label: '支付宝', type: 'primary' },
  WECHAT: { label: '微信', type: 'success' },
  BANK: { label: '银行卡', type: 'warning' },
}

/** 从映射表取枚举元信息,未命中时兜底展示原值 */
export function enumMeta(map: Record<string, EnumMeta>, key?: string | null): EnumMeta {
  if (key && map[key]) return map[key]
  return { label: key || '-', type: 'info' }
}

/* ---------------- 金额 ---------------- */

/** ¥ + 千分位 + 2 位小数,如 ¥45,230.50(空/非法值按 0) */
export function formatMoney(value: unknown): string {
  const n = Number(value)
  const safe = Number.isFinite(n) ? n : 0
  return `¥${safe.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** 带符号金额:正数 +¥…、负数 −¥…(用于流水,配合 .money-income / .money-expense) */
export function formatSignedMoney(value: number): string {
  const abs = formatMoney(Math.abs(value))
  if (value > 0) return `+${abs}`
  if (value < 0) return `−${abs}`
  return abs
}

/* ---------------- 手机号 ---------------- */

/** 列表展示层打码:13800006688 → 138****6688(非 11 位原样返回) */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '-'
  const s = String(phone)
  if (/^1\d{10}$/.test(s)) {
    return s.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
  }
  return s
}

/**
 * 手机号展示:unmasked=true 输出完整号(管理员审核/核对需要),否则沿用列表打码
 * 打码只针对非管理员的展示层,见契约 §8
 */
export function displayPhone(phone?: string | null, unmasked = false): string {
  if (!phone) return '-'
  return unmasked ? String(phone) : maskPhone(phone)
}

/* ---------------- 时间 ---------------- */

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** MM-DD HH:mm(列表默认展示) */
export function formatDateTime(value?: string | number | Date | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** YYYY-MM-DD HH:mm */
export function formatFullDateTime(value?: string | number | Date | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

/** YYYY-MM-DD */
export function formatDate(value?: string | number | Date | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
