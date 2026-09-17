/**
 * API 契约 v2.1 的 TS 类型(唯一事实来源:docs/API契约-v2.1.md)
 * 阶段 2 页面 Agent 请从这里 import 类型,不要重复定义。
 */

/* ---------------- 枚举 ---------------- */

export type Role = 'ADMIN' | 'AGENT' | 'MEMBER'
export type OrderStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type TxnType = 'ORDER' | 'COMMISSION' | 'WITHDRAW' | 'RECHARGE' | 'ADJUST'
export type ProductStatus = 'ACTIVE' | 'DISABLED'
export type UserStatus = 'ACTIVE' | 'FROZEN'

/* ---------------- 通用 ---------------- */

export interface PageResult<T> {
  total: number
  page: number
  pageSize: number
  list: T[]
}

export interface UserInfo {
  id: number
  phone: string
  name: string
  role: Role
  balance?: number
  parentId?: number | null
  realnameStatus?: RealnameStatus
}

/* ---------------- 实名认证 /realname(契约 §9) ---------------- */

export type RealnameStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'

/** 本人视角的实名信息(证件号脱敏) */
export interface MyRealname {
  realnameStatus: RealnameStatus
  realName: string | null
  idCardNo: string | null
  realnameRejectReason: string | null
  realnameSubmittedAt: string | null
  realnameReviewedAt: string | null
}

/** 管理员视角的实名详情(含完整证件号供核对) */
export interface RealnameDetail extends MyRealname {
  id: number
  name: string
  phone: string
  role: Role
  hasPhoto: boolean
}

/* ---------------- 看板 /dashboard/stats ---------------- */

export interface DashboardCards {
  todayOrders: number
  todayAmount: number
  todayPayout: number
  todayWithdraw: number
  pendingCount: number
  userCount: number
  /** v2.4 今日差价利润,仅 ADMIN 响应中存在 */
  todayProfit?: number
}

export interface DashboardTrendItem {
  date: string
  orderAmount: number
  payout: number
}

export interface DashboardStatusItem {
  status: OrderStatus
  count: number
}

export interface DashboardCategoryItem {
  category: string
  count: number
  amount: number
}

export interface DashboardLatestPendingItem {
  id: number
  orderNo: string
  productName: string
  totalAmount: number
  createdAt: string
  user: { name: string; role: Role }
}

export interface DashboardStats {
  cards: DashboardCards
  trend: DashboardTrendItem[]
  statusDist: DashboardStatusItem[]
  categoryDist: DashboardCategoryItem[]
  latestPending: DashboardLatestPendingItem[]
}

/* ---------------- 报单 /orders ---------------- */

export interface OrderUser {
  id: number
  name: string
  phone?: string
  role?: Role
}

export interface Order {
  id: number
  orderNo: string
  logisticsNo: string | null
  userId: number
  user: OrderUser
  productId: number | null
  productName: string
  productType: string
  spec: string | null
  quantity: number
  unitPrice: number
  totalAmount: number
  /** v2.4 上游价快照/差价利润,仅总部可见(代理/会员响应中被裁剪) */
  upstreamPrice?: number | null
  profit?: number
  /** v2.3 废弃:中介模式下恒 0,历史订单保留 */
  commission: number
  status: OrderStatus
  remark: string | null
  rejectReason: string | null
  reviewedBy: number | null
  reviewer: { name: string } | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export type OrderListParams = {
  page?: number
  pageSize?: number
  status?: OrderStatus | ''
  type?: string
  keyword?: string
  startDate?: string
  endDate?: string
  userId?: number
}

export type OrderCreatePayload = {
  productId: number
  quantity?: number
  /** v2.4 废弃:佣金恒 0,服务端忽略此参数 */
  commission?: number
  logisticsNo?: string
  remark?: string
  userId?: number // 仅 ADMIN 代客下单时传
}

export type OrderUpdatePayload = {
  quantity?: number
  unitPrice?: number
  /** v2.4 废弃:佣金恒 0,服务端忽略此参数 */
  commission?: number
  remark?: string
  logisticsNo?: string
}

export interface BatchAuditResult {
  success: number[]
  failed: { id: number; reason: string }[]
}

/* ---------------- 产品 /products ---------------- */

export interface Product {
  id: number
  category: string
  brand: string
  name: string
  model: string | null
  memory: string | null
  disk: string | null
  screen: string | null
  color: string | null
  condition: string | null
  /** v2.4 上游报价(大富报价),仅总部可见 */
  upstreamPrice?: number | null
  /** 代理收购价 = 上游价 ×(1-品类下浮%) 或 上游价 − 品类固定减额 */
  price: number | null
  quoteDate: string
  status: ProductStatus
  createdAt: string
}

export type ProductListParams = {
  page?: number
  pageSize?: number
  keyword?: string
  category?: string
  brand?: string
  status?: ProductStatus | ''
  available?: 1 // =1 仅供建单选品(ACTIVE 且 price>0)
}

export interface ProductMeta {
  categories: string[]
  brands: string[]
}

export type ProductPayload = {
  category: string
  brand: string
  name: string
  model?: string
  memory?: string
  disk?: string
  screen?: string
  color?: string
  condition?: string
  price?: number | null
  quoteDate?: string
}

export interface ProductImportResult {
  imported: number
  disabled: number
  quoteDate: string
  /** v2.5 本次导入应用的品类计价规则 */
  markdownRules?: Record<string, MarkdownRule>
  /** v2.5 规则中 percent 品类的派生映射(旧字段,兼容保留) */
  markdownRates?: Record<string, number>
}

/* ---------------- 品类计价设置 /settings/markdown(v2.5) ---------------- */

/** percent:代理收购价 = 上游×(1−下浮%);fixed:代理收购价 = 上游−固定减额(元) */
export type MarkdownMode = 'percent' | 'fixed'

export interface MarkdownRule {
  mode: MarkdownMode
  value: number
}

export interface MarkdownSetting {
  /** { 品类: 计价规则 } */
  rules: Record<string, MarkdownRule>
  /** 仅 percent 品类的派生映射(兼容字段) */
  rates?: Record<string, number>
}

/* ---------------- 佣金设置 /settings/commission(v2.3 废弃,历史兼容) ---------------- */

export interface CommissionSetting {
  rates: Record<string, number> // 品类 → 百分比(如 1.5);未配置品类按 0
}

/* ---------------- 用户 /users ---------------- */

export interface SystemUser {
  id: number
  phone: string
  name: string
  role: Role
  parentId: number | null
  level: number
  balance: number
  status: UserStatus
  createdAt: string
  parent?: { name: string | null }
  realName: string | null
  idCardNo: string | null
  realnameStatus: RealnameStatus
  realnameRejectReason: string | null
  realnameSubmittedAt: string | null
  realnameReviewedAt: string | null
}

export type UserListParams = {
  page?: number
  pageSize?: number
  role?: Role | ''
  status?: UserStatus | ''
  realnameStatus?: RealnameStatus | ''
  keyword?: string
}

export type UserListResult = PageResult<SystemUser>

export type UserCreatePayload = {
  phone: string
  name: string
  password: string
  role: Role
  parentId?: number | null
  level?: number
  balance?: number
}

export type UserUpdatePayload = {
  phone?: string
  name?: string
  role?: Role
  parentId?: number | null
  level?: number
}

export interface UserOption {
  id: number
  name: string
  phone: string
  role: Role
  balance: number
  realnameStatus: RealnameStatus
}

export type BalanceAdjustPayload = {
  type: 'RECHARGE' | 'WITHDRAW' | 'ADJUST'
  amount: number // ADJUST 可正负;WITHDRAW 取绝对值
  remark: string // 必填
}

/* ---------------- 流水 /transactions ---------------- */

export interface Txn {
  id: number
  txNo: string
  userId: number
  user: { id: number; name: string; phone: string }
  type: TxnType
  typeLabel: string
  amount: number // 正 = 收入,负 = 支出
  balanceAfter: number
  orderId: number | null
  order: { orderNo: string } | null
  remark: string | null
  createdAt: string
}

export type TxnListParams = {
  page?: number
  pageSize?: number
  type?: TxnType | ''
  keyword?: string
  startDate?: string
  endDate?: string
  userId?: number
}

export type TxnListResult = PageResult<Txn> & {
  incomeSum: number
  expenseSum: number
}
