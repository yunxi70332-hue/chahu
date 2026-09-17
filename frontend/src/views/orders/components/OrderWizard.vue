<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { createOrder } from '@/api/orders'
import { getUserOptions } from '@/api/users'
import type { Order, Product, UserOption } from '@/api/types'
import { displayPhone, formatMoney } from '@/utils/format'
import { useUserStore } from '@/stores/user'
import ProductPicker from './ProductPicker.vue'

/**
 * 新建报单三步向导:选品 → 确认信息 → 完成
 * v2.4 中介模式:单价默认代理收购价(上游价已按下浮),可议价;无佣金字段,
 * 审核通过后按货款(单价×数量)打款
 */
const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'created', order: Order): void
}>()

const userStore = useUserStore()
const isAdmin = computed(() => userStore.role === 'ADMIN')

const step = ref<1 | 2 | 3>(1)

/* ---- Step1 选品 ---- */
const product = ref<Product | null>(null)

/* ---- Step2 确认信息 ---- */
const form = reactive({
  unitPrice: null as number | null,
  quantity: 1 as number | null,
  targetUserId: null as number | null,
  logisticsNo: '',
  remark: '',
})

const userOptions = ref<UserOption[]>([])

/** 产品摘要:「{name} · {spec或颜色} · {大类}」 */
const productSummary = computed(() => {
  const p = product.value
  if (!p) return ''
  const spec = [p.memory, p.disk].filter(Boolean).join('/') || p.color || p.model || ''
  return [p.name, spec || '-', p.category].join(' · ')
})

/** 合计 = 货款(单价 × 数量),审核通过后即为打款金额 */
const totalAmount = computed(() => (form.unitPrice || 0) * (form.quantity || 0))

/* ---- Step3 完成 ---- */
const createdOrder = ref<Order | null>(null)

/* ---- 提交 ---- */
const submitting = ref(false)

async function loadUserOptions() {
  if (!isAdmin.value) return
  try {
    userOptions.value = await getUserOptions()
    // 默认选中自己(ADMIN 代客下单,可改选他人)
    const self = userOptions.value.find((u) => u.id === userStore.userInfo?.id)
    form.targetUserId = self?.id ?? userOptions.value[0]?.id ?? null
  } catch {
    userOptions.value = []
  }
}

function resetAll() {
  step.value = 1
  product.value = null
  form.unitPrice = null
  form.quantity = 1
  form.targetUserId = null
  form.logisticsNo = ''
  form.remark = ''
  createdOrder.value = null
  loadUserOptions()
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) resetAll()
  },
)

function close() {
  emit('update:modelValue', false)
}

/* ---- 步骤流转 ---- */

function goNextFromPicker() {
  if (!product.value) return
  // 进入确认信息:单价默认代理收购价
  form.unitPrice = product.value.price ?? 0
  form.quantity = 1
  step.value = 2
}

function backToPicker() {
  step.value = 1
}

function restartWizard() {
  resetAll()
}

function finishWizard() {
  close()
}

async function submit() {
  if (!product.value) {
    ElMessage.warning('请先选择产品')
    step.value = 1
    return
  }
  const unitPrice = Number(form.unitPrice)
  const quantity = Number(form.quantity)
  if (!(unitPrice >= 0.01)) {
    ElMessage.warning('单价不能低于 0.01')
    return
  }
  if (!(quantity >= 1 && quantity <= 999 && Number.isInteger(quantity))) {
    ElMessage.warning('数量需为 1-999 的整数')
    return
  }
  if (isAdmin.value && !form.targetUserId) {
    ElMessage.warning('请选择报单人')
    return
  }

  submitting.value = true
  try {
    const order = await createOrder({
      productId: product.value.id,
      quantity,
      logisticsNo: form.logisticsNo.trim() || undefined,
      remark: form.remark.trim() || undefined,
      userId: isAdmin.value ? form.targetUserId! : undefined,
    })
    createdOrder.value = order
    step.value = 3
    emit('created', order)
  } catch {
    /* 拦截器已提示 */
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="新建报单"
    width="720px"
    :close-on-click-modal="false"
    destroy-on-close
    append-to-body
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <el-steps :active="step - 1" align-center finish-status="success" class="wizard-steps">
      <el-step title="选品" />
      <el-step title="确认信息" />
      <el-step title="完成" />
    </el-steps>

    <!-- Step1 选品 -->
    <div v-if="step === 1" class="wizard-body">
      <ProductPicker v-model="product" />
    </div>

    <!-- Step2 确认信息 -->
    <div v-else-if="step === 2" class="wizard-body">
      <!-- 选中产品摘要条 -->
      <div class="summary-bar">
        <span class="summary-text">{{ productSummary }}</span>
        <el-button link type="primary" @click="backToPicker">重新选品</el-button>
      </div>

      <el-form label-width="92px" class="confirm-form">
        <el-form-item v-if="isAdmin" label="报单人" required>
          <el-select
            v-model="form.targetUserId"
            placeholder="请选择报单人"
            filterable
            class="full-width"
          >
            <el-option
              v-for="u in userOptions"
              :key="u.id"
              :label="`${u.name}(${displayPhone(u.phone, isAdmin)})`"
              :value="u.id"
            >
              <span>{{ u.name }}</span>
              <span class="option-phone">{{ displayPhone(u.phone, isAdmin) }}</span>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="单价">
          <el-input-number
            v-model="form.unitPrice"
            :min="0.01"
            :precision="2"
            :step="100"
            :controls="false"
            class="num-input"
          />
          <span class="form-tip">默认代理收购价,可与客户议价后修改</span>
        </el-form-item>

        <el-form-item label="数量">
          <el-input-number
            v-model="form.quantity"
            :min="1"
            :max="999"
            :step="1"
            step-strictly
            class="num-input"
          />
        </el-form-item>

        <el-form-item label="物流单号">
          <el-input
            v-model="form.logisticsNo"
            placeholder="选填,如 SF1234567890"
            maxlength="50"
            class="full-width"
          />
        </el-form-item>

        <el-form-item label="备注">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="选填"
          />
        </el-form-item>
      </el-form>

      <!-- 合计 -->
      <div class="total-bar">
        <div class="total-line">
          <span class="total-label">合计货款</span>
          <span class="total-value">{{ formatMoney(totalAmount) }}</span>
        </div>
        <p class="total-hint">审核通过后按货款自动打款到余额</p>
      </div>
    </div>

    <!-- Step3 完成 -->
    <div v-else class="wizard-body">
      <el-result icon="success" title="报单提交成功" sub-title="等待审核,通过后按货款自动打款到余额">
        <template #sub-title>
          <p class="result-sub">
            等待审核,通过后按货款自动打款到余额
            <template v-if="createdOrder">
              <br />
              报单编号:<span class="mono order-no">{{ createdOrder.orderNo }}</span>
            </template>
          </p>
        </template>
        <template #extra>
          <el-button @click="restartWizard">继续报单</el-button>
          <el-button type="primary" @click="finishWizard">完 成</el-button>
        </template>
      </el-result>
    </div>

    <!-- 底部按钮 -->
    <template #footer>
      <template v-if="step === 1">
        <el-button @click="close">取 消</el-button>
        <el-button type="primary" :disabled="!product" @click="goNextFromPicker">
          下一步
        </el-button>
      </template>
      <template v-else-if="step === 2">
        <el-button :disabled="submitting" @click="backToPicker">上一步</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">提交报单</el-button>
      </template>
      <template v-else>
        <span></span>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
.wizard-steps {
  padding: 4px 0 16px;
}

.wizard-body {
  min-height: 320px;
}

/* ---- Step2 ---- */
.summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  margin-bottom: 16px;
  background: var(--el-color-primary-light-9, #e6eefb);
  border-radius: 6px;
}

.summary-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary, #333);
}

.confirm-form {
  max-width: 560px;
}

.full-width {
  width: 100%;
}

.num-input {
  width: 180px;
}

.form-tip {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
}

.option-phone {
  float: right;
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
}

.total-bar {
  margin-top: 8px;
  padding: 14px 16px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 6px;
}

.total-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.total-label {
  font-size: 14px;
  color: var(--el-text-color-regular, #666);
}

.total-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-color-primary, #0052d9);
  font-variant-numeric: tabular-nums;
}

.total-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
  text-align: right;
}

/* ---- Step3 ---- */
.result-sub {
  margin: 0;
  line-height: 1.8;
  color: var(--el-text-color-regular, #666);
}

.mono {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.order-no {
  font-weight: 700;
  color: var(--el-text-color-primary, #333);
}
</style>
