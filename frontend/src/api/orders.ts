import { del, get, post, put } from './http'
import type {
  BatchAuditResult,
  Order,
  OrderCreatePayload,
  OrderListParams,
  OrderUpdatePayload,
  PageResult,
} from './types'

/** GET /orders — 报单分页列表 */
export function listOrders(params: OrderListParams = {}) {
  return get<PageResult<Order>>('/orders', params)
}

/** POST /orders — 建单(commission 不传 = 按品类比例自动) */
export function createOrder(data: OrderCreatePayload) {
  return post<Order>('/orders', data)
}

/** PUT /orders/:id — 仅 PENDING 可改,重算 totalAmount */
export function updateOrder(id: number, data: OrderUpdatePayload) {
  return put<Order>(`/orders/${id}`, data)
}

/** DELETE /orders/:id — 仅 PENDING 可删(MEMBER 仅自己的) */
export function removeOrder(id: number) {
  return del<true>(`/orders/${id}`)
}

/** POST /orders/:id/approve — 审核通过(= 平台打款),重复审核 400 */
export function approveOrder(id: number, remark = '') {
  return post<true>(`/orders/${id}/approve`, { remark })
}

/** POST /orders/:id/reject — 驳回(remark 必填,否则 400) */
export function rejectOrder(id: number, remark: string) {
  return post<true>(`/orders/${id}/reject`, { remark })
}

/** POST /orders/batch-approve */
export function batchApproveOrders(ids: number[]) {
  return post<BatchAuditResult>('/orders/batch-approve', { ids })
}

/** POST /orders/batch-reject */
export function batchRejectOrders(ids: number[], remark: string) {
  return post<BatchAuditResult>('/orders/batch-reject', { ids, remark })
}
