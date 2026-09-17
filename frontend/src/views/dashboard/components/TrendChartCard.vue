<script setup lang="ts">
/**
 * 趋势卡(占宽 2/3):近 7/30 天报单金额与打款双折线(ECharts)
 * 右上 el-radio-group 切换天数,重新调 /dashboard/stats?days=N 后 setOption 更新
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as echarts from 'echarts'
import PageCard from '@/components/PageCard.vue'
import { getDashboardStats } from '@/api/dashboard'
import type { DashboardTrendItem } from '@/api/types'

const COLOR_ORDER = '#0052D9'
const COLOR_PAYOUT = '#2BA471'

const days = ref<7 | 30>(7)
const loading = ref(false)

const chartEl = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null

/** MM-DD */
function shortDate(date: string): string {
  return date.slice(5)
}

function fmtMoney(value: unknown): string {
  const n = Number(value)
  return `¥${(Number.isFinite(n) ? n : 0).toLocaleString('zh-CN')}`
}

function render(trend: DashboardTrendItem[]) {
  if (!chart) return
  chart.setOption(
    {
      color: [COLOR_ORDER, COLOR_PAYOUT],
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: unknown) => fmtMoney(value),
      },
      legend: {
        data: ['报单金额', '打款'],
        top: 0,
        right: 0,
        icon: 'roundRect',
        itemWidth: 14,
        itemHeight: 4,
        textStyle: { color: '#666' },
      },
      grid: { left: 8, right: 16, top: 40, bottom: 0, containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: trend.map((t) => shortDate(t.date)),
        axisLine: { lineStyle: { color: '#E8E8E8' } },
        axisTick: { show: false },
        axisLabel: { color: '#999' },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#F2F3F5' } },
        axisLabel: {
          color: '#999',
          formatter: (value: number) => value.toLocaleString('zh-CN'),
        },
      },
      series: [
        {
          name: '报单金额',
          type: 'line',
          smooth: true,
          symbolSize: 6,
          data: trend.map((t) => t.orderAmount),
        },
        {
          name: '打款',
          type: 'line',
          smooth: true,
          symbolSize: 6,
          data: trend.map((t) => t.payout),
        },
      ],
    },
    true,
  )
}

async function load() {
  loading.value = true
  try {
    const data = await getDashboardStats(days.value)
    render(data.trend)
  } finally {
    loading.value = false
  }
}

function resize() {
  chart?.resize()
}

onMounted(() => {
  chart = echarts.init(chartEl.value!)
  window.addEventListener('resize', resize)
  load()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
  chart = null
})
</script>

<template>
  <PageCard v-loading="loading">
    <template #header>
      <div class="trend-head">
        <h3 class="trend-head__title">近 {{ days }} 天报单与打款趋势</h3>
        <el-radio-group v-model="days" size="small" @change="load">
          <el-radio-button :value="7">近 7 天</el-radio-button>
          <el-radio-button :value="30">近 30 天</el-radio-button>
        </el-radio-group>
      </div>
    </template>
    <div ref="chartEl" class="trend-chart" />
  </PageCard>
</template>

<style scoped>
.trend-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.trend-head__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.trend-chart {
  width: 100%;
  height: 300px;
}
</style>
