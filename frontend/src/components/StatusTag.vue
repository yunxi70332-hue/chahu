<script setup lang="ts">
import { computed } from 'vue'
import { enumMeta, ORDER_STATUS } from '@/utils/format'

/**
 * 报单状态三色标签:PENDING=warning 待审核 / APPROVED=success 已通过 / REJECTED=danger 已驳回
 */
const props = defineProps<{
  status?: string | null
}>()

const meta = computed(() => enumMeta(ORDER_STATUS, props.status))
</script>

<template>
  <el-tag :type="meta.type" disable-transitions>{{ meta.label }}</el-tag>
</template>
