<script setup lang="ts">
/**
 * 看板页:/dashboard
 * 结构(契约 §2 /dashboard/stats):6 张指标卡 → 趋势(2/3)+ 状态分布(1/3)→
 * 品类分布(1/2)+ 最新待审(1/2);金额用 formatMoney,计数用 toLocaleString('zh-CN')
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import StatCard from './components/StatCard.vue'
import TrendChartCard from './components/TrendChartCard.vue'
import StatusDonutCard from './components/StatusDonutCard.vue'
import CategoryBarCard from './components/CategoryBarCard.vue'
import LatestPendingCard from './components/LatestPendingCard.vue'
import { getDashboardStats } from '@/api/dashboard'
import { formatMoney } from '@/utils/format'
import type { DashboardStats } from '@/api/types'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()
const isAdmin = computed(() => userStore.role === 'ADMIN')

const loading = ref(true)
const stats = ref<DashboardStats | null>(null)

function fmtCount(value: unknown): string {
  const n = Number(value)
  return (Number.isFinite(n) ? n : 0).toLocaleString('zh-CN')
}

interface CardItem {
  key: string
  title: string
  subtitle?: string
  value: string
  icon: string
  tone?: 'default' | 'primary' | 'warning'
  to?: string
}

/** 6 张指标卡配置(今日打款主色强调;待审核警示橙 + 整卡可跳待审列表) */
const cards = computed<CardItem[]>(() => {
  const c = stats.value?.cards
  return [
    {
      key: 'todayOrders',
      title: '今日报单数',
      value: fmtCount(c?.todayOrders),
      icon: 'Tickets',
    },
    {
      key: 'todayAmount',
      title: '今日报单金额',
      value: formatMoney(c?.todayAmount),
      icon: 'Money',
    },
    {
      key: 'todayPayout',
      title: '今日打款',
      subtitle: '按收购价',
      value: formatMoney(c?.todayPayout),
      icon: 'Wallet',
      tone: 'primary' as const,
    },
    {
      key: 'todayWithdraw',
      title: '今日提现',
      value: formatMoney(c?.todayWithdraw),
      icon: 'CreditCard',
    },
    {
      key: 'pendingCount',
      title: '待审核',
      value: fmtCount(c?.pendingCount),
      icon: 'Clock',
      tone: 'warning' as const,
      to: '/orders?status=PENDING',
    },
    {
      key: 'userCount',
      title: '用户数',
      value: fmtCount(c?.userCount),
      icon: 'User',
    },
    // v2.4 差价利润仅总部可见
    ...(isAdmin.value
      ? [
          {
            key: 'todayProfit',
            title: '今日差价利润',
            subtitle: '上游价 − 收购价',
            value: formatMoney(c?.todayProfit),
            icon: 'TrendCharts',
            tone: 'primary' as const,
          },
        ]
      : []),
  ]
})

onMounted(async () => {
  try {
    stats.value = await getDashboardStats(7)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div v-loading="loading" class="dashboard">
    <!-- 指标卡区:≥1600px 一行 6 张 / ≥1200px 一行 3 张 / 更窄一行 2 张 -->
    <div class="stat-grid">
      <StatCard
        v-for="card in cards"
        :key="card.key"
        :title="card.title"
        :value="card.value"
        :subtitle="card.subtitle"
        :icon="card.icon"
        :tone="card.tone"
        :to="card.to"
        @jump="card.to && router.push(card.to)"
      />
    </div>

    <!-- 趋势 2/3 + 状态分布 1/3 -->
    <el-row :gutter="16" class="dashboard-row">
      <el-col :xs="24" :md="16">
        <TrendChartCard />
      </el-col>
      <el-col :xs="24" :md="8">
        <StatusDonutCard :data="stats?.statusDist ?? []" />
      </el-col>
    </el-row>

    <!-- 品类分布 1/2 + 最新待审 1/2 -->
    <el-row :gutter="16" class="dashboard-row">
      <el-col :xs="24" :md="12">
        <CategoryBarCard :data="stats?.categoryDist ?? []" />
      </el-col>
      <el-col :xs="24" :md="12">
        <LatestPendingCard :list="stats?.latestPending ?? []" />
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.dashboard {
  /* 抵消 el-row 的负外边距,保证卡片与指标卡区左对齐 */
  padding: 0 8px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

/* 防止大数字的最小内容宽度撑破网格轨道(移动端横向溢出) */
.stat-grid > * {
  min-width: 0;
}

@media (min-width: 1200px) {
  .stat-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1600px) {
  .stat-grid {
    grid-template-columns: repeat(6, 1fr);
  }
}

.dashboard-row .el-col {
  margin-bottom: 16px;
}

/* 最后一行不需要额外下边距 */
.dashboard-row:last-child .el-col {
  margin-bottom: 0;
}
</style>
