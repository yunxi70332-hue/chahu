<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import { createUser, getUserOptions, updateUser } from '@/api/users'
import type { Role, SystemUser, UserOption } from '@/api/types'
import { enumMeta, ROLE } from '@/utils/format'

/**
 * 新建 / 编辑用户弹窗:
 * - 新建:手机号 / 姓名 / 初始密码(≥6)/ 角色 / 上级(可空,仅总部 ADMIN)/ 代理等级 / 初始余额(选填 ≥0)
 * - 编辑:仅 手机号 / 姓名 / 角色 / 上级 / 等级
 */
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

const isEdit = computed(() => !!props.user)

const roleOptions = (Object.keys(ROLE) as Role[]).map((r) => ({
  value: r,
  label: enumMeta(ROLE, r).label,
}))

/* ---- 上级下拉:层级只有总部/代理两级,上级只能是总部(GET /users/options?all=1 过滤 ADMIN) ---- */
const adminOptions = ref<UserOption[]>([])

async function loadParentOptions() {
  try {
    const all = await getUserOptions(true)
    adminOptions.value = all.filter((o) => o.role === 'ADMIN')
  } catch {
    /* 失败提示由 http 拦截器统一处理 */
  }
}

/** 编辑时上级可能不在总部选项里(历史数据兜底),补一项避免显示裸 id */
const parentOptions = computed<UserOption[]>(() => {
  const opts = [...adminOptions.value]
  const u = props.user
  if (u?.parentId && !opts.some((o) => o.id === u.parentId)) {
    opts.unshift({
      id: u.parentId,
      name: u.parent?.name || `用户#${u.parentId}`,
      phone: '',
      role: 'ADMIN',
      balance: 0,
    })
  }
  return opts
})

/* ---- 表单 ---- */
const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = reactive({
  phone: '',
  name: '',
  password: '',
  role: 'MEMBER' as Role,
  parentId: null as number | null,
  level: 0,
  balance: 0,
})

const rules = computed<FormRules>(() => ({
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1\d{10}$/, message: '手机号须为 1 开头的 11 位数字', trigger: 'blur' },
  ],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  ...(isEdit.value
    ? {}
    : {
        password: [
          { required: true, message: '请输入初始密码', trigger: 'blur' },
          { min: 6, message: '密码不少于 6 位', trigger: 'blur' },
        ],
      }),
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
}))

watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    loadParentOptions()
    const u = props.user
    form.phone = u?.phone ?? ''
    form.name = u?.name ?? ''
    form.password = ''
    form.role = u?.role ?? 'MEMBER'
    form.parentId = u?.parentId ?? null
    form.level = u?.level ?? 0
    form.balance = 0
    nextTick(() => formRef.value?.clearValidate())
  },
)

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  submitting.value = true
  try {
    if (isEdit.value && props.user) {
      await updateUser(props.user.id, {
        phone: form.phone.trim(),
        name: form.name.trim(),
        role: form.role,
        parentId: form.parentId,
        level: form.level,
      })
      ElMessage.success('用户已更新')
    } else {
      await createUser({
        phone: form.phone.trim(),
        name: form.name.trim(),
        password: form.password,
        role: form.role,
        parentId: form.parentId,
        level: form.level,
        balance: form.balance > 0 ? form.balance : 0,
      })
      ElMessage.success('用户已创建')
    }
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
    :title="isEdit ? '编辑用户' : '新建用户'"
    width="520px"
    :close-on-click-modal="false"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="92px">
      <el-form-item label="手机号" prop="phone">
        <el-input v-model="form.phone" maxlength="11" placeholder="11 位手机号" />
      </el-form-item>
      <el-form-item label="姓名" prop="name">
        <el-input v-model="form.name" maxlength="20" placeholder="请输入姓名" />
      </el-form-item>
      <el-form-item v-if="!isEdit" label="初始密码" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          show-password
          autocomplete="new-password"
          placeholder="不少于 6 位"
        />
      </el-form-item>
      <el-form-item label="角色" prop="role">
        <el-select v-model="form.role" style="width: 100%">
          <el-option
            v-for="opt in roleOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="上级(总部)" prop="parentId">
        <el-select
          v-model="form.parentId"
          clearable
          filterable
          placeholder="可空;层级只有总部/代理两级,上级只能是总部"
          style="width: 100%"
        >
          <el-option
            v-for="opt in parentOptions"
            :key="opt.id"
            :label="opt.phone ? `${opt.name}(${opt.phone})` : opt.name"
            :value="opt.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="代理等级" prop="level">
        <el-input-number v-model="form.level" :min="0" :max="9" :step="1" step-strictly />
      </el-form-item>
      <el-form-item v-if="!isEdit" label="初始余额" prop="balance">
        <el-input-number v-model="form.balance" :min="0" :max="99999999" :precision="2" :step="100" />
        <span class="form-tip">元,选填;大于 0 将记一笔「开户充值」流水</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        {{ isEdit ? '保存' : '创建' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form-tip {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
}
</style>
