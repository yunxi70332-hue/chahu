<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh } from '@element-plus/icons-vue'
import type { TableInstance } from 'element-plus'

import {
  approveOrder,
  batchApproveOrders,
  batchRejectOrders,
  listOrders,
  removeOrder,
  rejectOrder,
  updateOrder,
} from '@/api/orders'
import { getProductMeta } from '@/api/products'
import type { Order, OrderStatus } from '@/api/types'
import { enumMeta, formatDateTime, formatMoney, ROLE } from '@/utils/format'
import { useUserStore } from '@/stores/user'
import PageCard from '@/components/PageCard.vue'
import StatusTag from '@/components/StatusTag.vue'
import OrderWizard from './components/OrderWizard.vue'
import OrderDetail from './components/OrderDetail.vue'
import RejectDialog from './components/RejectDialog.vue'

/**
 * 报单管理:筛选列表 + 批量审核 + 单条审核 + 编辑/删除 + 三步新建向导
 * - 可见范围:ADMIN(总部)全量 / AGENT、MEMBER 仅自己(层级只有总部/代理两级)
 * - 审核动作(通过/驳回/批量)仅总部 ADMIN(代理没有审单权限);非 ADMIN 可自己报单
 * - 支持路由 query 预填(看板跳转):/orders?status=PENDING&keyword=xxx
 */
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const isAdmin = computed(() => userStore.role === 'ADMIN')
/** 审核动作(通过/驳回/批量)仅总部 ADMIN:代理没有审单权限 */
const canAudit = computed(() => userStore.role === 'ADMIN')

/* ---------------- 筛选 ---------------- */

const filters = reactive({
  status: '' as OrderStatus | '',
  category: '',
  keyword: '',
})
const dateRange = ref<[string, string] | null>(null)

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'PENDING', label: '待审核' },
  { value: 'APPROVED', label: '已通过' },
  { value: 'REJECTED', label: '已驳回' },
]

const categories = ref<string[]>([])

async function loadMeta() {
  try {
    const meta = await getProductMeta()
    categories.value = meta.categories || []
  } catch {
    /* 拦截器已提示 */
  }
}

/* ---------------- 列表 ---------------- */

const list = ref<Order[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const tableRef = ref<TableInstance>()

async function fetchList() {
  loading.value = true
  try {
    const res = await listOrders({
      page: page.value,
      pageSize: pageSize.value,
      status: filters.status || undefined,
      type: filters.category || undefined,
      keyword: filters.keyword.trim() || undefined,
      startDate: dateRange.value?.[0] || undefined,
      endDate: dateRange.value?.[1] || undefined,
    })
    list.value = res.list || []
    total.value = res.total || 0
    // 筛选后当前页超出范围时回到第 1 页
    if (!list.value.length && page.value > 1) {
      page.value = 1
      await fetchList()
    }
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  fetchList()
}

function onReset() {
  filters.status = ''
  filters.category = ''
  filters.keyword = ''
  dateRange.value = null
  page.value = 1
  fetchList()
}

function onSizeChange() {
  page.value = 1
  fetchList()
}

/* 路由 query 预填(看板跳转):status / keyword。返回是否已触发查询 */
function applyRouteQuery(): boolean {
  const qs = route.query.status
  const qk = route.query.keyword
  let changed = false
  if (typeof qs === 'string' && ['PENDING', 'APPROVED', 'REJECTED'].includes(qs)) {
    filters.status = qs as OrderStatus
    changed = true
  }
  if (typeof qk === 'string' && qk.trim()) {
    filters.keyword = qk.trim()
    changed = true
  }
  if (changed) {
    page.value = 1
    fetchList()
  }
  return changed
}

watch(
  () => route.query,
  () => {
    if (route.name === 'orders') applyRouteQuery()
  },
)

onMounted(() => {
  loadMeta()
  const prefetched = applyRouteQuery()
  if (!prefetched) fetchList()
  // 实名状态兜底刷新:MEMBER 进入时若未实名通过,重拉 /auth/me(可能刚被管理员通过)
  if (userStore.role === 'MEMBER' && userStore.userInfo?.realnameStatus !== 'APPROVED') {
    userStore.fetchMe().catch(() => {})
  }
})

/* ---------------- 行内权限 ---------------- */

/** 待审核可编辑/删除;已驳回可修改后重提(本人创建或 ADMIN) */
function canModify(row: Order): boolean {
  return (
    (row.status === 'PENDING' || row.status === 'REJECTED') &&
    (isAdmin.value || row.userId === userStore.userInfo?.id)
  )
}

const roleMetaOf = (role?: string) => enumMeta(ROLE, role)

/* ---------------- 多选 + 批量审核 ---------------- */

const selectedRows = ref<Order[]>([])

function onSelectionChange(rows: Order[]) {
  selectedRows.value = rows
}

/** 选中项中仅 PENDING 可审核;混入非 PENDING 时前端过滤并提示 */
const pendingSelection = computed(() => selectedRows.value.filter((r) => r.status === 'PENDING'))

function filterPendingWithTip(): Order[] | null {
  const pending = pendingSelection.value
  if (!pending.length) {
    ElMessage.warning('请选择待审核(PENDING)状态的报单')
    return null
  }
  const skipped = selectedRows.value.length - pending.length
  if (skipped > 0) {
    ElMessage.warning(`已自动过滤 ${skipped} 条非待审核记录`)
  }
  return pending
}

function reportBatchResult(result: { success: number[]; failed: { id: number; reason: string }[] }) {
  const okCount = result.success.length
  const failed = result.failed || []
  if (!failed.length) {
    ElMessage.success(`操作完成:成功 ${okCount} 单`)
  } else {
    const detail = failed.map((f) => `#${f.id} ${f.reason}`).join(';  ')
    ElMessageBox.alert(
      `成功 ${okCount} 单,失败 ${failed.length} 单。\n失败原因:${detail}`,
      '批量操作结果',
      { confirmButtonText: '知道了', type: 'warning' },
    )
  }
}

const batchLoading = ref(false)

async function onBatchApprove() {
  const pending = filterPendingWithTip()
  if (!pending) return
  try {
    await ElMessageBox.confirm(
      `确定批量通过选中的 ${pending.length} 单吗?通过后将按货款立即打款到报单人余额。`,
      '批量通过确认',
      { type: 'warning', confirmButtonText: '确定通过', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  batchLoading.value = true
  try {
    const res = await batchApproveOrders(pending.map((r) => r.id))
    reportBatchResult(res)
    clearSelection()
    await fetchList()
  } catch {
    /* 拦截器已提示 */
  } finally {
    batchLoading.value = false
  }
}

/* ---------------- 驳回(单条 + 批量复用 RejectDialog) ---------------- */

const rejectVisible = ref(false)
const rejectLoading = ref(false)
const rejectTarget = ref<'batch' | Order | null>(null)

const rejectDescription = computed(() => {
  if (rejectTarget.value === 'batch') {
    return `已选 ${pendingSelection.value.length} 单 · 驳回后不打款,报单人可修改后重新提交`
  }
  return ''
})

const rejectTitle = computed(() => {
  if (rejectTarget.value !== 'batch' && rejectTarget.value) {
    return `驳回报单 - ${rejectTarget.value.orderNo}`
  }
  return '批量驳回'
})

function openBatchReject() {
  const pending = filterPendingWithTip()
  if (!pending) return
  rejectTarget.value = 'batch'
  rejectVisible.value = true
}

function openReject(row: Order) {
  rejectTarget.value = row
  rejectVisible.value = true
}

async function onRejectConfirm(remark: string) {
  if (rejectTarget.value === 'batch') {
    rejectLoading.value = true
    try {
      const res = await batchRejectOrders(
        pendingSelection.value.map((r) => r.id),
        remark,
      )
      reportBatchResult(res)
      rejectVisible.value = false
      clearSelection()
      await fetchList()
    } catch {
      /* 拦截器已提示 */
    } finally {
      rejectLoading.value = false
    }
  } else if (rejectTarget.value) {
    rejectLoading.value = true
    try {
      await rejectOrder(rejectTarget.value.id, remark)
      ElMessage.success('已驳回')
      rejectVisible.value = false
      await fetchList()
    } catch {
      /* 拦截器已提示 */
    } finally {
      rejectLoading.value = false
    }
  }
}

/* ---------------- 单条通过 ---------------- */

async function onApprove(row: Order) {
  let remark = ''
  try {
    const { value } = await ElMessageBox.prompt(
      `通过后将按货款 ${formatMoney(row.totalAmount)} 打款到 ${row.user?.name || '报单人'} 的余额。`,
      `通过确认 - ${row.orderNo}`,
      {
        type: 'warning',
        confirmButtonText: '确定通过',
        cancelButtonText: '取消',
        inputPlaceholder: '审核备注(选填)',
        inputMaxlength: 100,
      },
    )
    remark = (value || '').trim()
  } catch {
    return
  }
  await doApprove(row, remark)
}

async function doApprove(row: Order, remark: string) {
  try {
    await approveOrder(row.id, remark)
    ElMessage.success(`已通过:${row.orderNo}`)
    await fetchList()
  } catch {
    /* 拦截器已提示 */
  }
}

function clearSelection() {
  tableRef.value?.clearSelection()
  selectedRows.value = []
}

/* ---------------- 详情 ---------------- */

const detailOrder = ref<Order | null>(null)

function openDetail(row: Order) {
  detailOrder.value = row
}

/* ---------------- 编辑 / 删除(仅 PENDING 且创建者或 ADMIN) ---------------- */

const editVisible = ref(false)
const editSubmitting = ref(false)
const editForm = reactive({
  id: 0,
  orderNo: '',
  status: '' as OrderStatus,
  rejectReason: '',
  quantity: 1 as number | null,
  unitPrice: null as number | null,
  logisticsNo: '',
  remark: '',
})

/** 编辑的是已驳回单:保存后重新提交审核 */
const isResubmit = computed(() => editForm.status === 'REJECTED')

const editTotal = computed(
  () => (Number(editForm.unitPrice) || 0) * (Number(editForm.quantity) || 0),
)

function openEdit(row: Order) {
  editForm.id = row.id
  editForm.orderNo = row.orderNo
  editForm.status = row.status
  editForm.rejectReason = row.rejectReason || ''
  editForm.quantity = row.quantity
  editForm.unitPrice = row.unitPrice
  editForm.logisticsNo = row.logisticsNo || ''
  editForm.remark = row.remark || ''
  editVisible.value = true
}

async function submitEdit() {
  const quantity = Number(editForm.quantity)
  const unitPrice = Number(editForm.unitPrice)
  if (!(quantity >= 1 && quantity <= 999)) {
    ElMessage.warning('数量需为 1-999')
    return
  }
  if (!(unitPrice >= 0.01)) {
    ElMessage.warning('单价不能低于 0.01')
    return
  }
  editSubmitting.value = true
  try {
    await updateOrder(editForm.id, {
      quantity,
      unitPrice,
      logisticsNo: editForm.logisticsNo.trim() || undefined,
      remark: editForm.remark.trim() || undefined,
    })
    ElMessage.success(isResubmit.value ? '已修改并重新提交审核' : '报单已更新')
    editVisible.value = false
    await fetchList()
  } catch {
    /* 拦截器已提示 */
  } finally {
    editSubmitting.value = false
  }
}

async function onDelete(row: Order) {
  try {
    await ElMessageBox.confirm(
      `确定删除报单 ${row.orderNo} 吗?删除后不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await removeOrder(row.id)
    ElMessage.success('已删除')
    await fetchList()
  } catch {
    /* 拦截器已提示 */
  }
}

/* ---------------- 新建向导 ---------------- */

const wizardVisible = ref(false)

/** 新建报单入口:非 ADMIN 且未实名通过时拦截,引导去实名认证页(管理员代客下单不受限,后端兜底校验) */
function openWizard() {
  if (userStore.role !== 'ADMIN' && userStore.userInfo?.realnameStatus !== 'APPROVED') {
    ElMessage.warning('请先完成实名认证后再提交报单')
    router.push('/realname')
    return
  }
  wizardVisible.value = true
}

function onWizardCreated() {
  // 向导提交成功即刷新,关闭时列表已是最新
  fetchList()
}
</script>

<template>
  <div class="orders-page">
    <!-- 筛选栏 -->
    <PageCard class="filter-card">
      <el-form inline class="filter-form" @submit.prevent="onSearch">
        <el-form-item label="状态">
          <el-select v-model="filters.status" class="filter-status" @change="onSearch">
            <el-option
              v-for="opt in statusOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="品类">
          <el-select v-model="filters.category" class="filter-category" clearable @change="onSearch">
            <el-option label="全部品类" value="" />
            <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            class="filter-date"
            @change="onSearch"
          />
        </el-form-item>
        <el-form-item label="关键词">
          <el-input
            v-model="filters.keyword"
            placeholder="物流单号 / 客户 / 产品"
            clearable
            class="filter-keyword"
            @keyup.enter="onSearch"
            @clear="onSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
          <el-button :icon="Refresh" @click="onReset">重置</el-button>
        </el-form-item>
      </el-form>
    </PageCard>

    <!-- 列表 -->
    <PageCard class="table-card">
      <template #header>
        <div class="table-header">
          <h3 class="table-title">报单列表</h3>
          <el-button type="primary" :icon="Plus" @click="openWizard">新建报单</el-button>
        </div>
      </template>

      <!-- 批量操作条 -->
      <div class="table-toolbar">
        <template v-if="canAudit && selectedRows.length > 0">
          <span class="batch-count">已选 {{ selectedRows.length }} 项</span>
          <el-button
            type="success"
            size="small"
            :loading="batchLoading"
            @click="onBatchApprove"
          >
            批量通过
          </el-button>
          <el-button type="danger" size="small" @click="openBatchReject">批量驳回</el-button>
        </template>
      </div>

      <el-table
        ref="tableRef"
        :data="list"
        v-loading="loading"
        row-key="id"
        @selection-change="onSelectionChange"
      >
        <el-table-column v-if="canAudit" type="selection" width="40" />
        <el-table-column label="报单编号" width="148">
          <template #default="{ row }">
            <span class="mono">{{ row.orderNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="物流单号" width="96" show-overflow-tooltip>
          <template #default="{ row }">
            <span :class="{ muted: !row.logisticsNo }">{{ row.logisticsNo || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="报单人" width="112">
          <template #default="{ row }">
            <div class="user-cell">
              <span>{{ row.user?.name || '-' }}</span>
              <el-tag
                v-if="row.user?.role"
                :type="roleMetaOf(row.user.role).type"
                size="small"
                disable-transitions
              >
                {{ roleMetaOf(row.user.role).label }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="产品" min-width="156">
          <template #default="{ row }">
            <div class="product-cell">
              <span class="product-name">{{ row.productName }}</span>
              <span v-if="row.spec" class="product-spec">{{ row.spec }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="104" align="right">
          <template #default="{ row }">
            <span class="amount">{{ formatMoney(row.totalAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="isAdmin" label="差价" width="96" align="right">
          <template #default="{ row }">
            <span
              v-if="row.upstreamPrice != null"
              class="profit"
              :class="{ 'profit--neg': (row.profit ?? 0) < 0 }"
            >
              {{ formatMoney(row.profit ?? 0) }}
            </span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="82" align="center">
          <template #default="{ row }">
            <StatusTag :status="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="提交时间" width="96">
          <template #default="{ row }">
            <span class="muted">{{ formatDateTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="212" fixed="right" class-name="op-col">
          <template #default="{ row }">
            <template v-if="row.status === 'PENDING'">
              <el-button v-if="canAudit" link type="success" @click="onApprove(row)">通过</el-button>
              <el-button v-if="canAudit" link type="danger" @click="openReject(row)">驳回</el-button>
              <el-button v-if="canModify(row)" link type="primary" @click="openEdit(row)">
                编辑
              </el-button>
              <el-button v-if="canModify(row)" link type="danger" @click="onDelete(row)">删除</el-button>
            </template>
            <template v-else-if="row.status === 'REJECTED' && canModify(row)">
              <el-button link type="primary" @click="openEdit(row)">修改重提</el-button>
              <el-button link type="primary" @click="openDetail(row)">查看</el-button>
            </template>
            <el-button v-else link type="primary" @click="openDetail(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="table-pagination">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @current-change="fetchList"
          @size-change="onSizeChange"
        />
      </div>
    </PageCard>

    <!-- 新建报单三步向导 -->
    <OrderWizard v-model="wizardVisible" @created="onWizardCreated" />

    <!-- 驳回原因弹窗(单条 / 批量复用) -->
    <RejectDialog
      v-model="rejectVisible"
      :title="rejectTitle"
      :description="rejectDescription"
      :loading="rejectLoading"
      @confirm="onRejectConfirm"
    />

    <!-- 报单详情 -->
    <OrderDetail :order="detailOrder" @close="detailOrder = null" />

    <!-- 编辑报单(PENDING 编辑 / REJECTED 修改重提) -->
    <el-dialog
      v-model="editVisible"
      :title="`编辑报单 - ${editForm.orderNo}`"
      width="520px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-alert
        v-if="isResubmit && editForm.rejectReason"
        :title="`上次驳回原因:${editForm.rejectReason}`"
        type="error"
        :closable="false"
        show-icon
        class="resubmit-alert"
      />
      <el-form label-width="92px">
        <el-form-item label="单价">
          <el-input-number
            v-model="editForm.unitPrice"
            :min="0.01"
            :precision="2"
            :controls="false"
            class="edit-num"
          />
        </el-form-item>
        <el-form-item label="数量">
          <el-input-number
            v-model="editForm.quantity"
            :min="1"
            :max="999"
            :step="1"
            step-strictly
            class="edit-num"
          />
        </el-form-item>
        <el-form-item label="物流单号">
          <el-input v-model="editForm.logisticsNo" maxlength="50" placeholder="选填" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="editForm.remark"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="选填"
          />
        </el-form-item>
        <el-form-item label="合计货款">
          <span class="edit-total">{{ formatMoney(editTotal) }}</span>
          <span class="form-tip">单价 × 数量,服务端保存时重算</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSubmitting" @click="submitEdit">
          {{ isResubmit ? '保存并重新提交' : '保存' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.orders-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 操作列按钮收紧,保证单行放下 */
.op-col :deep(.el-button + .el-button) {
  margin-left: 6px;
}

.op-col :deep(.cell) {
  padding-left: 8px;
  padding-right: 8px;
  white-space: nowrap;
}

/* ---- 筛选栏 ---- */
.filter-card :deep(.page-card__body) {
  padding-bottom: 2px;
}

.filter-form :deep(.el-form-item) {
  margin-bottom: 14px;
  margin-right: 16px;
}

.filter-status {
  width: 120px;
}

.filter-category {
  width: 130px;
}

.filter-date {
  width: 240px;
}

.filter-keyword {
  width: 200px;
}

/* ---- 列表 ---- */
.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.table-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary, #333);
}

.table-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
  margin-bottom: 12px;
}

.batch-count {
  font-size: 13px;
  color: var(--el-color-primary, #0052d9);
  font-weight: 600;
}

.mono {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
}

.muted {
  color: var(--el-text-color-secondary, #999);
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.product-cell {
  display: flex;
  flex-direction: column;
  line-height: 1.5;
}

.product-name {
  color: var(--el-text-color-primary, #333);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-spec {
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amount {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary, #333);
}

.profit {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--el-color-success, #2ba471);
}

.profit--neg {
  color: var(--el-color-danger, #d03050);
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

/* ---- 编辑弹窗 ---- */
.resubmit-alert {
  margin-bottom: 16px;
}

.edit-num {
  width: 180px;
}

.edit-total {
  font-size: 16px;
  font-weight: 700;
  color: var(--el-color-primary, #0052d9);
  font-variant-numeric: tabular-nums;
  margin-right: 10px;
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
}
</style>
