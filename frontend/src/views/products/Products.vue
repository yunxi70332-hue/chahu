<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, Setting, Search, Refresh } from '@element-plus/icons-vue'
import PageCard from '@/components/PageCard.vue'
import { getProductMeta, listProducts, removeProduct, setProductStatus } from '@/api/products'
import type { Product, ProductMeta } from '@/api/types'
import { enumMeta, formatMoney, PRODUCT_STATUS } from '@/utils/format'
import { useUserStore } from '@/stores/user'
import ProductEditDialog from './components/ProductEditDialog.vue'
import ImportDialog from './components/ImportDialog.vue'
import MarkdownDialog from './components/MarkdownDialog.vue'

/**
 * 产品管理(ADMIN):
 * - 筛选:关键词(名称/型号)+ 大类 + 品牌(meta)+ 查询/重置
 * - 操作区:导入报价表 / 品类计价设置
 * - 表格:名称(+型号灰字)/ 大类 / 品牌 / 上游报价 / 代理收购价(=上游×(1-下浮%) 或 上游−固定减额;异常显示「待核对」)/ 上架状态开关
 * - 操作列:编辑 / 核对(价格异常行)/ 删除(confirm,400 引用冲突按后端 message 提示)
 */

const PAGE_SIZE = 20

const userStore = useUserStore()
const isAdmin = computed(() => userStore.role === 'ADMIN')

const loading = ref(false)
const list = ref<Product[]>([])
const total = ref(0)
const page = ref(1)
const meta = ref<ProductMeta>({ categories: [], brands: [] })

const filters = reactive({
  keyword: '',
  category: '',
  brand: '',
})

/** 品牌下拉过滤空串(线上 meta 存在空品牌) */
const brandOptions = computed(() => meta.value.brands.filter((b) => b && b.trim()))

async function fetchMeta() {
  try {
    meta.value = await getProductMeta()
  } catch {
    // 失败已由拦截器提示,筛选项退化为空
  }
}

async function fetchList() {
  loading.value = true
  try {
    const res = await listProducts({
      page: page.value,
      pageSize: PAGE_SIZE,
      keyword: filters.keyword.trim() || undefined,
      category: filters.category || undefined,
      brand: filters.brand || undefined,
    })
    list.value = res.list
    total.value = res.total
  } catch {
    // 失败已由拦截器提示
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  page.value = 1
  fetchList()
}

function handleReset() {
  filters.keyword = ''
  filters.category = ''
  filters.brand = ''
  page.value = 1
  fetchList()
}

/* ---------------- 价格异常 / 核对 ---------------- */

/** 价格列「待核对」:price 为空或 ≤0 */
function isBadPrice(row: Product) {
  return row.price === null || row.price === undefined || Number(row.price) <= 0
}

/** 操作列「核对」:价格异常 或 已下架(契约 §4) */
function isAbnormalRow(row: Product) {
  return isBadPrice(row) || row.status === 'DISABLED'
}

/* ---------------- 上架状态开关(ADMIN) ---------------- */

/** before-change:确认 + 调 setStatus,成功后再让开关翻转 */
async function handleStatusBeforeChange(row: Product): Promise<boolean> {
  const next = row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  const nextLabel = next === 'ACTIVE' ? '上架' : '下架'
  try {
    await ElMessageBox.confirm(`确定将「${row.name}」${nextLabel}吗?`, '上架状态变更', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return false
  }
  try {
    await setProductStatus(row.id, next)
    row.status = next
    ElMessage.success(`${nextLabel}成功`)
    return true
  } catch {
    // 失败已由拦截器提示;开关保持原状态
    return false
  }
}

/* ---------------- 编辑 / 核对 / 删除 ---------------- */

const editDialogRef = ref<InstanceType<typeof ProductEditDialog>>()

function openEdit(row: Product) {
  editDialogRef.value?.open(row)
}

function openVerify(row: Product) {
  editDialogRef.value?.open(row, { focusPrice: true })
}

function handleSaved() {
  fetchList()
}

async function handleDelete(row: Product) {
  try {
    await ElMessageBox.confirm(
      `确定删除产品「${row.name}」吗?删除后不可恢复。`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  try {
    await removeProduct(row.id)
    ElMessage.success('删除成功')
    // 当前页仅剩一条时删除后回退一页,避免空页
    if (list.value.length === 1 && page.value > 1) page.value -= 1
    fetchList()
  } catch {
    // 400「该产品已被报单引用,请下架而非删除」等失败已由 http 拦截器按后端 message 提示
  }
}

/* ---------------- 导入 / 计价设置 ---------------- */

const importDialogRef = ref<InstanceType<typeof ImportDialog>>()
const markdownDialogRef = ref<InstanceType<typeof MarkdownDialog>>()

function openImport() {
  importDialogRef.value?.open()
}

function openMarkdown() {
  markdownDialogRef.value?.open()
}

/** 导入成功:整批替换后 meta(品类/品牌)与列表都需刷新 */
async function handleImported() {
  ElMessage.success('产品库已更新')
  await Promise.allSettled([fetchMeta(), fetchList()])
}

onMounted(() => {
  fetchMeta()
  fetchList()
})
</script>

<template>
  <div class="products-page">
    <!-- 筛选 + 操作区 -->
    <PageCard class="filter-card">
      <div class="filter-bar">
        <el-input
          v-model="filters.keyword"
          placeholder="产品名称 / 型号"
          clearable
          class="filter-item filter-keyword"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-select
          v-model="filters.category"
          placeholder="全部大类"
          clearable
          class="filter-item filter-select"
        >
          <el-option v-for="c in meta.categories" :key="c" :label="c" :value="c" />
        </el-select>
        <el-select
          v-model="filters.brand"
          placeholder="全部品牌"
          clearable
          filterable
          class="filter-item filter-select filter-brand"
        >
          <el-option v-for="b in brandOptions" :key="b" :label="b" :value="b" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="handleSearch">查 询</el-button>
        <el-button :icon="Refresh" @click="handleReset">重 置</el-button>

        <span v-if="isAdmin" class="toolbar-actions">
          <el-button type="primary" :icon="Upload" @click="openImport">导入报价表</el-button>
          <el-button :icon="Setting" @click="openMarkdown">品类计价设置</el-button>
        </span>
      </div>
    </PageCard>

    <!-- 列表 -->
    <PageCard title="产品列表">
      <el-table v-loading="loading" :data="list" row-key="id">
        <el-table-column label="产品名称" min-width="240">
          <template #default="{ row }">
            <div class="product-name">{{ row.name }}</div>
            <div v-if="row.model" class="product-model">{{ row.model }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="category" label="大类" width="110" />
        <el-table-column prop="brand" label="品牌" min-width="120" show-overflow-tooltip />
        <el-table-column label="上游报价" width="120" align="right">
          <template #default="{ row }">
            <span v-if="row.upstreamPrice != null" class="product-price">{{ formatMoney(row.upstreamPrice) }}</span>
            <span v-else class="price-missing">-</span>
          </template>
        </el-table-column>
        <el-table-column label="代理收购价" width="130">
          <template #default="{ row }">
            <template v-if="isBadPrice(row)">
              <el-tag type="warning" size="small" disable-transitions>待核对</el-tag>
              <span class="price-missing">-</span>
            </template>
            <span v-else class="product-price product-price--agent">{{ formatMoney(row.price) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="上架状态" width="110" align="center">
          <template #default="{ row }">
            <el-switch
              v-if="isAdmin"
              :model-value="row.status === 'ACTIVE'"
              :before-change="() => handleStatusBeforeChange(row)"
              inline-prompt
              active-text="上架"
              inactive-text="下架"
            />
            <el-tag
              v-else
              :type="enumMeta(PRODUCT_STATUS, row.status).type"
              disable-transitions
            >
              {{ enumMeta(PRODUCT_STATUS, row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="isAdmin" label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="isAbnormalRow(row)" link type="warning" @click="openVerify(row)">
              核对
            </el-button>
            <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无产品数据" />
        </template>
      </el-table>

      <div class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          :page-size="PAGE_SIZE"
          :total="total"
          layout="total, prev, pager, next, jumper"
          background
          @current-change="fetchList"
        />
      </div>
    </PageCard>

    <!-- 弹窗 -->
    <ProductEditDialog ref="editDialogRef" @saved="handleSaved" />
    <ImportDialog ref="importDialogRef" @imported="handleImported" />
    <MarkdownDialog ref="markdownDialogRef" @saved="handleSaved" />
  </div>
</template>

<style scoped>
.filter-card {
  margin-bottom: 16px;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.filter-item {
  width: 180px;
}

.filter-keyword {
  width: 220px;
}

.filter-brand {
  width: 200px;
}

.toolbar-actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0;
}

.product-name {
  font-size: 14px;
  color: var(--el-text-color-primary, #333);
  line-height: 1.4;
}

.product-model {
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
  line-height: 1.4;
  margin-top: 2px;
}

.product-price {
  font-variant-numeric: tabular-nums;
}

.product-price--agent {
  font-weight: 600;
  color: var(--el-color-primary, #0052d9);
}

.price-missing {
  margin-left: 8px;
  color: var(--el-text-color-secondary, #999);
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
