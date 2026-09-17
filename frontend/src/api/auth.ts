import { get, post } from './http'
import type { UserInfo } from './types'

/** POST /auth/login — 成功返回 token 与用户信息(错误:400 手机号或密码错误 / 403 已冻结) */
export function login(data: { phone: string; password: string }) {
  return post<{ token: string; user: UserInfo }>('/auth/login', data)
}

/** GET /auth/me — 当前登录用户 */
export function fetchMe() {
  return get<UserInfo>('/auth/me')
}

/** POST /auth/password — 修改密码(新旧密码均 ≥6 位) */
export function changePassword(data: { oldPassword: string; newPassword: string }) {
  return post<true>('/auth/password', data)
}
