import { get, post } from './http'
import type { MyRealname, RealnameDetail, RealnameStatus } from './types'

/** GET /realname/me — 本人实名信息(证件号脱敏) */
export function getMyRealname() {
  return get<MyRealname>('/realname/me')
}

/**
 * POST /realname/submit — 提交实名(multipart)
 * FormData 字段:realName / idCardNo / photo(File,jpg·png·webp ≤5MB)
 * APPROVED 后后端 400 锁定;PENDING 不可重复提交
 */
export function submitRealname(form: FormData) {
  return post<MyRealname>('/realname/submit', form)
}

/** GET /realname/:userId — 管理员查看实名详情(含完整证件号) */
export function getRealnameDetail(userId: number) {
  return get<RealnameDetail>(`/realname/${userId}`)
}

/** GET /realname/:userId/photo — 鉴权取照片,返回 objectURL(用后需 revokeObjectURL) */
export async function fetchRealnamePhoto(userId: number): Promise<string> {
  const blob = await get<Blob>(`/realname/${userId}/photo`, undefined, { responseType: 'blob' })
  return URL.createObjectURL(blob)
}

/** POST /realname/:userId/approve — 审核通过(锁定) */
export function approveRealname(userId: number) {
  return post<MyRealname>(`/realname/${userId}/approve`)
}

/** POST /realname/:userId/reject — 审核驳回(reason 必填) */
export function rejectRealname(userId: number, reason: string) {
  return post<MyRealname>(`/realname/${userId}/reject`, { reason })
}

/** POST /realname/:userId/reset — 管理员重置实名(纠错) */
export function resetRealname(userId: number) {
  return post<MyRealname>(`/realname/${userId}/reset`)
}

export type { RealnameStatus }
