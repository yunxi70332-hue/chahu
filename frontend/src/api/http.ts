import axios, { AxiosError } from 'axios'
import type { AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'

/** 登录态 token 的 localStorage key(与 stores/user.ts 保持一致) */
export const TOKEN_KEY = 'bd_token'

/**
 * axios 实例(契约 §0 通用约定):
 * - baseURL = /api(Vite dev 代理 → http://localhost:3001)
 * - 请求拦截:自动注入 Authorization: Bearer <token>
 * - 响应拦截:后端 { code: 0, data } → 直接返回 data;
 *   失败 → ElMessage.error(message) 并 reject;
 *   401 → 清登录态并跳 /login
 */
const instance = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

instance.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers?.set('Authorization', `Bearer ${token}`)
  }
  return config
})

function handleUnauthorized() {
  localStorage.removeItem(TOKEN_KEY)
  if (!window.location.pathname.startsWith('/login')) {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search)
    window.location.href = `/login?redirect=${redirect}`
  }
}

instance.interceptors.response.use(
  (response) => {
    const res = response.data
    if (res && typeof res === 'object' && 'code' in res) {
      if (res.code === 0) {
        return res.data
      }
      // 契约约定失败走 HTTP 4xx/5xx,这里兜底 HTTP 200 但 code !== 0 的情况
      const message = res.message || '请求失败'
      ElMessage.error(message)
      return Promise.reject(new Error(message))
    }
    return res
  },
  (error: AxiosError<{ message?: string }>) => {
    const status = error.response?.status
    const rawMessage = error.response?.data?.message
    const message = rawMessage || error.message || '网络异常,请稍后重试'
    if (status === 401) {
      ElMessage.error(rawMessage || '登录已过期,请重新登录')
      handleUnauthorized()
    } else {
      ElMessage.error(message)
    }
    return Promise.reject(error)
  },
)

/** GET:params 序列化为 query,resolve 值即后端 data */
export function get<T = unknown>(
  url: string,
  params?: Record<string, any>,
  config?: AxiosRequestConfig,
): Promise<T> {
  return instance.get(url, { ...config, params }) as unknown as Promise<T>
}

/** POST:resolve 值即后端 data(传 FormData 时不要手动设 Content-Type,浏览器会自动带 boundary) */
export function post<T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  return instance.post(url, data, config) as unknown as Promise<T>
}

/** PUT */
export function put<T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  return instance.put(url, data, config) as unknown as Promise<T>
}

/** DELETE */
export function del<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return instance.delete(url, config) as unknown as Promise<T>
}

export default instance
