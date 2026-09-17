<script setup lang="ts">
import { computed } from 'vue'
import { displayPhone, enumMeta, formatFullDateTime, formatMoney, ROLE } from '@/utils/format'
import type { Order } from '@/api/types'
import StatusTag from '@/components/StatusTag.vue'
import { useUserStore } from '@/stores/user'

/**
 * 报单详情弹窗:展示订单全部关键字段(契约 §3 列表项结构)
 * 传入 order 即显示,关闭时 emit('close') 由父组件清空
 */
const props = defineProps<{
  order: Order | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const userStore = useUserStore()
const isAdmin = computed(() => userStore.role === 'ADMIN')

const visible = computed(() => !!props.order)

const roleMeta = computed(() => enumMeta(ROLE, props.order?.user?.role))
const specText = computed(() => props.order?.spec || '-')
const reviewerName = computed(() => props.order?.reviewer?.name || '-')
const reviewedAt = computed(() => formatFullDateTime(props.order?.reviewedAt))
const remark = computed(() => props.order?.remark || '-')
const rejectReason = computed(() => props.order?.rejectReason || '-')
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="报单详情"
    width="640px"
    append-to-body
    @update:model-value="(v: boolean) => !v && emit('close')"
  >
    <el-descriptions v-if="order" :column="2" border size="default">
      <el-descriptions-item label="报单编号" :span="2">
        <span class="mono">{{ order.orderNo }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="物流单号">
        <span :class="{ muted: !order.logisticsNo }">{{ order.logisticsNo || '-' }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="状态">
        <StatusTag :status="order.status" />
      </el-descriptions-item>
      <el-descriptions-item label="报单人">
        <span>{{ order.user?.name || '-' }}</span>
        <el-tag
          v-if="order.user?.role"
          :type="roleMeta.type"
          size="small"
          disable-transitions
          class="role-tag"
        >
          {{ roleMeta.label }}
        </el-tag>
        <span v-if="order.user?.phone" class="muted phone">{{ displayPhone(order.user.phone, isAdmin) }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="产品大类">{{ order.productType || '-' }}</el-descriptions-item>
      <el-descriptions-item label="产品名称" :span="2">
        {{ order.productName }}
        <div v-if="order.spec" class="muted spec-line">规格:{{ order.spec }}</div>
      </el-descriptions-item>
      <el-descriptions-item label="单价">{{ formatMoney(order.unitPrice) }}</el-descriptions-item>
      <el-descriptions-item label="数量">×{{ order.quantity }}</el-descriptions-item>
      <el-descriptions-item label="金额">
        <span class="amount">{{ formatMoney(order.totalAmount) }}</span>
      </el-descriptions-item>
      <el-descriptions-item v-if="isAdmin" label="差价利润">
        <span class="commission">{{ order.upstreamPrice != null ? formatMoney(order.profit ?? 0) : '-' }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="备注" :span="2">
        <span :class="{ muted: !order.remark }">{{ remark }}</span>
      </el-descriptions-item>
      <el-descriptions-item v-if="order.status === 'REJECTED'" label="驳回原因" :span="2">
        <span class="reject-reason">{{ rejectReason }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="审核人">
        <span :class="{ muted: !order.reviewer }">{{ reviewerName }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="审核时间">
        <span :class="{ muted: !order.reviewedAt }">{{ reviewedAt }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="提交时间" :span="2">
        {{ formatFullDateTime(order.createdAt) }}
      </el-descriptions-item>
    </el-descriptions>
    <template #footer>
      <el-button @click="emit('close')">关 闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.mono {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
}

.muted {
  color: var(--el-text-color-secondary, #999);
}

.role-tag {
  margin-left: 6px;
}

.phone {
  margin-left: 6px;
  font-size: 12px;
}

.spec-line {
  margin-top: 2px;
  font-size: 12px;
}

.amount {
  font-weight: 600;
  color: var(--el-text-color-primary, #333);
  font-variant-numeric: tabular-nums;
}

.commission {
  font-weight: 600;
  color: var(--el-color-success, #2ba471);
  font-variant-numeric: tabular-nums;
}

.reject-reason {
  color: var(--el-color-danger, #d54941);
}
</style>
