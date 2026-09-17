<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { adjustUserBalance } from '@/api/users'
import type { SystemUser } from '@/api/types'
import { formatMoney } from '@/utils/format'

/**
 * 余额调整弹窗(记账):
 * - RECHARGE 补款(+) / WITHDRAW 提现(−) / ADJUST 调整(amount 可正负)
 * - 备注必填;实时预览确认后余额,为负则警示并禁用确认(后端同样 400 兜底)
 */
const props = defineProps<{
  modelValue: boolean
  user?: SystemUser | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'success'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

type AdjustType = 'RECHARGE' | 'WITHDRAW' | 'ADJUST'

const form = reactive({
  type: 'RECHARGE' as AdjustType,
  amount: null as number | null,
  remark: '',
})

const submitting = ref(false)

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    form.type = 'RECHARGE'
    form.amount = null
    form.remark = ''
    submitting.value = false
  },
)

/** 补款/提现必须 >0;调整可正负(0 无意义视为未填) */
const amountMin = computed(() => (form.type === 'ADJUST' ? -Infinity : 0.01))

/** 实时预览:确认后余额 = 当前余额 ± 金额 */
const previewBalance = computed(() => {
  const base = Number(props.user?.balance ?? 0)
  const amt = Number(form.amount)
  if (!Number.isFinite(amt)) return base
  return base + amt
})

/** 是否已输入有效金额(el-input-number 空值为 null,Number(null)===0 需排除) */
const hasAmount = computed(() => form.amount !== null && Number.isFinite(form.amount))

/** 预览为负 → 「余额不足」且禁用确认(契约:调整后余额为负 400) */
const insufficient = computed(() => hasAmount.value && previewBalance.value < 0)

const canSubmit = computed(() => {
  const amt = Number(form.amount)
  if (!Number.isFinite(amt)) return false
  if (form.type === 'ADJUST' ? amt === 0 : amt <= 0) return false
  if (!form.remark.trim()) return false
  return !insufficient.value
})

async function submit() {
  if (!props.user || !canSubmit.value || submitting.value) return
  const amt = Number(form.amount)
  submitting.value = true
  try {
    await adjustUserBalance(props.user.id, {
      type: form.type,
      // 契约:WITHDRAW 取绝对值记账;RECHARGE/ADJUST 按填写的符号
      amount: form.type === 'WITHDRAW' ? Math.abs(amt) : amt,
      remark: form.remark.trim(),
    })
    ElMessage.success('余额调整成功,已记入资金流水')
    visible.value = false
    emit('success')
  } catch {
    /* 失败提示由 http 拦截器统一处理 */
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="余额调整"
    width="480px"
    :close-on-click-modal="false"
    @submit.prevent
  >
    <div v-if="user" class="balance-dialog">
      <!-- 当前余额 -->
      <div class="current-balance">
        <span class="current-balance__label">当前余额</span>
        <span class="current-balance__value">{{ formatMoney(user.balance) }}</span>
      </div>

      <!-- 类型 -->
      <div class="field">
        <div class="field__label">调整类型</div>
        <el-radio-group v-model="form.type">
          <el-radio-button value="RECHARGE">补款 +</el-radio-button>
          <el-radio-button value="WITHDRAW">提现 −</el-radio-button>
          <el-radio-button value="ADJUST">调整 ±</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 金额 -->
      <div class="field">
        <div class="field__label">
          金额（元）
          <span class="field__hint">
            {{ form.type === 'ADJUST' ? '可正可负,正加负减' : form.type === 'WITHDRAW' ? '从余额扣减' : '增加到余额' }}
          </span>
        </div>
        <el-input-number
          v-model="form.amount"
          :min="amountMin"
          :max="Infinity"
          :precision="2"
          :step="100"
          :controls-position="'right'"
          class="amount-input"
          placeholder="请输入金额"
        />
      </div>

      <!-- 备注(必填) -->
      <div class="field">
        <div class="field__label">
          备注 <span class="field__required">*必填</span>
        </div>
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="如:9/15 线下转账提现,工行尾号8899"
        />
      </div>

      <!-- 实时预览 -->
      <div class="preview" :class="{ 'preview--danger': insufficient }">
        <template v-if="hasAmount">
          <div class="preview__line">
            确认后余额
            <span class="preview__money">{{ formatMoney(user.balance) }}</span>
            →
            <span class="preview__money" :class="insufficient ? 'preview__money--bad' : 'preview__money--ok'">
              {{ formatMoney(previewBalance) }}
            </span>
            ,并记入资金流水。
          </div>
          <div v-if="insufficient" class="preview__warn">余额不足:调整后余额不能为负,请核对金额</div>
        </template>
        <div v-else class="preview__line preview__line--muted">输入金额后预览确认后余额</div>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!canSubmit" :loading="submitting" @click="submit">
        确认调整
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.balance-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 当前余额大字 */
.current-balance {
  padding: 14px 16px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 8px;
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.current-balance__label {
  font-size: 13px;
  color: var(--el-text-color-regular, #666);
}

.current-balance__value {
  font-size: 26px;
  font-weight: 700;
  color: var(--el-text-color-primary, #333);
  font-variant-numeric: tabular-nums;
}

.field__label {
  font-size: 13px;
  color: var(--el-text-color-regular, #666);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.field__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
}

.field__required {
  font-size: 12px;
  color: var(--el-color-danger, #d54941);
}

.amount-input {
  width: 100%;
}

/* 预览行 */
.preview {
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--el-color-primary-light-9, #e6eefb);
  font-size: 13px;
  color: var(--el-text-color-regular, #666);
}

.preview--danger {
  background: var(--el-color-danger-light-9, #fbedec);
}

.preview__line--muted {
  color: var(--el-text-color-secondary, #999);
}

.preview__money {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary, #333);
}

.preview__money--ok {
  color: var(--el-color-primary, #0052d9);
}

.preview__money--bad,
.preview__warn {
  color: var(--el-color-danger, #d54941);
}

.preview__warn {
  margin-top: 4px;
  font-weight: 600;
}
</style>
