<script setup lang="ts">
/**
 * 品类分布卡(占宽 1/2):横向条形图,主色渐变 + 右侧数量标签
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import PageCard from '@/components/PageCard.vue'
import type { DashboardCategoryItem } from '@/api/types'

const props = defineProps<{
  data: DashboardCategoryItem[]
}>()

const chartEl = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null

function render() {
  if (!chart) return
  // 升序排列,ECharts category 轴自下而上渲染 → 数量最多的品类显示在最上
  const sorted = [...props.data].sort((a, b) => a.count - b.count)

  chart.setOption(
    {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const p = (params as { name: string; value: number }[])[0]
          return `${p.name}:${p.value.toLocaleString('zh-CN')} 单`
        },
      },
      grid: { left: 8, right: 44, top: 10, bottom: 0, containLabel: true },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#F2F3F5' } },
        axisLabel: {
          color: '#999',
          formatter: (value: number) => value.toLocaleString('zh-CN'),
        },
      },
      yAxis: {
        type: 'category',
        data: sorted.map((d) => d.category),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#E8E8E8' } },
        axisLabel: { color: '#666' },
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 18,
          data: sorted.map((d) => d.count),
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#80A9EC' },
              { offset: 1, color: '#0052D9' },
            ]),
          },
          label: {
            show: true,
            position: 'right',
            color: '#666',
            fontSize: 12,
            formatter: ({ value }: { value: number }) => value.toLocaleString('zh-CN'),
          },
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
  <PageCard title="品类分布 TOP8">
    <div ref="chartEl" class="bar-chart" />
  </PageCard>
</template>

<style scoped>
.bar-chart {
  width: 100%;
  height: 300px;
}
</style>
