<script setup lang="ts">
/**
 * 状态分布卡(占宽 1/3):环形图,PENDING 橙 / APPROVED 绿 / REJECTED 红,
 * 中心显示报单总数
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import PageCard from '@/components/PageCard.vue'
import { ORDER_STATUS } from '@/utils/format'
import type { DashboardStatusItem, OrderStatus } from '@/api/types'

const props = defineProps<{
  data: DashboardStatusItem[]
}>()

/** 契约 §8 状态配色 */
const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING: '#E37318',
  APPROVED: '#2BA471',
  REJECTED: '#D54941',
}
const STATUS_ORDER: OrderStatus[] = ['PENDING', 'APPROVED', 'REJECTED']

const chartEl = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null

function render() {
  if (!chart) return
  const countOf = new Map(props.data.map((d) => [d.status, d.count]))
  const list = STATUS_ORDER.map((status) => ({
    name: ORDER_STATUS[status]?.label || status,
    value: countOf.get(status) ?? 0,
    itemStyle: { color: STATUS_COLOR[status] },
  }))
  const total = list.reduce((sum, d) => sum + d.value, 0)

  chart.setOption(
    {
      tooltip: {
        trigger: 'item',
        formatter: '{b}:{c} 单({d}%)',
      },
      legend: {
        bottom: 0,
        icon: 'circle',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: '#666' },
      },
      title: {
        text: total.toLocaleString('zh-CN'),
        subtext: '报单总数',
        left: 'center',
        top: '36%',
        itemGap: 6,
        textStyle: { fontSize: 26, fontWeight: 700, color: '#333' },
        subtextStyle: { fontSize: 12, color: '#999' },
      },
      series: [
        {
          type: 'pie',
          radius: ['52%', '72%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          label: {
            show: true,
            formatter: '{b} {c}',
            color: '#666',
            fontSize: 12,
          },
          labelLine: { length: 12, length2: 8, lineStyle: { color: '#C0C4CC' } },
          emphasis: {
            label: { show: true, fontWeight: 600 },
          },
          data: list,
        },
      ],
    },
    true,
  )
}

function resize() {
  chart?.resize()
}

onMounted(() => {
  chart = echarts.init(chartEl.value!)
  window.addEventListener('resize', resize)
  render()
})

watch(
  () => props.data,
  () => render(),
  { deep: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
  chart = null
})
</script>

<template>
  <PageCard title="报单状态分布">
    <div ref="chartEl" class="donut-chart" />
  </PageCard>
</template>

<style scoped>
.donut-chart {
  width: 100%;
  height: 300px;
}
</style>
