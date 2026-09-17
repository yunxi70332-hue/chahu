import { defineStore } from 'pinia'
import { changePassword as apiChangePassword, fetchMe as apiFetchMe, login as apiLogin } from '@/api/auth'
import type { Role, UserInfo } from '@/api/types'

/** token 持久化 key(与 api/http.ts 的 TOKEN_KEY 一致) */
export const TOKEN_KEY = 'bd_token'

interface UserState {
  token: string
  userInfo: UserInfo | null
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    userInfo: null,
  }),

  getters: {
    isLoggedIn: (state) => !!state.token,
    role: (state): Role | '' => state.userInfo?.role ?? '',
  },

  actions: {
    setToken(token: string) {
      this.token = token
      localStorage.setItem(TOKEN_KEY, token)
    },

    /** 登录:保存 token + 用户信息 */
    async login(payload: { phone: string; password: string }) {
      const res = await apiLogin(payload)
      this.setToken(res.token)
      this.userInfo = res.user
      return res
    },

    /** 拉取当前用户信息(路由守卫刷新页面后调用,用于菜单角色过滤) */
    async fetchMe() {
      this.userInfo = await apiFetchMe()
      return this.userInfo
    },

    /** 修改密码 */
    async changePassword(oldPassword: string, newPassword: string) {
      return apiChangePassword({ oldPassword, newPassword })
    },

    /** 退出:清空登录态 */
    logout() {
      this.token = ''
      this.userInfo = null
      localStorage.removeItem(TOKEN_KEY)
    },
  },
})
