<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, Plus } from '@element-plus/icons-vue'
import { getMarkdown, setMarkdown } from '@/api/settings'
import { getProductMeta, recalcPrices } from '@/api/products'
import type { MarkdownMode } from '@/api/types'

/**
 * 品类计价设置弹窗(v2.5 中介模式,ADMIN):
 * - 每行二选一:「下浮比例」代理收购价 = 上游报价 ×(1 − 下浮%);「减固定金额」= 上游报价 − 金额
 * - 顶部「全局计价方式」一键把全部行切到同一方式,单行仍可各自覆盖
 * - 保存为全量覆盖:PUT /settings/markdown { rules }
 * - 保存成功后自动调 POST /products/recalc 重算全部在售代理价
 */

interface RateRow {
  name: string
  mode: MarkdownMode
  value: number
  preset: boolean // 来自 meta.categories 的预置行
}

const emit = defineEmits<{ saved: [] }>()

const visible = ref(false)
const loading = ref(false)
const saving = ref(false)
const rows = ref<RateRow[]>([])
/** 全局计价方式:切换即套用到所有行,并作为新增行默认值 */
const globalMode = ref<MarkdownMode>('percent')

const newName = ref('')
const newMode = ref<MarkdownMode>('percent')
const newValue = ref<number>(0)

const MODE_OPTIONS: { label: string; value: MarkdownMode }[] = [
  { label: '下浮比例', value: 'percent' },
  { label: '减固定金额', value: 'fixed' },
]

/** 数值上限/精度随方式切换:percent 百分比(0-100,1 位),fixed 金额(0-1000000,2 位) */
const numProps = (mode: MarkdownMode) =>
  mode === 'fixed'
    ? { min: 0, max: 1000000, precision: 2, step: 1 }
    : { min: 0, max: 100, precision: 1, step: 0.5 }

const unitOf = (mode: MarkdownMode) => (mode === 'fixed' ? '元' : '%')

/** 单行切换计价方式:数值超上限时收敛(如 100% → 100 元),避免出现非法值 */
function handleRowModeChange(row: RateRow) {
  if (row.mode === 'percent' && row.value > 100) row.value = 100
  if (row.value < 0) row.value = 0
}

/** 全局方式切换:套用到全部行 */
function handleGlobalModeChange() {
  for (const r of rows.value) {
    r.mode = globalMode.value
    handleRowModeChange(r)
  }
  newMode.value = globalMode.value
}

async function open() {
  visible.value = true
  loading.value = true
  rows.value = []
  newName.value = ''
  newMode.value = 'percent'
  newValue.value = 0
  globalMode.value = 'percent'
  try {
    const [setting, meta] = await Promise.all([getMarkdown(), getProductMeta()])
    const rules = setting?.rules ?? {}
    rows.value = (meta.categories ?? []).map((c) => ({
      name: c,
      mode: rules[c]?.mode === 'fixed' ? 'fixed' : 'percent',
      value: Number(rules[c]?.value ?? 0),
      preset: true,
    }))
    // 全部行方式一致时,全局选择器跟随该方式,避免误操作
    const modes = new Set(rows.value.map((r) => r.mode))
    if (modes.size === 1) {
      const only = rows.value[0]?.mode ?? 'percent'
      globalMode.value = only
      newMode.value = only
    }
  } catch {
    // 失败已由 http 拦截器提示,弹窗内呈现空表可手动添加
  } finally {
    loading.value = false
  }
}

/** 添加自定义品类行 */
function handleAddRow() {
  const name = newName.value.trim()
  if (!name) {
    ElMessage.warning('请输入品类名称')
    return
  }
  if (rows.value.some((r) => r.name === name)) {
    ElMessage.warning(`品类「${name}」已存在`)
    return
  }
  // 数值按所选方式收敛(切方式后残留的超限值在此兜底)
  const value = Math.max(0, newMode.value === 'percent' ? Math.min(100, Number(newValue.value) || 0) : Number(newValue.value) || 0)
  rows.value.push({ name, mode: newMode.value, value, preset: false })
  newName.value = ''
  newValue.value = 0
}

function handleRemoveRow(row: RateRow) {
  rows.value = rows.value.filter((r) => r !== row)
}

async function handleSave() {
  const rules: Record<string, { mode: MarkdownMode; value: number }> = {}
  for (const r of rows.value) {
    const name = r.name.trim()
    if (!name) continue
    if (name in rules) {
      ElMessage.warning(`品类「${name}」重复,请先处理再保存`)
      return
    }
    const value = Number(r.value) || 0
    if (value < 0) {
      ElMessage.warning(`品类「${name}」的数值不能为负`)
      return
    }
    if (r.mode === 'percent' && value > 100) {
      ElMessage.warning(`品类「${name}」的下浮比例不能超过 100%`)
      return
    }
    rules[name] = { mode: r.mode, value }
  }

  saving.value = true
  try {
    await setMarkdown(rules)
    // 保存后立即重算在售代理价,保证列表/选品与设置一致
    const r = await recalcPrices()
    ElMessage.success(`计价规则已保存,已重算 ${r.updated} 条在售价格`)
    visible.value = false
    emit('saved')
  } catch {
    // 失败已由 http 拦截器提示
  } finally {
    saving.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <el-dialog
    v-model="visible"
    title="品类计价设置"
    width="660px"
    :close-on-click-modal="false"
  >
    <div class="commission-tip">
      中介模式:代理收购价 = 上游报价 ×(1 − 下浮%),或 上游报价 − 固定金额,差价即利润;
      未配置的品类按下浮 0(代理价 = 上游价)。
      保存后自动重算全部在售代理价,后续导入的报价表也按此规则自动计价。
    </div>

    <div class="global-mode">
      <span class="global-mode__label">全局计价方式</span>
      <el-radio-group v-model="globalMode" size="small" @change="handleGlobalModeChange">
        <el-radio-button value="percent">下浮比例</el-radio-button>
        <el-radio-button value="fixed">减固定金额</el-radio-button>
      </el-radio-group>
      <span class="global-mode__hint">切换即套用到下方全部品类,单行可再单独调整</span>
    </div>

    <el-table :data="rows" v-loading="loading" size="default" max-height="340">
      <el-table-column label="品类名称" min-width="140">
        <template #default="{ row }">
          <span>{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column label="计价方式" width="150">
        <template #default="{ row }">
          <el-select
            v-model="row.mode"
            size="small"
            class="mode-select"
            @change="handleRowModeChange(row)"
          >
            <el-option
              v-for="m in MODE_OPTIONS"
              :key="m.value"
              :label="m.label"
              :value="m.value"
            />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="计价数值" width="220">
        <template #default="{ row }">
          <div class="rate-cell">
            <el-input-number
              v-model="row.value"
              v-bind="numProps(row.mode)"
              :controls="false"
              class="rate-cell__input"
            />
            <span class="rate-cell__unit">{{ unitOf(row.mode) }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="70" align="center">
        <template #default="{ row, $index }">
          <el-button
            link
            type="danger"
            :icon="Delete"
            title="删除该行"
            @click="handleRemoveRow(rows[$index])"
          />
        </template>
      </el-table-column>
    </el-table>

    <div class="add-row">
      <el-input
        v-model="newName"
        placeholder="自定义品类名称"
        maxlength="20"
        class="add-row__name"
        @keyup.enter="handleAddRow"
      />
      <el-select v-model="newMode" size="default" class="add-row__mode">
        <el-option v-for="m in MODE_OPTIONS" :key="m.value" :label="m.label" :value="m.value" />
      </el-select>
      <div class="rate-cell">
        <el-input-number
          v-model="newValue"
          v-bind="numProps(newMode)"
          :controls="false"
          placeholder="0"
          class="rate-cell__input"
        />
        <span class="rate-cell__unit">{{ unitOf(newMode) }}</span>
      </div>
      <el-button type="primary" plain :icon="Plus" @click="handleAddRow">添加品类</el-button>
    </div>

    <template #footer>
      <el-button @click="visible = false">取 消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">保存并重算</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.commission-tip {
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
  line-height: 1.6;
}

.global-mode {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 6px;
}

.global-mode__label {
  font-size: 13px;
  color: var(--el-text-color-regular, #666);
}

.global-mode__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
}

.mode-select {
  width: 100%;
}

.rate-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.rate-cell__input {
  flex: 1;
}

.rate-cell__unit {
  font-size: 13px;
  color: var(--el-text-color-regular, #666);
}

.add-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.add-row__name {
  width: 160px;
}

.add-row__mode {
  width: 120px;
}
</style>
