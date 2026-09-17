import { get } from './http'
import type { DashboardStats } from './types'

/** GET /dashboard/stats — 看板聚合数据,days 仅支持 7 | 30 */
export function getDashboardStats(days: 7 | 30 = 7) {
  return get<DashboardStats>('/dashboard/stats', { days })
}
