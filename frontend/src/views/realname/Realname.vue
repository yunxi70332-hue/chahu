<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type {
  FormInstance,
  FormRules,
  UploadFile,
  UploadInstance,
  UploadRawFile,
  UploadUserFile,
} from 'element-plus'
import {
  CircleCheckFilled,
  CircleCloseFilled,
  UploadFilled,
  WarningFilled,
} from '@element-plus/icons-vue'

import { getMyRealname, submitRealname } from '@/api/realname'
import type { MyRealname, RealnameStatus } from '@/api/types'
import { enumMeta, formatDateTime, formatFullDateTime, REALNAME_STATUS } from '@/utils/format'
import { useUserStore } from '@/stores/user'

/**
 * 实名认证页(契约 §9):NONE 表单提交 / PENDING 审核中 / APPROVED 锁定只读 / REJECTED 驳回重传。
 * 照片仅本地 FileReader 预览,随 FormData 提交;jpg/png/webp 且 ≤5MB 前端拦截。
 */
const userStore = useUserStore()

/* ---- 状态拉取 ---- */
const loading = ref(false)
const info = ref<MyRealname | null>(null)

const status = computed<RealnameStatus>(() => info.value?.realnameStatus ?? 'NONE')
const statusMeta = computed(() => enumMeta(REALNAME_STATUS, status.value))
const isRejected = computed(() => status.value === 'REJECTED')

/** 顶部横幅说明文案 */
const BANNER_TEXT: Record<RealnameStatus, string> = {
  NONE: '您还未完成实名认证,完成认证后才能提交报单',
  PENDING: '实名资料已提交,请耐心等待管理员审核',
  APPROVED: '已完成实名认证,可正常提交报单',
  REJECTED: '实名认证未通过,请查看驳回原因,修改后重新提交',
}

async function load() {
  loading.value = true
  try {
    const data = await getMyRealname()
    info.value = data
    // 驳回重传:回填上次姓名;证件号仅返回脱敏值,含 * 时回填会造成无法通过校验,改为提示展示
    if (data.realnameStatus === 'REJECTED') {
      form.realName = data.realName || ''
      const lastId = data.idCardNo || ''
      lastIdCardMasked.value = lastId
      form.idCardNo = lastId && !lastId.includes('*') ? lastId : ''
    } else {
      lastIdCardMasked.value = ''
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

/* ---- 身份证校验:18 位 + GB11643 校验位 ---- */
const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const ID_CHECK_CODES = '10X98765432'

function isValidIdCard(value: string): boolean {
  const v = value.trim().toUpperCase()
  if (!/^\d{17}[\dX]$/.test(v)) return false
  let sum = 0
  for (let i = 0; i < 17; i += 1) {
    sum += Number(v[i]) * ID_WEIGHTS[i]
  }
  return ID_CHECK_CODES[sum % 11] === v[17]
}

function validateIdCard(_rule: unknown, value: string, callback: (err?: Error) => void) {
  if (!value || isValidIdCard(value)) {
    callback()
  } else {
    callback(new Error('请输入正确的 18 位身份证号(含校验位)'))
  }
}

/* ---- 表单 ---- */
const formRef = ref<FormInstance>()
const submitting = ref(false)
const lastIdCardMasked = ref('')
const form = reactive({
  realName: '',
  idCardNo: '',
})

const rules: FormRules = {
  realName: [
    { required: true, message: '请输入真实姓名', trigger: 'blur' },
    { min: 2, max: 30, message: '姓名长度为 2-30 个字符', trigger: 'blur' },
  ],
  idCardNo: [
    { required: true, message: '请输入身份证号', trigger: 'blur' },
    { validator: validateIdCard, trigger: 'blur' },
  ],
}

/* ---- 照片上传(单文件,前端拦截格式/大小,本地预览) ---- */
const MAX_PHOTO_SIZE = 5 * 1024 * 1024
const ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

const uploadRef = ref<UploadInstance>()
const photoList = ref<UploadUserFile[]>([])
const photoPreview = ref('')

function isAllowedType(file: File): boolean {
  return (
    /\.(jpe?g|png|webp)$/i.test(file.name) ||
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  )
}

function resetPhoto() {
  uploadRef.value?.clearFiles()
  photoList.value = []
  photoPreview.value = ''
}

/** 选中照片:校验格式/大小 → FileReader 预览 */
function handlePhoto(file: UploadFile) {
  const raw = file.raw
  if (!raw) return
  if (!isAllowedType(raw)) {
    ElMessage.warning('照片仅支持 jpg / png / webp 格式')
    resetPhoto()
    return
  }
  if (raw.size > MAX_PHOTO_SIZE) {
    ElMessage.warning('照片大小不能超过 5MB,请压缩后重新上传')
    resetPhoto()
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    photoPreview.value = String(reader.result || '')
  }
  reader.readAsDataURL(raw)
}

function onPhotoChange(file: UploadFile) {
  if (file.raw) handlePhoto(file)
}

/** 单文件限制:再次选择时替换旧照片 */
function onExceed(files: File[]) {
  const raw = files[0] as UploadRawFile | undefined
  if (!raw) return
  uploadRef.value?.clearFiles()
  uploadRef.value?.handleStart(raw)
}

function onPhotoRemove() {
  photoList.value = []
  photoPreview.value = ''
}

/* ---- 提交 ---- */
async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) {
    ElMessage.warning('请按提示完善姓名与身份证号')
    return
  }
  if (!photoList.value.length || !photoList.value[0].raw) {
    ElMessage.warning('请上传身份证人像面照片')
    return
  }
  submitting.value = true
  try {
    const fd = new FormData()
    fd.append('realName', form.realName.trim())
    fd.append('idCardNo', form.idCardNo.trim().toUpperCase())
    fd.append('photo', photoList.value[0].raw)
    const res = await submitRealname(fd)
    // 同步 store,保证顶栏/提醒逻辑与最新状态一致
    if (userStore.userInfo) userStore.userInfo.realnameStatus = res.realnameStatus
    ElMessage.success('已提交,等待管理员审核')
    resetPhoto()
    form.idCardNo = ''
    await load()
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div v-loading="loading" class="realname-page">
    <!-- 状态横幅 -->
    <div v-if="info" class="status-banner" :class="`is-${statusMeta.type}`">
      <el-tag :type="statusMeta.type" effect="dark" size="small" disable-transitions>
        {{ statusMeta.label }}
      </el-tag>
      <span class="banner-text">{{ BANNER_TEXT[status] || BANNER_TEXT.NONE }}</span>
    </div>

    <!-- 加载失败兜底 -->
    <el-card v-if="!loading && !info" shadow="never">
      <el-empty description="实名信息加载失败,请稍后重试">
        <el-button type="primary" @click="load">重新加载</el-button>
      </el-empty>
    </el-card>

    <!-- REJECTED:驳回原因卡 -->
    <div v-if="isRejected && info" class="state-card is-danger">
      <el-icon class="state-icon" :size="30"><CircleCloseFilled /></el-icon>
      <div class="state-body">
        <div class="state-title">实名认证未通过</div>
        <div class="reject-reason">驳回原因:{{ info.realnameRejectReason || '未填写' }}</div>
        <div class="state-tip">您可以修改资料后重新提交,提交后将再次进入审核</div>
      </div>
    </div>

    <!-- PENDING:审核中 -->
    <div v-else-if="status === 'PENDING' && info" class="state-card is-warning">
      <el-icon class="state-icon" :size="30"><WarningFilled /></el-icon>
      <div class="state-body">
        <div class="state-title">实名资料审核中,请耐心等待</div>
        <div class="state-meta">提交时间:{{ formatDateTime(info.realnameSubmittedAt) }}</div>
        <div class="state-tip">审核完成后即可正常提交报单,无需重复提交</div>
      </div>
    </div>

    <!-- APPROVED:已锁定,只读,无任何修改入口 -->
    <div v-else-if="status === 'APPROVED' && info" class="state-card is-success">
      <el-icon class="state-icon" :size="30"><CircleCheckFilled /></el-icon>
      <div class="state-body">
        <div class="state-title">已完成实名认证</div>
        <div class="detail-rows">
          <div class="detail-row">
            <span class="detail-label">姓名</span>
            <span>{{ info.realName || '-' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">身份证号</span>
            <span>{{ info.idCardNo || '-' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">审核时间</span>
            <span>{{ formatFullDateTime(info.realnameReviewedAt) }}</span>
          </div>
        </div>
        <div class="state-tip">实名信息已锁定,如需变更请联系管理员</div>
      </div>
    </div>

    <!-- NONE / REJECTED:提交表单 -->
    <el-card v-if="(status === 'NONE' || isRejected) && info" shadow="never" class="form-card">
      <template #header>
        <span class="form-card-title">
          {{ isRejected ? '重新提交实名资料' : '提交实名资料' }}
        </span>
      </template>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="96px"
        class="realname-form"
        @submit.prevent
      >
        <el-form-item label="真实姓名" prop="realName">
          <el-input
            v-model="form.realName"
            placeholder="请输入身份证上的真实姓名"
            maxlength="30"
            clearable
          />
        </el-form-item>

        <el-form-item label="身份证号" prop="idCardNo">
          <el-input
            v-model="form.idCardNo"
            placeholder="请输入 18 位身份证号"
            maxlength="18"
            clearable
          />
          <div v-if="isRejected && lastIdCardMasked" class="form-tip">
            上次提交的证件号:{{ lastIdCardMasked }}
          </div>
        </el-form-item>

        <el-form-item label="身份证照片" required>
          <div class="photo-field">
            <el-upload
              ref="uploadRef"
              v-model:file-list="photoList"
              drag
              :auto-upload="false"
              :accept="ACCEPT"
              :limit="1"
              :on-change="onPhotoChange"
              :on-exceed="onExceed"
              :on-remove="onPhotoRemove"
              class="photo-upload"
            >
              <template v-if="photoPreview">
                <img class="photo-preview" :src="photoPreview" alt="身份证人像面预览" />
                <div class="photo-preview-tip">点击或拖拽图片可重新上传</div>
              </template>
              <template v-else>
                <el-icon class="photo-upload-icon" :size="40"><UploadFilled /></el-icon>
                <div class="photo-upload-text">将身份证<strong>人像面</strong>照片拖到此处,或点击上传</div>
              </template>
            </el-upload>
            <div class="form-tip">仅支持 jpg / png / webp 格式,大小不超过 5MB</div>
          </div>
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            class="submit-btn"
            :loading="submitting"
            @click="handleSubmit"
          >
            提交实名认证
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.realname-page {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 60vh;
}

/* ---- 状态横幅 ---- */
.status-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 16px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color, #e8e8e8);
  background: var(--el-fill-color-light, #f5f7fa);
}

.status-banner.is-info {
  background: var(--el-color-info-light-9, #f4f4f5);
  border-color: var(--el-color-info-light-5, #d3d4d6);
}

.status-banner.is-warning {
  background: var(--el-color-warning-light-9, #fdf6ec);
  border-color: var(--el-color-warning-light-5, #f3d19e);
}

.status-banner.is-success {
  background: var(--el-color-success-light-9, #f0f9eb);
  border-color: var(--el-color-success-light-5, #a4da89);
}

.status-banner.is-danger {
  background: var(--el-color-danger-light-9, #fef0f0);
  border-color: var(--el-color-danger-light-5, #f1a6a6);
}

.banner-text {
  font-size: 14px;
  color: var(--el-text-color-regular, #666);
}

/* ---- 状态卡(PENDING / APPROVED / REJECTED) ---- */
.state-card {
  display: flex;
  gap: 14px;
  padding: 24px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color, #e8e8e8);
}

.state-card.is-warning {
  background: var(--el-color-warning-light-9, #fdf6ec);
  border-color: var(--el-color-warning-light-5, #f3d19e);
}

.state-card.is-warning .state-icon,
.state-card.is-warning .state-title {
  color: var(--el-color-warning, #e37318);
}

.state-card.is-success {
  background: var(--el-color-success-light-9, #f0f9eb);
  border-color: var(--el-color-success-light-5, #a4da89);
}

.state-card.is-success .state-icon,
.state-card.is-success .state-title {
  color: var(--el-color-success, #2ba471);
}

.state-card.is-danger {
  background: var(--el-color-danger-light-9, #fef0f0);
  border-color: var(--el-color-danger-light-5, #f1a6a6);
}

.state-card.is-danger .state-icon,
.state-card.is-danger .state-title {
  color: var(--el-color-danger, #d54941);
}

.state-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.state-body {
  min-width: 0;
}

.state-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.state-meta {
  font-size: 13px;
  color: var(--el-text-color-regular, #666);
  margin-bottom: 6px;
}

.reject-reason {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-color-danger, #d54941);
  margin-bottom: 6px;
  word-break: break-all;
}

.state-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
}

/* ---- 已实名明细 ---- */
.detail-rows {
  margin-bottom: 8px;
}

.detail-row {
  display: flex;
  font-size: 14px;
  color: var(--el-text-color-primary, #333);
  line-height: 26px;
}

.detail-label {
  width: 80px;
  flex-shrink: 0;
  color: var(--el-text-color-secondary, #999);
}

/* ---- 表单 ---- */
.form-card {
  border-radius: 8px;
}

.form-card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary, #333);
}

.realname-form {
  max-width: 560px;
}

.form-tip {
  width: 100%;
  margin-top: 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--el-text-color-secondary, #999);
}

.photo-field {
  width: 100%;
}

.photo-upload :deep(.el-upload-dragger) {
  padding: 18px 16px;
}

.photo-upload-icon {
  color: var(--el-text-color-placeholder, #a8abb2);
  margin-bottom: 6px;
}

.photo-upload-text {
  font-size: 13px;
  color: var(--el-text-color-secondary, #999);
}

.photo-upload-text strong {
  color: var(--el-color-danger, #d54941);
  font-weight: 600;
}

.photo-preview {
  display: block;
  max-width: 100%;
  max-height: 220px;
  margin: 0 auto 6px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color-light, #e8e8e8);
}

.photo-preview-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
}

.submit-btn {
  width: 100%;
}
</style>
