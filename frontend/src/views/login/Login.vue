<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Iphone, Lock } from '@element-plus/icons-vue'

import { useUserStore } from '@/stores/user'

/**
 * 登录页:桌面左右两栏(左深色渐变品牌区 / 右白色表单区),≤768px 只留表单。
 */
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const formRef = ref<FormInstance>()
const loading = ref(false)
const remember = ref(localStorage.getItem('bd_remember') !== '0')

const form = reactive({
  phone: '',
  password: '',
})

const rules: FormRules = {
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1\d{10}$/, message: '请输入 11 位手机号', trigger: 'blur' },
  ],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function handleLogin() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    await userStore.login({ phone: form.phone.trim(), password: form.password })
    localStorage.setItem('bd_remember', remember.value ? '1' : '0')
    ElMessage.success('登录成功')
    const redirect =
      typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
        ? route.query.redirect
        : userStore.role === 'MEMBER'
          ? '/orders'
          : '/dashboard'
    router.push(redirect)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <!-- 左栏:品牌区(移动端隐藏) -->
    <div class="login-left">
      <div class="brand-row">
        <div class="brand-logo">单</div>
        <div class="brand-title-wrap">
          <div class="brand-title-row">
            <span class="brand-title">数码报单系统</span>
            <el-tag class="brand-tag" round size="small">内部版</el-tag>
          </div>
          <div class="brand-sub">郑州天讯商贸行 · 内部管理平台</div>
        </div>
      </div>

      <div class="slogan-block">
        <p class="slogan-main">代理人报单、平台审核、资金流水,</p>
        <p class="slogan-main">一站式内部管理。</p>
        <div class="slogan-features">
          <span class="feature-dot" />
          <span>报单审核通过即打款</span>
        </div>
      </div>

      <div class="brand-footer">
        <p>郑州天讯商贸行</p>
        <p>Excel 报价表一键导入,异常价格自动下架</p>
      </div>
    </div>

    <!-- 右栏:表单区 -->
    <div class="login-right">
      <div class="login-box">
        <h2 class="login-title">欢迎登录</h2>
        <p class="login-sub">请使用手机号 + 密码登录</p>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          size="large"
          @submit.prevent="handleLogin"
        >
          <el-form-item prop="phone">
            <el-input
              v-model="form.phone"
              placeholder="手机号"
              maxlength="11"
              clearable
              :prefix-icon="Iphone"
            />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="密码"
              show-password
              :prefix-icon="Lock"
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <el-form-item class="remember-item">
            <el-checkbox v-model="remember">记住登录态(12 小时)</el-checkbox>
          </el-form-item>

          <el-button
            type="primary"
            size="large"
            class="login-btn"
            :loading="loading"
            native-type="submit"
          >
            登 录
          </el-button>
        </el-form>

        <p class="login-foot">仅限内部人员使用,需开通账号请联系管理员</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ================= 左栏品牌区 ================= */
.login-left {
  position: relative;
  flex: 1.15;
  display: flex;
  flex-direction: column;
  padding: 52px 64px 40px;
  color: #fff;
  background: linear-gradient(158deg, #01144a 0%, #012c8f 42%, #0052d9 100%);
  overflow: hidden;
}

.login-left::before {
  content: '';
  position: absolute;
  width: 460px;
  height: 460px;
  border-radius: 50%;
  right: -140px;
  top: -160px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0) 70%);
  pointer-events: none;
}

.login-left::after {
  content: '';
  position: absolute;
  width: 560px;
  height: 560px;
  border-radius: 50%;
  left: -200px;
  bottom: -280px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0) 68%);
  pointer-events: none;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 14px;
  position: relative;
  z-index: 1;
}

.brand-logo {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(145deg, #1e6bff, #0043b8);
  color: #fff;
  font-size: 28px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}

.brand-title-wrap {
  min-width: 0;
}

.brand-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 1px;
  white-space: nowrap;
}

.brand-tag {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.35);
  color: #fff;
}

.brand-sub {
  margin-top: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
}

.slogan-block {
  margin: auto 0;
  padding: 40px 0;
  position: relative;
  z-index: 1;
}

.slogan-main {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  line-height: 1.7;
  letter-spacing: 1px;
}

.slogan-features {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}

.feature-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #7db1ff;
}

.brand-footer {
  position: relative;
  z-index: 1;
}

.brand-footer p {
  margin: 2px 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

/* ================= 右栏表单区 ================= */
.login-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  padding: 24px;
}

.login-box {
  width: 360px;
  max-width: 100%;
}

.login-title {
  margin: 0 0 8px;
  font-size: 26px;
  font-weight: 700;
  color: var(--el-text-color-primary, #333);
}

.login-sub {
  margin: 0 0 30px;
  font-size: 14px;
  color: var(--el-text-color-secondary, #999);
}

.remember-item {
  margin-bottom: 18px;
}

.remember-item :deep(.el-checkbox__label) {
  font-size: 13px;
  color: var(--el-text-color-regular, #666);
}

.login-btn {
  width: 100%;
  height: 44px;
  font-size: 16px;
  letter-spacing: 6px;
  border-radius: 8px;
}

.login-foot {
  margin: 26px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
}

/* ================= 移动端 ================= */
@media (max-width: 768px) {
  .login-left {
    display: none;
  }
  .login-right {
    padding: 24px;
  }
  .login-box {
    width: 100%;
  }
}
</style>
