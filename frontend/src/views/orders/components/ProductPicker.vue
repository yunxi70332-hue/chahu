<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { getProductMeta, listProducts } from '@/api/products'
import type { Product } from '@/api/types'
import { formatMoney } from '@/utils/format'

/**
 * 选品器(向导 Step1):
 * - 关键词 + 大类/品牌筛选 + 查询按钮
 * - 仅取可售产品(listProducts available=1 = ACTIVE 且 price>0)
 * - 分页 pageSize 8;行点击 / 单选框选中,选中行高亮
 */
const props = defineProps<{
  modelValue: Product | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Product | null): void
}>()

const keyword = ref('')
const category = ref('')
const brand = ref('')

const categories = ref<string[]>([])
const brands = ref<string[]>([])

const list = ref<Product[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 8
const loading = ref(false)

const filters = reactive({
  keyword: '',
  category: '',
  brand: '',
})

async function fetchMeta() {
  try {
    const meta = await getProductMeta()
    categories.value = meta.categories || []
    brands.value = (meta.brands || []).filter(Boolean)
  } catch {
    /* 拦截器已提示 */
  }
}

async function fetchList() {
  loading.value = true
  try {
    const res = await listProducts({
      page: page.value,
      pageSize,
      available: 1,
      keyword: filters.keyword || undefined,
      category: filters.category || undefined,
      brand: filters.brand || undefined,
    })
    list.value = res.list || []
    total.value = res.total || 0
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false
  }
}

/** 点击「查询」:同步筛选条件并回到第 1 页 */
function onSearch() {
  filters.keyword = keyword.value.trim()
  filters.category = category.value
  filters.brand = brand.value
  page.value = 1
  fetchList()
}

function onPageChange(next: number) {
  page.value = next
  fetchList()
}

function selectRow(row: Product) {
  emit('update:modelValue', row)
}

function isSelected(row: Product) {
  return props.modelValue?.id === row.id
}

function rowClassName({ row }: { row: Product }) {
  return isSelected(row) ? 'picker-row--selected' : ''
}

onMounted(() => {
  fetchMeta()
  fetchList()
})
</script>

<template>
  <div class="product-picker">
    <!-- 筛选行 -->
    <div class="picker-filters">
      <el-input
        v-model="keyword"
        placeholder="产品名称 / 品牌 / 型号"
        clearable
        class="filter-keyword"
        @keyup.enter="onSearch"
      />
      <el-select
        v-model="category"
        placeholder="大类"
        clearable
        class="filter-select"
      >
        <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
      </el-select>
      <el-select
        v-model="brand"
        placeholder="品牌"
        clearable
        filterable
        class="filter-select"
      >
        <el-option v-for="b in brands" :key="b" :label="b" :value="b" />
      </el-select>
      <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
    </div>

    <!-- 产品表格 -->
    <el-table
      :data="list"
      v-loading="loading"
      size="small"
      height="320"
      highlight-current-row
      :row-class-name="rowClassName"
      @row-click="selectRow"
    >
      <el-table-column width="52" label="" align="center">
        <template #default="{ row }">
          <el-radio :model-value="modelValue?.id ?? 0" :value="row.id" @change="selectRow(row)">
            <span class="radio-hidden"></span>
          </el-radio>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" min-width="200" show-overflow-tooltip />
      <el-table-column prop="category" label="大类" width="90" />
      <el-table-column prop="brand" label="品牌" width="100" show-overflow-tooltip />
      <el-table-column label="价格" width="110" align="right">
        <template #default="{ row }">
          <span class="price">{{ formatMoney(row.price) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="颜色" width="90">
        <template #default="{ row }">
          <span :class="{ muted: !row.color }">{{ row.color || '-' }}</span>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="picker-pagination">
      <el-pagination
        size="small"
        background
        layout="total, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="onPageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.picker-filters {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.filter-keyword {
  flex: 1;
  min-width: 140px;
}

.filter-select {
  width: 130px;
}

.picker-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.picker-row--selected {
  --el-table-tr-bg-color: var(--el-color-primary-light-9, #e6eefb);
  cursor: pointer;
}

:deep(.el-table__row) {
  cursor: pointer;
}

.radio-hidden {
  display: none;
}

.price {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.muted {
  color: var(--el-text-color-secondary, #999);
}
</style>
