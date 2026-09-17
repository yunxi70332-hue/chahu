<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { approveWithdraw, getWithdraw, rejectWithdraw } from '@/api/withdraw'
import type { Withdrawal } from '@/api/types'
import { enumMeta, formatFullDateTime, formatMoney, ROLE, WITHDRAW_METHOD, WITHDRAW_STATUS } from '@/utils/format'

/**
 * 提现审核弹窗(v2.7):展示申请人 + 收款信息,管理员「通过」(确认后扣余额记账)或
 * 两段式「驳回」(展开原因框,必填)。已审核的申请以只读态展示。
 */
const props = defineProps<{
  modelValue: boolean
  requestId: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'success'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const loading = ref(false)
const detail = ref<Withdrawal | null>(null)

const isPending = computed(() => detail.value?.status === 'PENDING')

/** 驳回两段式:先展开原因框,再确认提交 */
const rejectExpanded = ref(false)
const rejectReason = ref('')
const rejectSubmitting = ref(false)
const approveSubmitting = ref(false)

async function load() {
  if (!props.requestId) return
  loading.value = true
  rejectExpanded.value = false
  rejectReason.value = ''
  try {
    detail.value = await getWithdraw(props.requestId)
  } catch {
    detail.value = null
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.requestId],
  ([open]) => {
    if (open) void load()
  },
)

async function handleApprove() {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm(
      `确认已向 ${detail.value.accountName}(${methodLabel(detail.value)})线下打款 ${formatMoney(detail.value.amount)}?通过后将立即扣减申请人余额并记入资金流水。`,
      '确认通过',
      { type: 'warning', confirmButtonText: '确认通过', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  approveSubmitting.value = true
  try {
    await approveWithdraw(detail.value.id)
    ElMessage.success('已通过,余额已扣减并记入流水')
    emit('success')
    visible.value = false
  } finally {
    approveSubmitting.value = false
  }
}

async function handleReject() {
  if (!detail.value) return
  if (!rejectExpanded.value) {
    rejectExpanded.value = true
    return
  }
  const reason = rejectReason.value.trim()
  if (!reason) {
    ElMessage.warning('请填写驳回原因')
    return
  }
  rejectSubmitting.value = true
  try {
    await rejectWithdraw(detail.value.id, reason)
    ElMessage.success('已驳回,申请人可查看原因后重新申请')
    emit('success')
    visible.value = false
  } finally {
    rejectSubmitting.value = false
  }
}

function methodLabel(row: Withdrawal) {
  return enumMeta(WITHDRAW_METHOD, row.method).label
}

function statusMeta(row: Withdrawal) {
  return enumMeta(WITHDRAW_STATUS, row.status)
}

function roleMeta(row: Withdrawal) {
  return enumMeta(ROLE, row.user?.role)
}
</script>

<template>
  <el-dialog v-model="visible" title="提现审核" width="560px" destroy-on-close>
    <div v-loading="loading" class="review-body">
      <template v-if="detail">
        <!-- 已审核:状态条 -->
        <div v-if="!isPending" class="status-line">
          <el-tag :type="statusMeta(detail).type" effect="dark" disable-transitions>
            {{ statusMeta(detail).label }}
          </el-tag>
          <span class="status-text">
            {{
              detail.status === 'APPROVED'
                ? `已于 ${formatFullDateTime(detail.reviewedAt)} 打款记账`
                : `已于 ${formatFullDateTime(detail.reviewedAt)} 驳回`
            }}
          </span>
        </div>
        <div v-if="detail.status === 'REJECTED'" class="reject-line">
          驳回原因:{{ detail.rejectReason || '-' }}
        </div>

        <el-descriptions :column="2" border>
          <el-descriptions-item label="提现单号" :span="2">
            <span class="mono">{{ detail.wdNo }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="申请人">{{ detail.user?.name }}</el-descriptions-item>
          <el-descriptions-item label="角色">
            <el-tag :type="roleMeta(detail).type" size="small" disable-transitions>
              {{ roleMeta(detail).label }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ detail.user?.phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="申请时间">
            {{ formatFullDateTime(detail.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="提现金额" :span="2">
            <span class="amount">{{ formatMoney(detail.amount) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="收款方式">{{ methodLabel(detail) }}</el-descriptions-item>
          <el-descriptions-item label="收款人姓名">{{ detail.accountName }}</el-descriptions-item>
          <el-descriptions-item label="收款账号" :span="2">
            <span class="mono">{{ detail.account }}</span>
          </el-descriptions-item>
          <el-descriptions-item v-if="detail.transaction?.txNo" label="关联流水" :span="2">
            <span class="mono">{{ detail.transaction.txNo }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 驳回原因输入(两段式) -->
        <div v-if="isPending && rejectExpanded" class="reject-box">
          <el-input
            v-model="rejectReason"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="请填写驳回原因(申请人可见,如:收款账号与实名信息不符)"
          />
        </div>
      </template>
    </div>

    <template #footer>
      <template v-if="detail && isPending">
        <el-button @click="visible = false">关 闭</el-button>
        <el-button
          :type="rejectExpanded ? 'danger' : 'warning'"
          :plain="!rejectExpanded"
          :loading="rejectSubmitting"
          @click="handleReject"
        >
          {{ rejectExpanded ? '确认驳回' : '驳 回' }}
        </el-button>
        <el-button type="primary" :loading="approveSubmitting" @click="handleApprove">
          通过打款
        </el-button>
      </template>
      <template v-else>
        <el-button type="primary" @click="visible = false">关 闭</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
.review-body {
  min-height: 120px;
}

.status-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.status-text {
  font-size: 13px;
  color: var(--el-text-color-regular, #666);
}

.reject-line {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--el-color-danger-light-9, #fef0f0);
  color: var(--el-color-danger, #d54941);
  font-size: 13px;
  word-break: break-all;
}

.mono {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
}

.amount {
  font-size: 16px;
  font-weight: 700;
  color: var(--el-color-danger, #d54941);
  font-variant-numeric: tabular-nums;
}

.reject-box {
  margin-top: 14px;
}
</style>
