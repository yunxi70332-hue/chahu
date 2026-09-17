<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  approveRealname,
  fetchRealnamePhoto,
  getRealnameDetail,
  rejectRealname,
  resetRealname,
} from '@/api/realname'
import type { RealnameDetail } from '@/api/types'
import { enumMeta, formatFullDateTime, REALNAME_STATUS } from '@/utils/format'

/**
 * 实名审核弹窗(ADMIN):
 * - 打开时并行拉取实名详情(getRealnameDetail,含完整证件号)+ 身份证照片(fetchRealnamePhoto → blob objectURL)
 * - 左照片 / 右信息核对;通过(锁定)/ 驳回(原因必填)/ 重置实名(清空,需重新提交)
 * - blob 生命周期:关闭弹窗或组件卸载时 URL.revokeObjectURL 释放
 */
const props = defineProps<{
  modelValue: boolean
  userId: number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'success'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const loading = ref(false)
const detail = ref<RealnameDetail | null>(null)
const photoUrl = ref('')

const isPending = computed(() => detail.value?.realnameStatus === 'PENDING')
/** NONE 之外都提供重置入口(纠错兜底);NONE 无信息可重置 */
const canReset = computed(() => {
  const s = detail.value?.realnameStatus
  return !!s && s !== 'NONE'
})

/* ---- 驳回:点「驳回」先展开原因输入,再次点击才提交 ---- */
const rejectExpanded = ref(false)
const rejectReason = ref('')
const submitting = ref(false)

/* ---- 照片 blob 生命周期 ---- */

function releasePhoto() {
  if (photoUrl.value) {
    URL.revokeObjectURL(photoUrl.value)
    photoUrl.value = ''
  }
}

function resetState() {
  detail.value = null
  releasePhoto()
  rejectExpanded.value = false
  rejectReason.value = ''
  submitting.value = false
}

async function loadAll() {
  if (!props.userId) return
  loading.value = true
  // 并行:详情 + 照片 blob(照片失败仅影响左区展示,详情照常)
  const [detailRes, photoRes] = await Promise.allSettled([
    getRealnameDetail(props.userId),
    fetchRealnamePhoto(props.userId),
  ])
  detail.value = detailRes.status === 'fulfilled' ? detailRes.value : null
  if (photoRes.status === 'fulfilled') {
    releasePhoto()
    photoUrl.value = photoRes.value
  } else {
    releasePhoto()
  }
  loading.value = false
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      resetState()
      loadAll()
    } else {
      releasePhoto()
    }
  },
)

onUnmounted(releasePhoto)

/* ---- 三个动作 ---- */

function finish() {
  visible.value = false
  emit('success')
}

async function onApprove() {
  if (!props.userId || submitting.value) return
  try {
    await ElMessageBox.confirm(
      '通过后该用户实名将锁定,用户不可再修改。确认通过吗?',
      '通过实名',
      { type: 'warning', confirmButtonText: '确定通过', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  submitting.value = true
  try {
    await approveRealname(props.userId)
    ElMessage.success('已通过实名认证并锁定')
    finish()
  } catch {
    /* 失败提示由 http 拦截器统一处理 */
  } finally {
    submitting.value = false
  }
}

async function onReject() {
  if (!props.userId || submitting.value) return
  // 第一次点击:仅展开原因输入
  if (!rejectExpanded.value) {
    rejectExpanded.value = true
    return
  }
  const reason = rejectReason.value.trim()
  if (!reason) {
    ElMessage.warning('请填写驳回原因')
    return
  }
  submitting.value = true
  try {
    await rejectRealname(props.userId, reason)
    ElMessage.success('已驳回,用户可修改后重新提交')
    finish()
  } catch {
    /* 失败提示由 http 拦截器统一处理 */
  } finally {
    submitting.value = false
  }
}

async function onReset() {
  if (!props.userId || submitting.value) return
  try {
    await ElMessageBox.confirm(
      '重置后该用户实名信息将清空,需重新提交。确认重置吗?',
      '重置实名',
      { type: 'warning', confirmButtonText: '确认重置', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  submitting.value = true
  try {
    await resetRealname(props.userId)
    ElMessage.success('实名信息已重置')
    finish()
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
    :title="detail ? `实名审核 - ${detail.name}` : '实名审核'"
    width="720px"
    :close-on-click-modal="false"
    @closed="releasePhoto"
  >
    <div v-loading="loading" class="review-body">
      <template v-if="detail">
        <div class="review-layout">
          <!-- 左:身份证照片(blob URL) -->
          <div class="photo-pane">
            <div class="photo-pane__label">身份证照片</div>
            <el-image
              v-if="photoUrl"
              :src="photoUrl"
              fit="contain"
              :preview-src-list="[photoUrl]"
              preview-teleported
              hide-on-click-modal
              class="photo-pane__img"
            >
              <template #error>
                <div class="photo-pane__fallback">照片加载失败</div>
              </template>
            </el-image>
            <el-empty v-else description="未上传照片" :image-size="72" class="photo-pane__empty" />
          </div>

          <!-- 右:信息描述列表(证件号为完整号,供与照片核对) -->
          <el-descriptions :column="1" border size="small" class="info-pane">
            <el-descriptions-item label="实名状态">
              <el-tag
                :type="enumMeta(REALNAME_STATUS, detail.realnameStatus).type"
                disable-transitions
              >
                {{ enumMeta(REALNAME_STATUS, detail.realnameStatus).label }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="用户姓名">{{ detail.name }}</el-descriptions-item>
            <el-descriptions-item label="手机号">{{ detail.phone || '-' }}</el-descriptions-item>
            <el-descriptions-item label="真实姓名">{{ detail.realName || '-' }}</el-descriptions-item>
            <el-descriptions-item label="身份证号">
              <span class="id-no">{{ detail.idCardNo || '-' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="提交时间">
              {{ formatFullDateTime(detail.realnameSubmittedAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="审核时间">
              {{ formatFullDateTime(detail.realnameReviewedAt) }}
            </el-descriptions-item>
            <el-descriptions-item v-if="detail.realnameStatus === 'REJECTED'" label="驳回原因">
              {{ detail.realnameRejectReason || '-' }}
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- 驳回原因(点「驳回」时展开) -->
        <div v-if="isPending && rejectExpanded" class="reject-field">
          <div class="reject-field__label">
            驳回原因 <span class="reject-field__required">*必填</span>
          </div>
          <el-input
            v-model="rejectReason"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="如:照片模糊无法核对,请重新拍摄上传"
          />
        </div>

        <!-- 非 PENDING 兜底:信息只读展示,通过/驳回不渲染 -->
        <div v-if="!isPending" class="readonly-tip">
          当前状态非「待审核」,信息仅供查看{{ canReset ? ',如需纠错可重置实名' : '' }}。
        </div>
      </template>

      <el-empty v-else-if="!loading" description="未找到实名信息" :image-size="80" />
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ isPending ? '取消' : '关闭' }}</el-button>
      <template v-if="isPending">
        <el-button
          type="danger"
          :plain="!rejectExpanded"
          :loading="submitting"
          @click="onReject"
        >
          {{ rejectExpanded ? '确认驳回' : '驳回' }}
        </el-button>
        <el-button type="primary" :loading="submitting" @click="onApprove">通过</el-button>
      </template>
      <el-button v-if="canReset" type="danger" :loading="submitting" @click="onReset">
        重置实名
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.review-body {
  min-height: 220px;
}

.review-layout {
  display: flex;
  gap: 16px;
}

/* 左:照片区 */
.photo-pane {
  flex: 0 0 300px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.photo-pane__label {
  font-size: 13px;
  color: var(--el-text-color-regular, #666);
}

.photo-pane__img {
  width: 300px;
  height: 200px;
  border-radius: 8px;
  background: var(--el-fill-color-light, #f5f7fa);
  border: 1px dashed var(--el-border-color, #dcdfe6);
  cursor: zoom-in;
}

.photo-pane__empty {
  width: 300px;
  padding: 24px 0;
  background: var(--el-fill-color-light, #f5f7fa);
  border: 1px dashed var(--el-border-color, #dcdfe6);
  border-radius: 8px;
}

.photo-pane__fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 200px;
  font-size: 13px;
  color: var(--el-text-color-secondary, #999);
}

/* 右:信息区 */
.info-pane {
  flex: 1;
  min-width: 0;
  align-self: flex-start;
}

.id-no {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  letter-spacing: 0.5px;
  color: var(--el-text-color-primary, #333);
  word-break: break-all;
}

/* 驳回原因 */
.reject-field {
  margin-top: 16px;
}

.reject-field__label {
  font-size: 13px;
  color: var(--el-text-color-regular, #666);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.reject-field__required {
  font-size: 12px;
  color: var(--el-color-danger, #d54941);
}

.readonly-tip {
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light, #f5f7fa);
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
}

@media (max-width: 640px) {
  .review-layout {
    flex-direction: column;
  }
  .photo-pane {
    flex: none;
  }
}
</style>
