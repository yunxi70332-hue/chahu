<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowDown, Key, Menu as MenuIcon, SwitchButton } from '@element-plus/icons-vue'

import { changePassword } from '@/api/auth'
import { getMyRealname } from '@/api/realname'
import { enumMeta, ROLE } from '@/utils/format'
import { useUserStore } from '@/stores/user'
import SideMenu from './components/SideMenu.vue'

/**
 * 实名认证登录引导(每次浏览器会话最多弹一次):
 * 非 ADMIN 且未通过实名(realnameStatus !== 'APPROVED')时提醒前往实名认证页。
 * 模块级守卫保证登录/刷新只弹一次;ADMIN 或已实名不弹。
 */
let realnameNotified = false

/**
 * 管理后台布局:
 * - 桌面(>768px):左侧固定暗色侧栏 220px + 顶栏 + 内容区
 * - 移动(≤768px):侧栏收进 el-drawer 抽屉,顶栏汉堡按钮开关,内容区内边距收窄
 */
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

/* ---- 响应式 ---- */
const isMobile = ref(false)
const drawerOpen = ref(false)

function updateIsMobile() {
  isMobile.value = window.innerWidth <= 768
  if (!isMobile.value) drawerOpen.value = false
}

onMounted(() => {
  updateIsMobile()
  window.addEventListener('resize', updateIsMobile)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateIsMobile)
})

watch(isMobile, (mobile) => {
  if (!mobile) drawerOpen.value = false
})

/* ---- 实名认证提醒(登录动作后 userInfo 已就绪 / 刷新后 fetchMe 回填时触发) ---- */
async function notifyRealnameGuide() {
  if (realnameNotified) return
  const info = userStore.userInfo
  if (!info || info.role === 'ADMIN') return
  if (info.realnameStatus === 'APPROVED') return
  // 登录接口不返回 realnameStatus(仅 GET /auth/me 有),状态未知时补拉一次本人实名再判定
  if (!info.realnameStatus) {
    try {
      const me = await getMyRealname()
      info.realnameStatus = me.realnameStatus
    } catch {
      info.realnameStatus = 'NONE' // 查询失败按未实名处理(引导优先)
    }
  }
  if (realnameNotified || info.realnameStatus === 'APPROVED') return
  realnameNotified = true
  const notification = ElNotification({
    title: '实名认证提醒',
    message: '完成实名认证后才能提交报单,请前往「实名认证」页',
    type: 'warning',
    duration: 0,
    onClick: () => {
      notification.close()
      router.push('/realname')
    },
  })
}

watch(
  () => userStore.userInfo,
  () => notifyRealnameGuide(),
  { immediate: true },
)

/* ---- 顶栏 ---- */
const pageTitle = computed(() => (route.meta?.title as string) || '')
const roleMeta = computed(() => enumMeta(ROLE, userStore.role))
const avatarChar = computed(() => (userStore.userInfo?.name || '用').slice(0, 1))

async function onCommand(command: string) {
  if (command === 'password') {
    pwdDialogVisible.value = true
  } else if (command === 'logout') {
    await handleLogout()
  }
}

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定要退出登录吗?', '提示', {
      type: 'warning',
      confirmButtonText: '退出',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  userStore.logout()
  ElMessage.success('已退出登录')
  router.push('/login')
}

/* ---- 修改密码 ---- */
const pwdDialogVisible = ref(false)
const pwdSubmitting = ref(false)
const pwdFormRef = ref<FormInstance>()
const pwdForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const pwdRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '新密码不少于 6 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== pwdForm.newPassword) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

function resetPwdForm() {
  pwdForm.oldPassword = ''
  pwdForm.newPassword = ''
  pwdForm.confirmPassword = ''
  pwdFormRef.value?.clearValidate()
}

async function submitPwd() {
  const valid = await pwdFormRef.value?.validate().catch(() => false)
  if (!valid) return
  pwdSubmitting.value = true
  try {
    await changePassword(pwdForm.oldPassword, pwdForm.newPassword)
    ElMessage.success('密码修改成功')
    pwdDialogVisible.value = false
  } finally {
    pwdSubmitting.value = false
  }
}
</script>

<template>
  <div class="admin-layout">
    <!-- 桌面:固定暗色侧栏 -->
    <aside v-if="!isMobile" class="sidebar">
      <SideMenu />
    </aside>

    <!-- 移动:抽屉侧栏 -->
    <el-drawer
      v-else
      v-model="drawerOpen"
      direction="ltr"
      size="220"
      :with-header="false"
      class="admin-sidebar-drawer"
    >
      <SideMenu @navigate="drawerOpen = false" />
    </el-drawer>

    <!-- 主区域 -->
    <div class="layout-main">
      <header class="topbar">
        <div class="topbar-left">
          <el-icon v-if="isMobile" class="hamburger" :size="20" @click="drawerOpen = true">
            <component :is="MenuIcon" />
          </el-icon>
          <h1 class="page-title">{{ pageTitle }}</h1>
        </div>

        <div class="topbar-right">
          <el-dropdown trigger="click" @command="onCommand">
            <div class="user-chip">
              <span class="avatar">{{ avatarChar }}</span>
              <span class="user-name">{{ userStore.userInfo?.name || '未登录' }}</span>
              <el-tag :type="roleMeta.type" size="small" disable-transitions>
                {{ roleMeta.label }}
              </el-tag>
              <el-icon class="caret" :size="12"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="password" :icon="Key">修改密码</el-dropdown-item>
                <el-dropdown-item command="logout" :icon="SwitchButton" divided>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="layout-content">
        <router-view />
      </main>
    </div>

    <!-- 修改密码弹窗 -->
    <el-dialog
      v-model="pwdDialogVisible"
      title="修改密码"
      width="420px"
      :close-on-click-modal="false"
      @closed="resetPwdForm"
    >
      <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-width="80px">
        <el-form-item label="原密码" prop="oldPassword">
          <el-input
            v-model="pwdForm.oldPassword"
            type="password"
            show-password
            placeholder="请输入原密码"
          />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="pwdForm.newPassword"
            type="password"
            show-password
            placeholder="不少于 6 位"
          />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="pwdForm.confirmPassword"
            type="password"
            show-password
            placeholder="再次输入新密码"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdSubmitting" @click="submitPwd">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-layout {
  min-height: 100vh;
  background: var(--bd-page-bg, #f5f7fa);
}

/* ---- 侧栏(桌面固定) ---- */
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--bd-sidebar-width, 220px);
  z-index: 20;
  background: var(--bd-sidebar-bg, #191919);
}

.layout-main {
  margin-left: var(--bd-sidebar-width, 220px);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ---- 顶栏 ---- */
.topbar {
  height: 56px;
  background: #fff;
  border-bottom: 1px solid var(--el-border-color-light, #e8e8e8);
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  position: sticky;
  top: 0;
  z-index: 10;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.hamburger {
  cursor: pointer;
  color: var(--el-text-color-primary, #333);
  display: flex;
  align-items: center;
}

.page-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---- 用户区 ---- */
.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  outline: none;
}

.user-chip:hover {
  background: var(--el-fill-color-light, #f5f7fa);
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--el-color-primary, #0052d9);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.user-name {
  font-size: 14px;
  color: var(--el-text-color-primary, #333);
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.caret {
  color: var(--el-text-color-secondary, #999);
}

/* ---- 内容区 ---- */
.layout-content {
  flex: 1;
  padding: 20px;
}

@media (max-width: 768px) {
  .layout-main {
    margin-left: 0;
  }
  .topbar {
    padding: 0 12px;
  }
  .layout-content {
    padding: 12px;
  }
}
</style>
