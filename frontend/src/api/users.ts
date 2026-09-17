import { get, post, put } from './http'
import type {
  BalanceAdjustPayload,
  Txn,
  UserCreatePayload,
  UserListParams,
  UserListResult,
  UserOption,
  UserUpdatePayload,
} from './types'

/** GET /users — 用户分页列表(ADMIN) */
export function listUsers(params: UserListParams = {}) {
  return get<UserListResult>('/users', params)
}

/** GET /users/options — 建单选报单人下拉(默认仅 ACTIVE+已实名+非管理员;all=true 返回全部 ACTIVE) */
export function getUserOptions(all = false) {
  return get<UserOption[]>('/users/options', all ? { all: 1 } : undefined)
}

/** POST /users — 新建用户,返回 { id }(初始 balance>0 自动记 RECHARGE 流水) */
export function createUser(data: UserCreatePayload) {
  return post<{ id: number }>('/users', data)
}

/** PUT /users/:id — 编辑用户(phone/name/role/parentId/level 任意子集) */
export function updateUser(id: number, data: UserUpdatePayload) {
  return put<true>(`/users/${id}`, data)
}

/** POST /users/:id/freeze — 冻结(不能冻结自己) */
export function freezeUser(id: number) {
  return post<true>(`/users/${id}/freeze`)
}

/** POST /users/:id/unfreeze — 解冻 */
export function unfreezeUser(id: number) {
  return post<true>(`/users/${id}/unfreeze`)
}

/** POST /users/:id/reset-password — 重置密码 */
export function resetUserPassword(id: number, password: string) {
  return post<true>(`/users/${id}/reset-password`, { password })
}

/**
 * POST /users/:id/balance — 余额调整记账
 * RECHARGE 补款(+) / WITHDRAW 提现(−) / ADJUST 调整(可正负);remark 必填
 * 返回值即这笔流水记录
 */
export function adjustUserBalance(id: number, data: BalanceAdjustPayload) {
  return post<Txn>(`/users/${id}/balance`, data)
}
