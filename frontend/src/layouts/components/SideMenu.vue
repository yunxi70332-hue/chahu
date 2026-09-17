<script setup lang="ts">
import { computed } from 'vue'
import { markRaw } from 'vue'
import { useRoute } from 'vue-router'
import { Box, Coin, List, Money, Odometer, Postcard, User, Wallet } from '@element-plus/icons-vue'
import type { Component } from 'vue'

import type { Role } from '@/api/types'
import { useUserStore } from '@/stores/user'

/**
 * 侧栏(品牌区 + 暗色菜单)。
 * 桌面固定在左侧,移动端由 AdminLayout 放进 el-drawer 复用;
 * 菜单项按契约 §8 按 role 过滤。选中导航后向父级 emit('navigate') 用于收起抽屉。
 */

interface MenuItem {
  path: string
  title: string
  icon: Component
  roles: Role[]
}

const MENU_ITEMS: MenuItem[] = [
  { path: '/dashboard', title: '看板', icon: markRaw(Odometer), roles: ['ADMIN', 'AGENT'] },
  { path: '/orders', title: '报单管理', icon: markRaw(List), roles: ['ADMIN', 'AGENT', 'MEMBER'] },
  { path: '/realname', title: '实名认证', icon: markRaw(Postcard), roles: ['AGENT', 'MEMBER'] },
  { path: '/my-withdraws', title: '我的提现', icon: markRaw(Coin), roles: ['AGENT', 'MEMBER'] },
  { path: '/products', title: '产品管理', icon: markRaw(Box), roles: ['ADMIN'] },
  { path: '/users', title: '用户管理', icon: markRaw(User), roles: ['ADMIN'] },
  { path: '/withdraw-review', title: '提现审核', icon: markRaw(Wallet), roles: ['ADMIN'] },
  { path: '/transactions', title: '资金流水', icon: markRaw(Money), roles: ['ADMIN', 'AGENT', 'MEMBER'] },
]

const emit = defineEmits<{
  (e: 'navigate'): void
}>()

const route = useRoute()
const userStore = useUserStore()

const visibleMenus = computed(() =>
  MENU_ITEMS.filter((m) => userStore.role && m.roles.includes(userStore.role)),
)
</script>

<template>
  <div class="side-menu">
    <!-- 品牌区 -->
    <div class="brand">
      <div class="brand-logo">单</div>
      <div class="brand-meta">
        <div class="brand-name">数码报单</div>
        <span class="brand-badge">内部版</span>
      </div>
    </div>

    <!-- 导航菜单 -->
    <el-menu
      class="side-menu-nav"
      :default-active="route.path"
      router
      background-color="transparent"
      text-color="rgba(255, 255, 255, 0.68)"
      active-text-color="#ffffff"
      @select="emit('navigate')"
    >
      <el-menu-item v-for="item in visibleMenus" :key="item.path" :index="item.path">
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.title }}</span>
      </el-menu-item>
    </el-menu>

    <div class="side-menu-foot">郑州天讯商贸行</div>
  </div>
</template>

<style scoped>
.side-menu {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bd-sidebar-bg, #191919);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.brand-logo {
  width: 38px;
  height: 38px;
  border-radius: 9px;
  background: linear-gradient(145deg, #1e6bff, var(--bd-primary, #0052d9));
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 82, 217, 0.35);
}

.brand-meta {
  min-width: 0;
}

.brand-name {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
  line-height: 1.3;
}

.brand-badge {
  display: inline-block;
  margin-top: 2px;
  padding: 0 6px;
  font-size: 10px;
  line-height: 16px;
  color: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 4px;
}

.side-menu-nav {
  flex: 1;
  padding: 10px;
  border-right: none;
  overflow-y: auto;
}

.side-menu-nav :deep(.el-menu-item) {
  height: 44px;
  line-height: 44px;
  margin-bottom: 4px;
  border-radius: 8px;
}

.side-menu-nav :deep(.el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.side-menu-nav :deep(.el-menu-item.is-active) {
  background: var(--el-color-primary, #0052d9);
  color: #fff;
  font-weight: 600;
}

.side-menu-foot {
  padding: 14px 16px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.32);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}
</style>
