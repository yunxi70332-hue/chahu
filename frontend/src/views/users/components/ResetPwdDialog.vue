<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import { resetUserPassword } from '@/api/users'
import type { SystemUser } from '@/api/types'

/** 重置密码弹窗:新密码 ≥6 位 → POST /users/:id/reset-password */
const props = defineProps<{
  modelValue: boolean
  user?: SystemUser | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'success'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = reactive({
  password: '',
})

const rules: FormRules = {
  password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '新密码不少于 6 位', trigger: 'blur' },
  ],
}

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    form.password = ''
    submitting.value = false
    nextTick(() => formRef.value?.clearValidate())
  },
)

async function submit() {
  if (!props.user) return
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  submitting.value = true
  try {
    await resetUserPassword(props.user.id, form.password)
    ElMessage.success(`已重置「${props.user.name}」的密码`)
    visible.value = false
    emit('success')
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
    title="重置密码"
    width="420px"
    :close-on-click-modal="false"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px" @submit.prevent>
      <el-form-item v-if="user" label="账号">
        <span class="pwd-user">{{ user.name }}({{ user.phone }})</span>
      </el-form-item>
      <el-form-item label="新密码" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          show-password
          autocomplete="new-password"
          placeholder="不少于 6 位"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">确定重置</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.pwd-user {
  color: var(--el-text-color-primary, #333);
  font-weight: 600;
}
</style>
