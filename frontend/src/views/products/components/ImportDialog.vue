<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { importProductsExcel } from '@/api/products'
import type { ProductImportResult } from '@/api/types'

/**
 * 导入报价表弹窗(ADMIN):
 * - el-upload 拖拽选择 .xlsx,auto-upload=false,点「确认导入」才调 POST /products/import
 * - 导入为整批替换产品库,说明文字需明确提示
 * - 成功后切换为结果面板:导入产品 / 异常自动下架 / 报价日期 三个统计 + 计价规则摘要
 * - v2.5:导入的「参考回收价」为上游价,代理收购价按当前品类计价规则(下浮比例 / 减固定金额)自动计算
 */

const emit = defineEmits<{ imported: [] }>()

const visible = ref(false)
const phase = ref<'upload' | 'result'>('upload')
const file = ref<File | null>(null)
const importing = ref(false)
const result = ref<ProductImportResult | null>(null)
const uploadRef = ref()

function open() {
  phase.value = 'upload'
  file.value = null
  result.value = null
  importing.value = false
  visible.value = true
}

function resetUpload() {
  file.value = null
  uploadRef.value?.clearFiles()
}

/** auto-upload=false 时,选中文件 status=ready;这里只做类型校验与暂存 */
function handleFileChange(uploadFile: UploadFile) {
  const raw = uploadFile.raw
  if (!raw) return
  if (!/\.xlsx$/i.test(raw.name)) {
    ElMessage.warning('仅支持 .xlsx 格式的报价表文件')
    resetUpload()
    return
  }
  file.value = raw
}

function handleRemoveFile() {
  resetUpload()
}

async function handleImport() {
  if (!file.value || importing.value) return
  importing.value = true
  try {
    result.value = await importProductsExcel(file.value)
    phase.value = 'result'
  } catch {
    // 失败原因已由 http 拦截器提示;停留在上传面板,可重新选择文件再试
  } finally {
    importing.value = false
  }
}

/** 结果面板「完 成」:关闭弹窗并通知父级刷新列表 */
function handleFinish() {
  visible.value = false
  emit('imported')
}

/** 计价规则摘要开关:有配置才展示 */
const markdownSummary = computed(() => {
  const m = result.value?.markdownRules
  return !!m && Object.keys(m).length > 0
})

/** 规则文案:下浮比例显示「2%」,固定减额显示「−¥30」 */
function formatRule(rule?: { mode: string; value: number } | null): string {
  if (!rule) return '—'
  return rule.mode === 'fixed' ? `−¥${rule.value}` : `${rule.value}%`
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

defineExpose({ open })
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'upload' ? '导入报价表' : '导入结果'"
    width="560px"
    :close-on-click-modal="false"
    :show-close="phase === 'upload'"
    @closed="resetUpload"
  >
    <!-- 阶段一:选择文件 -->
    <template v-if="phase === 'upload'">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="导入将整批替换产品库;「参考回收价」作为上游价,代理收购价按当前品类计价规则自动计算,异常价自动下架"
        class="import-alert"
      />

      <el-upload
        ref="uploadRef"
        drag
        accept=".xlsx"
        :auto-upload="false"
        :show-file-list="false"
        :on-change="handleFileChange"
        class="import-upload"
      >
        <el-icon :size="48" color="var(--el-color-primary-light-5)"><UploadFilled /></el-icon>
        <div class="upload-text">将 .xlsx 报价表拖到此处,或<em>点击选择文件</em></div>
        <div class="upload-hint">仅支持 Excel(.xlsx)格式</div>
      </el-upload>

      <div v-if="file" class="selected-file">
        <span class="selected-file__name" :title="file.name">{{ file.name }}</span>
        <span class="selected-file__size">{{ formatSize(file.size) }}</span>
        <el-button link type="danger" @click="handleRemoveFile">移除</el-button>
      </div>
    </template>

    <!-- 阶段二:导入结果面板 -->
    <template v-else-if="result">
      <div class="import-result">
        <div class="result-stats">
          <div class="stat">
            <div class="stat__value stat__value--primary">{{ result.imported }}</div>
            <div class="stat__label">导入产品</div>
          </div>
          <div class="stat">
            <div class="stat__value stat__value--warning">{{ result.disabled }}</div>
            <div class="stat__label">异常自动下架</div>
          </div>
          <div class="stat">
            <div class="stat__value stat__value--date">{{ result.quoteDate || '-' }}</div>
            <div class="stat__label">报价日期</div>
          </div>
        </div>
        <div v-if="markdownSummary" class="markdown-summary">
          <span class="markdown-summary__label">本次计价:</span>
          <el-tag v-for="(rule, k) in result.markdownRules" :key="k" size="small" type="info" disable-transitions>
            {{ k }} {{ formatRule(rule) }}
          </el-tag>
        </div>
        <p class="result-tip">上游价 ≤0 或为空的产品已自动下架,可在产品列表核对后手动上架。</p>
      </div>
    </template>

    <template #footer>
      <template v-if="phase === 'upload'">
        <el-button @click="visible = false">取 消</el-button>
        <el-button type="primary" :disabled="!file" :loading="importing" @click="handleImport">
          确认导入
        </el-button>
      </template>
      <template v-else>
        <el-button type="primary" @click="handleFinish">完 成</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
.import-alert {
  margin-bottom: 16px;
}

.upload-text {
  margin-top: 8px;
  font-size: 14px;
  color: var(--el-text-color-regular, #666);
}

.upload-text em {
  color: var(--el-color-primary, #0052d9);
  font-style: normal;
}

.upload-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
}

.selected-file {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--el-fill-color-light, #f5f7fa);
  border: 1px solid var(--el-border-color, #e8e8e8);
  border-radius: 6px;
}

.selected-file__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--el-text-color-primary, #333);
}

.selected-file__size {
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
}

.import-result {
  padding: 8px 0 4px;
}

.result-stats {
  display: flex;
  justify-content: space-around;
  text-align: center;
}

.stat__value {
  font-size: 32px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--el-text-color-primary, #333);
}

.stat__value--primary {
  color: var(--el-color-primary, #0052d9);
}

.stat__value--warning {
  color: var(--el-color-warning, #e37318);
}

.stat__value--date {
  font-size: 22px;
  line-height: 32px;
}

.stat__label {
  margin-top: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary, #999);
}

.markdown-summary {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.markdown-summary__label {
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
}

.result-tip {
  margin: 20px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
  text-align: center;
}
</style>
