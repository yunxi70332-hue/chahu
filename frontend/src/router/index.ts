import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

import { TOKEN_KEY } from '@/api/http'
import type { Role } from '@/api/types'
import { useUserStore } from '@/stores/user'

declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题(顶栏 + document.title) */
    title?: string
    /** 允许访问的角色(契约 §8:ADMIN 全部;AGENT 看板/报单/流水;MEMBER 报单/流水) */
    roles?: Role[]
  }
}

/**
 * 路由全量预注册 —— 阶段 2 页面 Agent 只替换对应 view 文件内容,
 * 本文件不要再动(组件路径已指向各 view 壳)。
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login/Login.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/',
    component: () => import('@/layouts/AdminLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/dashboard/Dashboard.vue'),
        meta: { title: '看板', roles: ['ADMIN', 'AGENT'] },
      },
      {
        path: 'orders',
        name: 'orders',
        component: () => import('@/views/orders/Orders.vue'),
        meta: { title: '报单管理', roles: ['ADMIN', 'AGENT', 'MEMBER'] },
      },
      {
        path: 'realname',
        name: 'realname',
        component: () => import('@/views/realname/Realname.vue'),
        meta: { title: '实名认证', roles: ['AGENT', 'MEMBER'] },
      },
      {
        path: 'products',
        name: 'products',
        component: () => import('@/views/products/Products.vue'),
        meta: { title: '产品管理', roles: ['ADMIN'] },
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('@/views/users/Users.vue'),
        meta: { title: '用户管理', roles: ['ADMIN'] },
      },
      {
        path: 'transactions',
        name: 'transactions',
        component: () => import('@/views/transactions/Transactions.vue'),
        meta: { title: '资金流水', roles: ['ADMIN', 'AGENT', 'MEMBER'] },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

/** 是否已尝试过 fetchMe(避免后端未就绪时每次导航重复报错) */
let meRequested = false

/** 角色的默认落地页:取该角色可访问的第一个菜单(契约 §8) */
const FALLBACK: Record<string, string> = { ADMIN: '/dashboard', AGENT: '/dashboard', MEMBER: '/orders' }

function homeFor(role: string | null | undefined): string {
  return FALLBACK[role || ''] || '/orders'
}

router.beforeEach(async (to) => {
  const userStore = useUserStore()
  const token = localStorage.getItem(TOKEN_KEY)

  // 登录页:已登录直接进该角色的默认页
  if (to.path === '/login') {
    return token ? { path: homeFor(userStore.role) } : true
  }

  // 登录守卫:无 token 访问受保护页 → /login(带 redirect)
  if (!token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // 刷新后补拉用户信息(菜单角色过滤依赖 role;失败不阻断导航,401 由拦截器统一处理)
  if (!userStore.userInfo && !meRequested) {
    meRequested = true
    try {
      await userStore.fetchMe()
    } catch {
      /* 忽略:后端未就绪 / 网络异常时仍渲染页面 */
    }
  }

  // 角色守卫:无权限时回落到该角色可访问的第一个页面(不可指向无权限页,避免循环)
  if (to.meta.roles?.length && userStore.role && !to.meta.roles.includes(userStore.role)) {
    const fallback = homeFor(userStore.role)
    return to.path === fallback ? true : { path: fallback }
  }

  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - 数码报单系统` : '数码报单系统'
})

export default router
