<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Refresh, Search } from '@element-plus/icons-vue'

import PageCard from '@/components/PageCard.vue'
import { listWithdraws } from '@/api/withdraw'
import type { WithdrawStatus, Withdrawal } from '@/api/types'
import {
  enumMeta,
  formatDateTime,
  formatMoney,
  WITHDRAW_METHOD,
  WITHDRAW_STATUS,
} from '@/utils/format'
import WithdrawReviewDialog from './components/WithdrawReviewDialog.vue'

/**
 * 提现审核(v2.7,ADMIN):筛选(状态 + 日期范围 + 提现单号)→ 待审合计条 →
 * 申请表格(申请人/收款信息/状态)→ 审核弹窗(通过扣余额记账 / 两段式驳回)。
 * 支持看板「提现待审」卡带 ?status=PENDING 跳入预置筛选。
 */
const PAGE_SIZE = 10

const route = useRoute()

/* ---- 筛选 ---- */
const filters = reactive({
  status: '' as WithdrawStatus | '',
  keyword: '',
})

const dateRange = ref<[string, string] | null>(null)

const statusOptions = (Object.keys(WITHDRAW_STATUS) as WithdrawStatus[]).map((s) => ({
  value: s,
  label: enumMeta(WITHDRAW_STATUS, s).label,
}))

/* ---- 列表 + 待审合计 ---- */
const loading = ref(false)
const list = ref<Withdrawal[]>([])
const total = ref(0)
const page = ref(1)
const pendingSum = ref(0)

async function load() {
  loading.value = true
  try {
    const [startDate, endDate] = dateRange.value || []
    const res = await listWithdraws({
      page: page.value,
      pageSize: PAGE_SIZE,
      status: filters.status || undefined,
      keyword: filters.keyword.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    })
    list.value = res.list
    total.value = res.total
    pendingSum.value = res.pendingSum ?? 0
  } catch {
    /* 失败提示由 http 拦截器统一处理 */
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  page.value = 1
  load()
}

function handleReset() {
  filters.status = ''
  filters.keyword = ''
  dateRange.value = null
  page.value = 1
  load()
}

function handlePageChange(p: number) {
  page.value = p
  load()
}

/* ---- 审核弹窗 ---- */
const dialogVisible = ref(false)
const currentId = ref<number | null>(null)

function openReview(row: Withdrawal) {
  currentId.value = row.id
  dialogVisible.value = true
}

onMounted(() => {
  // 看板/提醒跳入预置: /withdraw-review?status=PENDING
  const qs = String(route.query.status || '')
  if (qs && statusOptions.some((o) => o.value === qs)) {
    filters.status = qs as WithdrawStatus
  }
  const qk = String(route.query.keyword || '')
  if (qk) filters.keyword = qk
  load()
})
</script>

<template>
  <div class="withdraw-review-page">
    <PageCard>
      <!-- 筛选栏 -->
      <div class="filter-bar">
        <el-select v-model="filters.status" class="filter-status" placeholder="全部状态">
          <el-option label="全部状态" value="" />
          <el-option
            v-for="opt in statusOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          class="filter-date"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
        />
        <el-input
          v-model="filters.keyword"
          class="filter-input"
          placeholder="提现单号"
          clearable
          :prefix-icon="Search"
          @keyup.enter="handleQuery"
          @clear="handleQuery"
        />
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="handleReset">重置</el-button>
      </div>

      <!-- 待审合计条 -->
      <div class="summary-bar">
        <div class="summary-item">
          <span class="summary-item__label">待审合计</span>
          <span class="summary-item__value money-warning">{{ formatMoney(pendingSum) }}</span>
        </div>
        <el-divider direction="vertical" class="summary-divider" />
        <div class="summary-item">
          <span class="summary-item__label">说明</span>
          <span class="summary-tip">通过后立即扣减申请人余额并记入资金流水;驳回不动余额</span>
        </div>
      </div>

      <!-- 申请表格 -->
      <el-table v-loading="loading" :data="list" row-key="id" class="wd-table">
        <el-table-column label="提现单号" width="190">
          <template #default="{ row }">
            <span class="wdno">{{ row.wdNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="申请人" min-width="150">
          <template #default="{ row }">
            <div class="user-cell">
              <span class="user-name">{{ row.user?.name }}</span>
              <span class="user-phone">{{ row.user?.phone }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="金额" min-width="110" align="right">
          <template #default="{ row }">
            <span class="cell-amount">{{ formatMoney(row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="收款方式" width="90">
          <template #default="{ row }">{{ enumMeta(WITHDRAW_METHOD, row.method).label }}</template>
        </el-table-column>
        <el-table-column label="收款信息" min-width="180">
          <template #default="{ row }">
            <div class="account-cell">
              <span class="account-name">{{ row.accountName }}</span>
              <span class="account-no">{{ row.account }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="120">
          <template #default="{ row }">
            <span class="cell-muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="enumMeta(WITHDRAW_STATUS, row.status).type" disable-transitions>
              {{ enumMeta(WITHDRAW_STATUS, row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              :type="row.status === 'PENDING' ? 'primary' : 'info'"
              size="small"
              @click="openReview(row)"
            >
              {{ row.status === 'PENDING' ? '审核' : '详情' }}
            </el-button>
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
          @current-change="handlePageChange"
        />
      </div>
    </PageCard>

    <!-- 审核弹窗 -->
    <WithdrawReviewDialog
      v-model="dialogVisible"
      :request-id="currentId"
      @success="load"
    />
  </div>
</template>

<style scoped>
/* ---- 筛选栏 ---- */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.filter-status {
  width: 130px;
}

.filter-date {
  width: 250px;
}

.filter-input {
  width: 200px;
}

/* ---- 待审合计条 ---- */
.summary-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  margin-bottom: 14px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 8px;
  flex-wrap: wrap;
}

.summary-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.summary-item__label {
  font-size: 13px;
  color: var(--el-text-color-regular, #666);
}

.summary-item__value {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.money-warning {
  color: var(--el-color-warning, #e37318);
}

.summary-divider {
  height: 20px;
}

.summary-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
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

.user-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-name {
  font-size: 13px;
  color: var(--el-text-color-primary, #333);
}

.user-phone {
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
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

/* ---- 分页 ---- */
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 768px) {
  .filter-status,
  .filter-date,
  .filter-input {
    width: 100%;
  }
}
</style>
