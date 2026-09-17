<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'

import PageCard from '@/components/PageCard.vue'
import { listTransactions } from '@/api/transactions'
import type { Txn, TxnType } from '@/api/types'
import type { TagType } from '@/utils/format'
import {
  enumMeta,
  formatDateTime,
  formatMoney,
  formatSignedMoney,
  TXN_TYPE,
} from '@/utils/format'

/**
 * 资金流水(ADMIN 全量 / AGENT、MEMBER 仅自己,层级只有总部/代理两级):
 * 筛选(类型 + 日期范围 + 流水号)+ 收支汇总条 + 流水表格(分页 10)
 */
const PAGE_SIZE = 10

/* ---- 筛选 ---- */
const filters = reactive({
  type: '' as TxnType | '',
  keyword: '',
})

const dateRange = ref<[string, string] | null>(null)

const typeOptions = (Object.keys(TXN_TYPE) as TxnType[]).map((t) => ({
  value: t,
  label: enumMeta(TXN_TYPE, t).label,
}))

/* 页面级标签配色(契约 §8):ORDER 主色 / COMMISSION 绿 / WITHDRAW 橙 / RECHARGE 青 / ADJUST 灰 */
const TXN_TAG_TYPE: Record<TxnType, TagType> = {
  ORDER: 'primary',
  COMMISSION: 'success',
  WITHDRAW: 'warning',
  RECHARGE: 'info',
  ADJUST: 'info',
}

function tagType(row: Txn): TagType {
  return TXN_TAG_TYPE[row.type] ?? 'info'
}

function tagClass(row: Txn): string {
  return row.type === 'RECHARGE' ? 'tag-cyan' : ''
}

function amountClass(amount: number): string {
  if (amount > 0) return 'money-income'
  if (amount < 0) return 'money-expense'
  return ''
}

/* ---- 列表 + 汇总 ---- */
const loading = ref(false)
const list = ref<Txn[]>([])
const total = ref(0)
const page = ref(1)
const incomeSum = ref(0)
const expenseSum = ref(0)

async function load() {
  loading.value = true
  try {
    const [startDate, endDate] = dateRange.value || []
    const res = await listTransactions({
      page: page.value,
      pageSize: PAGE_SIZE,
      type: filters.type || undefined,
      keyword: filters.keyword.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    })
    list.value = res.list
    total.value = res.total
    incomeSum.value = res.incomeSum ?? 0
    expenseSum.value = res.expenseSum ?? 0
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
  filters.type = ''
  filters.keyword = ''
  dateRange.value = null
  page.value = 1
  load()
}

function handlePageChange(p: number) {
  page.value = p
  load()
}

onMounted(load)
</script>

<template>
  <div class="transactions-page">
    <PageCard>
      <!-- 筛选栏 -->
      <div class="filter-bar">
        <el-select v-model="filters.type" class="filter-type" placeholder="全部类型">
          <el-option label="全部类型" value="" />
          <el-option
            v-for="opt in typeOptions"
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
          placeholder="流水号"
          clearable
          :prefix-icon="Search"
          @keyup.enter="handleQuery"
          @clear="handleQuery"
        />
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="handleReset">重置</el-button>
      </div>

      <!-- 汇总条(数据来自列表接口 incomeSum / expenseSum) -->
      <div class="summary-bar">
        <div class="summary-item">
          <span class="summary-item__label">收入合计</span>
          <span class="summary-item__value money-income">+{{ formatMoney(incomeSum) }}</span>
        </div>
        <el-divider direction="vertical" class="summary-divider" />
        <div class="summary-item">
          <span class="summary-item__label">支出合计</span>
          <span class="summary-item__value money-expense">−{{ formatMoney(expenseSum) }}</span>
        </div>
      </div>

      <!-- 流水表格 -->
      <el-table v-loading="loading" :data="list" row-key="id" class="txn-table">
        <el-table-column label="流水号" width="180">
          <template #default="{ row }">
            <span class="txno">{{ row.txNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="120">
          <template #default="{ row }">
            <span class="cell-muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="tagType(row)" :class="tagClass(row)" disable-transitions>
              {{ row.typeLabel || enumMeta(TXN_TYPE, row.type).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="收支" min-width="130" align="right">
          <template #default="{ row }">
            <span class="cell-amount" :class="amountClass(row.amount)">
              {{ formatSignedMoney(row.amount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="交易后余额" min-width="130" align="right">
          <template #default="{ row }">
            <span class="cell-muted">{{ formatMoney(row.balanceAfter) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="关联报单 / 备注" min-width="230">
          <template #default="{ row }">
            <div class="remark-cell">
              <span v-if="row.order?.orderNo" class="remark-cell__order">{{ row.order.orderNo }}</span>
              <span class="remark-cell__text">{{ row.remark || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无流水" :image-size="80" />
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

.filter-type {
  width: 130px;
}

.filter-date {
  width: 250px;
}

.filter-input {
  width: 200px;
}

/* ---- 汇总条 ---- */
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

.summary-divider {
  height: 20px;
}

/* ---- 表格 ---- */
.txn-table {
  width: 100%;
}

.txno {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  color: var(--el-text-color-primary, #333);
}

.cell-muted {
  color: var(--el-text-color-regular, #666);
}

.cell-amount {
  font-variant-numeric: tabular-nums;
}

/* 补款:青色标签(覆盖 el-tag 变量,不改全局样式) */
.tag-cyan {
  --el-tag-bg-color: #e5f6f7;
  --el-tag-border-color: #b3e5e8;
  --el-tag-text-color: #10909b;
}

/* 关联报单 / 备注 两行 */
.remark-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.remark-cell__order {
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
  cursor: pointer;
  line-height: 18px;
}

.remark-cell__text {
  font-size: 13px;
  color: var(--el-text-color-regular, #666);
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* ---- 分页 ---- */
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 768px) {
  .filter-type,
  .filter-date,
  .filter-input {
    width: 100%;
  }
}
</style>
