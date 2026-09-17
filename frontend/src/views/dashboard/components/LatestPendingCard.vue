<script setup lang="ts">
/**
 * 最新待审卡(占宽 1/2):最新 5 条待审报单
 * 行:单号(加粗)/ 报单人 · 产品 / 金额 + 时间 / 「去审核」按钮(带 keyword 跳报单管理)
 */
import { useRouter } from 'vue-router'
import PageCard from '@/components/PageCard.vue'
import { ROLE, formatDateTime, formatMoney } from '@/utils/format'
import type { DashboardLatestPendingItem } from '@/api/types'

defineProps<{
  list: DashboardLatestPendingItem[]
}>()

const router = useRouter()

function goOrders() {
  router.push('/orders')
}

/** 去审核:带单号作为关键词,报单管理页可直接命中该单 */
function goAudit(item: DashboardLatestPendingItem) {
  router.push({ path: '/orders', query: { keyword: item.orderNo } })
}

function roleLabel(role?: string): string {
  return (role && ROLE[role]?.label) || ''
}
</script>

<template>
  <PageCard>
    <template #header>
      <div class="pending-head">
        <h3 class="pending-head__title">最新待审</h3>
        <el-link type="primary" :underline="false" @click="goOrders">
          进入报单管理 →
        </el-link>
      </div>
    </template>

    <el-empty v-if="!list.length" description="暂无待审核报单" :image-size="88" />

    <ul v-else class="pending-list">
      <li v-for="item in list" :key="item.id" class="pending-item">
        <div class="pending-item__main">
          <div class="pending-item__no">{{ item.orderNo }}</div>
          <div class="pending-item__meta">
            {{ item.user?.name || '-' }}
            <span v-if="roleLabel(item.user?.role)" class="pending-item__role">
              {{ roleLabel(item.user?.role) }}
            </span>
            <span class="pending-item__dot">·</span>
            {{ item.productName }}
          </div>
        </div>
        <div class="pending-item__side">
          <div class="pending-item__amount">{{ formatMoney(item.totalAmount) }}</div>
          <div class="pending-item__time">{{ formatDateTime(item.createdAt) }}</div>
        </div>
        <el-button type="primary" size="small" plain @click.stop="goAudit(item)">
          去审核
        </el-button>
      </li>
    </ul>
  </PageCard>
</template>

<style scoped>
.pending-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pending-head__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.pending-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.pending-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
}

.pending-item + .pending-item {
  border-top: 1px solid var(--el-border-color-lighter);
}

.pending-item__main {
  flex: 1;
  min-width: 0;
}

.pending-item__no {
  font-size: 14px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.pending-item__meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pending-item__role {
  margin: 0 4px;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 11px;
  color: var(--bd-primary);
  background: var(--el-color-primary-light-9);
}

.pending-item__dot {
  margin: 0 4px;
  color: var(--el-text-color-placeholder);
}

.pending-item__side {
  flex-shrink: 0;
  text-align: right;
}

.pending-item__amount {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}

.pending-item__time {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
