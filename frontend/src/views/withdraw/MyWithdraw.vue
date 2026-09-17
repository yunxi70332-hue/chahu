<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Coin, Money, WarningFilled } from '@element-plus/icons-vue'

import PageCard from '@/components/PageCard.vue'
import {
  cancelWithdraw,
  createWithdraw,
  listWithdraws,
} from '@/api/withdraw'
import { getMyRealname } from '@/api/realname'
import type { Withdrawal, WithdrawMethod } from '@/api/types'
import {
  enumMeta,
  formatDateTime,
  formatFullDateTime,
  formatMoney,
  REALNAME_STATUS,
  WITHDRAW_METHOD,
  WITHDRAW_STATUS,
} from '@/utils/format'
import { useUserStore } from '@/stores/user'

/**
 * 我的提现(v2.7,AGENT/MEMBER):余额卡(当前余额/可用余额)→ 申请提现弹窗 →
 * 我的申请记录(状态/驳回原因/流水号,待审可撤销)。须已实名通过才能申请。
 */
const PAGE_SIZE = 10

const router = useRouter()
const userStore = useUserStore()

/* ---- 实名状态(未通过则引导先实名) ---- */
const realnameStatus = ref<string>('NONE')
const realName = ref('')

/* ---- 余额 ---- */
const balance = ref(0)
const pendingSum = ref(0)
/** 可用余额 = 余额 − 待审中提现合计(与后端同口径) */
const available = computed(() => Math.round((balance.value - pendingSum.value) * 100) / 100)

/* ---- 列表 ---- */
const loading = ref(false)
const list = ref<Withdrawal[]>([])
const total = ref(0)
const page = ref(1)

async function loadList() {
  loading.value = true
  try {
    const res = await listWithdraws({ page: page.value, pageSize: PAGE_SIZE })
    list.value = res.list
    total.value = res.total
    pendingSum.value = res.pendingSum ?? 0
  } catch {
    /* 失败提示由 http 拦截器统一处理 */
  } finally {
    loading.value = false
  }
}

async function loadProfile() {
  // 刷新 store 余额与实名状态;/auth/me 与实名接口双拉,保证页面打开即最新
  const [me] = await Promise.allSettled([userStore.fetchMe(), getMyRealname()])
  if (me.status === 'fulfilled') {
    balance.value = Number(me.value.balance) || 0
    realnameStatus.value = me.value.realnameStatus || 'NONE'
  }
  try {
    const rn = await getMyRealname()
    realnameStatus.value = rn.realnameStatus
    realName.value = rn.realName || ''
  } catch {
    /* 实名信息拉取失败不阻断页面 */
  }
}

onMounted(() => {
  void loadProfile()
  void loadList()
})

/* ---- 申请弹窗 ---- */
const dialogVisible = ref(false)
const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = reactive({
  amount: undefined as number | undefined,
  method: 'ALIPAY' as WithdrawMethod,
  account: '',
  accountName: '',
})

const canApply = computed(() => realnameStatus.value === 'APPROVED')

const methodOptions = (Object.keys(WITHDRAW_METHOD) as WithdrawMethod[]).map((m) => ({
  value: m,
  label: enumMeta(WITHDRAW_METHOD, m).label,
}))

const rules: FormRules = {
  amount: [
    { required: true, message: '请输入提现金额', trigger: 'blur' },
    {
      validator: (_rule, value: number, callback) => {
        const n = Number(value)
        if (!Number.isFinite(n) || n <= 0) return callback(new Error('提现金额必须大于 0'))
        if (n > available.value) return callback(new Error(`超出可用余额 ¥${available.value.toFixed(2)}`))
        callback()
      },
      trigger: 'blur',
    },
  ],
  account: [{ required: true, message: '请输入收款账号', trigger: 'blur' }],
  accountName: [{ required: true, message: '请输入收款人姓名', trigger: 'blur' }],
}

function openApply() {
  form.amount = undefined
  form.method = 'ALIPAY'
  form.account = ''
  form.accountName = realName.value || ''
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await createWithdraw({
      amount: Number(form.amount),
      method: form.method,
      account: form.account.trim(),
      accountName: form.accountName.trim(),
    })
    ElMessage.success('申请已提交,等待管理员审核')
    dialogVisible.value = false
    await Promise.all([loadList(), loadProfile()])
  } finally {
    submitting.value = false
  }
}

/* ---- 撤销 ---- */
async function handleCancel(row: Withdrawal) {
  try {
    await ElMessageBox.confirm(
      `确定撤销提现申请 ${row.wdNo} 吗?撤销后金额立即恢复可用。`,
      '撤销申请',
      { type: 'warning', confirmButtonText: '确定撤销', cancelButtonText: '再想想' },
    )
  } catch {
    return
  }
  await cancelWithdraw(row.id)
  ElMessage.success('已撤销')
  await Promise.all([loadList(), loadProfile()])
}

/* ---- 展示 ---- */
function statusMeta(row: Withdrawal) {
  return enumMeta(WITHDRAW_STATUS, row.status)
}

function methodLabel(row: Withdrawal) {
  return enumMeta(WITHDRAW_METHOD, row.method).label
}
</script>

<template>
  <div class="my-withdraw-page">
    <!-- 未实名/审核中/被驳回:引导横幅 -->
    <div v-if="!canApply" class="realname-banner">
      <el-icon :size="18"><WarningFilled /></el-icon>
      <span class="banner-text">
        {{
          realnameStatus === 'PENDING'
            ? '实名资料审核中,审核通过后即可申请提现'
            : realnameStatus === 'REJECTED'
              ? '实名认证未通过,请重新提交后再申请提现'
              : '您还未完成实名认证,完成认证后才能申请提现'
        }}
      </span>
      <el-tag
        v-if="realnameStatus !== 'NONE'"
        :type="enumMeta(REALNAME_STATUS, realnameStatus).type"
        size="small"
        disable-transitions
      >
        {{ enumMeta(REALNAME_STATUS, realnameStatus).label }}
      </el-tag>
      <el-button
        v-if="realnameStatus !== 'PENDING'"
        type="primary"
        size="small"
        plain
        @click="router.push('/realname')"
      >
        去实名认证
      </el-button>
    </div>

    <PageCard>
      <!-- 余额卡 -->
      <div class="balance-bar">
        <div class="balance-item">
          <el-icon class="balance-icon" :size="22"><Money /></el-icon>
          <div class="balance-meta">
            <div class="balance-label">当前余额</div>
            <div class="balance-value">{{ formatMoney(balance) }}</div>
          </div>
        </div>
        <el-divider direction="vertical" class="balance-divider" />
        <div class="balance-item">
          <el-icon class="balance-icon is-cyan" :size="22"><Coin /></el-icon>
          <div class="balance-meta">
            <div class="balance-label">可用余额(不含审核中)</div>
            <div class="balance-value is-cyan">{{ formatMoney(available) }}</div>
          </div>
        </div>
        <div class="balance-actions">
          <el-button type="primary" :disabled="!canApply" @click="openApply">申请提现</el-button>
        </div>
      </div>

      <!-- 申请记录表 -->
      <el-table v-loading="loading" :data="list" row-key="id" class="wd-table">
        <el-table-column label="提现单号" width="190">
          <template #default="{ row }">
            <span class="wdno">{{ row.wdNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="120">
          <template #default="{ row }">
            <span class="cell-muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="金额" min-width="110" align="right">
          <template #default="{ row }">
            <span class="cell-amount money-expense">−{{ formatMoney(row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="收款方式" width="90">
          <template #default="{ row }">{{ methodLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="收款信息" min-width="180">
          <template #default="{ row }">
            <div class="account-cell">
              <span class="account-name">{{ row.accountName }}</span>
              <span class="account-no">{{ row.account }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="statusMeta(row).type" disable-transitions>{{ statusMeta(row).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审核信息" min-width="190">
          <template #default="{ row }">
            <div v-if="row.status === 'REJECTED'" class="audit-cell is-danger">
              驳回原因:{{ row.rejectReason || '-' }}
            </div>
            <div v-else-if="row.status === 'APPROVED'" class="audit-cell">
              <span class="audit-txno">{{ row.transaction?.txNo }}</span>
              <span class="audit-time">{{ formatFullDateTime(row.reviewedAt) }} 已打款</span>
            </div>
            <div v-else class="audit-cell is-muted">审核中,请耐心等待</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'PENDING'"
              link
              type="danger"
              size="small"
              @click="handleCancel(row)"
            >
              撤销
            </el-button>
            <span v-else class="cell-muted">-</span>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无提现申请" :image-size="80" />
        </template>
      </el-table>

      <!-- 分页 -->
      <div class="pager">
        <el-pagination
          background
          layout="total, prev, pager, next"
          :total="total"
          :page-size="PAGE_SIZE"
          :current-page="page"
          @current-change="(p: number) => { page = p; loadList() }"
        />
      </div>
    </PageCard>

    <!-- 申请提现弹窗 -->
    <el-dialog v-model="dialogVisible" title="申请提现" width="460px" destroy-on-close>
      <el-alert
        class="apply-alert"
        type="info"
        :closable="false"
        :title="`可用余额 ${formatMoney(available)},打款由管理员线下转账后审核记账`"
      />
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px" @submit.prevent>
        <el-form-item label="提现金额" prop="amount">
          <el-input-number
            v-model="form.amount"
            :min="0.01"
            :max="available"
            :precision="2"
            :controls="false"
            placeholder="请输入金额"
            class="amount-input"
          />
        </el-form-item>
        <el-form-item label="收款方式" prop="method">
          <el-radio-group v-model="form.method">
            <el-radio-button
              v-for="opt in methodOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="收款账号" prop="account">
          <el-input
            v-model="form.account"
            :placeholder="form.method === 'BANK' ? '请输入银行卡号' : '请输入支付宝 / 微信账号'"
            maxlength="100"
            clearable
          />
        </el-form-item>
        <el-form-item label="收款人姓名" prop="accountName">
          <el-input v-model="form.accountName" maxlength="50" clearable placeholder="请输入收款人姓名" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">提交申请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.my-withdraw-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ---- 未实名引导横幅 ---- */
.realname-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--el-color-warning-light-9, #fdf6ec);
  border: 1px solid var(--el-color-warning-light-5, #f3d19e);
  color: var(--el-color-warning, #e37318);
}

.banner-text {
  flex: 1;
  font-size: 14px;
}

/* ---- 余额卡 ---- */
.balance-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  margin-bottom: 14px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 8px;
  flex-wrap: wrap;
}

.balance-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.balance-icon {
  color: var(--bd-primary, #0052d9);
}

.balance-icon.is-cyan {
  color: #10909b;
}

.balance-label {
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
}

.balance-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--el-text-color-primary, #333);
  font-variant-numeric: tabular-nums;
}

.balance-value.is-cyan {
  color: #10909b;
}

.balance-divider {
  height: 28px;
}

.balance-actions {
  margin-left: auto;
}

/* ---- 表格 ---- */
.wd-table {
  width: 100%;
}

.wdno {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  color: var(--el-text-color-primary, #333);
}

.cell-muted {
  color: var(--el-text-color-regular, #666);
}

.cell-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.account-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.account-name {
  font-size: 13px;
  color: var(--el-text-color-primary, #333);
}

.account-no {
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-regular, #666);
  min-width: 0;
}

.audit-cell.is-danger {
  color: var(--el-color-danger, #d54941);
  word-break: break-all;
}

.audit-cell.is-muted {
  color: var(--el-text-color-secondary, #999);
}

.audit-txno {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  color: var(--el-text-color-secondary, #999);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-time {
  color: var(--el-text-color-secondary, #999);
}

/* ---- 分页 ---- */
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

/* ---- 申请弹窗 ---- */
.apply-alert {
  margin-bottom: 16px;
}

.amount-input {
  width: 100%;
}

@media (max-width: 768px) {
  .balance-actions {
    width: 100%;
    margin-left: 0;
  }
}
</style>
