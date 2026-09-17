import { get } from './http'
import type { TxnListParams, TxnListResult } from './types'

/** GET /transactions — 资金流水分页(含筛选范围内 incomeSum / expenseSum 汇总) */
export function listTransactions(params: TxnListParams = {}) {
  return get<TxnListResult>('/transactions', params)
}
