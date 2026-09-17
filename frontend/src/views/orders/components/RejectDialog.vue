<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

/**
 * 驳回报单弹窗(单条驳回 / 批量驳回复用)
 * - 顶部可选说明文字(批量时展示「已选 N 单 · 驳回后不打款,报单人可修改后重新提交」)
 * - 驳回原因必填(契约:POST /orders/:id/reject remark 为空返回 400,前端先行校验)
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    description?: string
    confirmText?: string
    loading?: boolean
  }>(),
  {
    title: '驳回报单',
    description: '',
    confirmText: '确认驳回',
    loading: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm', remark: string): void
}>()

const remark = ref('')
const textareaRef = ref<{ focus: () => void } | null>(null)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      remark.value = ''
      nextTick(() => textareaRef.value?.focus())
    }
  },
)

function onClose() {
  if (props.loading) return
  emit('update:modelValue', false)
}

function onConfirm() {
  const value = remark.value.trim()
  if (!value) {
    ElMessage.warning('请填写驳回原因')
    textareaRef.value?.focus()
    return
  }
  emit('confirm', value)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="480px"
    :close-on-click-modal="false"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    append-to-body
    @update:model-value="(v: boolean) => !v && onClose()"
  >
    <p v-if="description" class="reject-tip">{{ description }}</p>
    <el-input
      ref="textareaRef"
      v-model="remark"
      type="textarea"
      :rows="4"
      maxlength="200"
      show-word-limit
      placeholder="请填写驳回原因(必填,将展示给报单人)"
    />
    <template #footer>
      <el-button :disabled="loading" @click="onClose">取消</el-button>
      <el-button type="danger" :loading="loading" @click="onConfirm">
        {{ confirmText }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.reject-tip {
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 4px;
  background: var(--el-color-danger-light-9, #fbedec);
  color: var(--el-color-danger, #d54941);
  font-size: 13px;
  line-height: 1.6;
}
</style>
