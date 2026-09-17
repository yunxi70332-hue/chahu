import { get, post, del } from './http'
import type {
  Withdrawal,
  WithdrawListParams,
  WithdrawListResult,
  WithdrawCreatePayload,
  WithdrawStatus,
} from './types'

/** GET /withdraws — 提现申请列表(ADMIN 全量,AGENT/MEMBER 仅自己) */
export function listWithdraws(params: WithdrawListParams = {}) {
  return get<WithdrawListResult>('/withdraws', params)
}

/** POST /withdraws — 发起提现申请(须已实名通过;金额 ≤ 余额-待审合计) */
export function createWithdraw(payload: WithdrawCreatePayload) {
  return post<Withdrawal>('/withdraws', payload)
}

/** GET /withdraws/:id — 提现申请详情(本人或 ADMIN) */
export function getWithdraw(id: number) {
  return get<Withdrawal>(`/withdraws/${id}`)
}

/** DELETE /withdraws/:id — 撤销待审申请(申请人本人;不动余额) */
export function cancelWithdraw(id: number) {
  return del<boolean>(`/withdraws/${id}`)
}

/** POST /withdraws/:id/approve — 审核通过(扣余额,写 WITHDRAW 流水) */
export function approveWithdraw(id: number) {
  return post<Withdrawal>(`/withdraws/${id}/approve`)
}

/** POST /withdraws/:id/reject — 审核驳回(reason 必填,不动余额) */
export function rejectWithdraw(id: number, reason: string) {
  return post<Withdrawal>(`/withdraws/${id}/reject`, { reason })
}

export type { WithdrawStatus }
