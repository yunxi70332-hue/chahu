<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'

import PageCard from '@/components/PageCard.vue'
import { freezeUser, listUsers, unfreezeUser } from '@/api/users'
import { resetRealname } from '@/api/realname'
import type { RealnameStatus, Role, SystemUser } from '@/api/types'
import {
  enumMeta,
  formatMoney,
  REALNAME_STATUS,
  ROLE,
  USER_STATUS,
} from '@/utils/format'
import { useUserStore } from '@/stores/user'

import UserFormDialog from './components/UserFormDialog.vue'
import BalanceDialog from './components/BalanceDialog.vue'
import ResetPwdDialog from './components/ResetPwdDialog.vue'
import RealnameReviewDialog from './components/RealnameReviewDialog.vue'

/**
 * 用户管理(仅 ADMIN 角色可达;页面内仍按 role 隐藏写操作):
 * 筛选栏(关键词 + 角色 + 实名状态)+ 用户表格(分页 10)
 * + 新建/编辑/冻结/解冻/余额调整/重置密码 + 实名审核/重置实名
 */
const PAGE_SIZE = 10

const userStore = useUserStore()
const isAdmin = computed(() => userStore.role === 'ADMIN')
const currentUserId = computed(() => userStore.userInfo?.id)

/* ---- 筛选 ---- */
const filters = reactive({
  keyword: '',
  role: '' as Role | '',
  realnameStatus: '' as RealnameStatus | '',
})

const roleFilterOptions = (Object.keys(ROLE) as Role[]).map((r) => ({
  value: r,
  label: enumMeta(ROLE, r).label,
}))

const realnameFilterOptions = (Object.keys(REALNAME_STATUS) as RealnameStatus[]).map((s) => ({
  value: s,
  label: enumMeta(REALNAME_STATUS, s).label,
}))

/* ---- 列表 ---- */
const loading = ref(false)
const list = ref<SystemUser[]>([])
const total = ref(0)
const page = ref(1)

async function load() {
  loading.value = true
  try {
    const res = await listUsers({
      page: page.value,
      pageSize: PAGE_SIZE,
      keyword: filters.keyword.trim() || undefined,
      role: filters.role || undefined,
      realnameStatus: filters.realnameStatus || undefined,
    })
    list.value = res.list
    total.value = res.total
  } catch {
    /* 失败提示由 http 拦截器统一处理 */
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  page.value = 1
  load()
}

function handleReset() {
  filters.keyword = ''
  filters.role = ''
  filters.realnameStatus = ''
  page.value = 1
  load()
}

function handlePageChange(p: number) {
  page.value = p
  load()
}

/* ---- 新建 / 编辑 ---- */
const formVisible = ref(false)
const formUser = ref<SystemUser | null>(null)

function openCreate() {
  formUser.value = null
  formVisible.value = true
}

function openEdit(row: SystemUser) {
  formUser.value = row
  formVisible.value = true
}

function onFormSuccess() {
  load()
}

/* ---- 冻结 / 解冻 ---- */
async function handleFreeze(row: SystemUser) {
  try {
    await ElMessageBox.confirm(
      `确定冻结用户「${row.name}」吗?冻结后该账号将无法登录。`,
      '冻结确认',
      { type: 'warning', confirmButtonText: '冻结', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await freezeUser(row.id)
    ElMessage.success('已冻结')
    load()
  } catch {
    /* 失败提示由 http 拦截器统一处理 */
  }
}

async function handleUnfreeze(row: SystemUser) {
  try {
    await ElMessageBox.confirm(`确定解冻用户「${row.name}」吗?解冻后可正常登录。`, '解冻确认', {
      type: 'info',
      confirmButtonText: '解冻',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await unfreezeUser(row.id)
    ElMessage.success('已解冻')
    load()
  } catch {
    /* 失败提示由 http 拦截器统一处理 */
  }
}

/* ---- 余额调整 / 重置密码 ---- */
const balanceVisible = ref(false)
const balanceUser = ref<SystemUser | null>(null)

function openBalance(row: SystemUser) {
  balanceUser.value = row
  balanceVisible.value = true
}

const resetPwdVisible = ref(false)
const resetPwdUser = ref<SystemUser | null>(null)

function openResetPwd(row: SystemUser) {
  resetPwdUser.value = row
  resetPwdVisible.value = true
}

/* ---- 实名审核 / 重置实名 ---- */
const reviewVisible = ref(false)
const reviewUserId = ref<number | null>(null)

function openReview(row: SystemUser) {
  reviewUserId.value = row.id
  reviewVisible.value = true
}

async function handleResetRealname(row: SystemUser) {
  try {
    await ElMessageBox.confirm(
      `确定重置用户「${row.name}」的实名信息吗?重置后该用户实名信息将清空,需重新提交。`,
      '重置实名',
      { type: 'warning', confirmButtonText: '确认重置', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await resetRealname(row.id)
    ElMessage.success('实名信息已重置')
    load()
  } catch {
    /* 失败提示由 http 拦截器统一处理 */
  }
}

onMounted(load)
</script>

<template>
  <div class="users-page">
    <PageCard>
      <!-- 筛选栏 -->
      <div class="filter-bar">
        <div class="filter-left">
          <el-input
            v-model="filters.keyword"
            class="filter-input"
            placeholder="姓名 / 手机号"
            clearable
            :prefix-icon="Search"
            @keyup.enter="handleQuery"
            @clear="handleQuery"
          />
          <el-select v-model="filters.role" class="filter-role" placeholder="全部角色">
            <el-option label="全部角色" value="" />
            <el-option
              v-for="opt in roleFilterOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <el-select
            v-model="filters.realnameStatus"
            class="filter-realname"
            placeholder="全部实名状态"
          >
            <el-option label="全部实名状态" value="" />
            <el-option
              v-for="opt in realnameFilterOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </div>
        <div v-if="isAdmin" class="filter-right">
          <el-button type="primary" :icon="Plus" @click="openCreate">新建用户</el-button>
        </div>
      </div>

      <!-- 用户表格 -->
      <el-table v-loading="loading" :data="list" row-key="id" class="users-table">
        <el-table-column label="用户" min-width="170">
          <template #default="{ row }">
            <div class="user-cell">
              <div class="user-cell__name">{{ row.name }}</div>
              <div class="user-cell__phone">{{ row.phone }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="100">
          <template #default="{ row }">
            <el-tag :type="enumMeta(ROLE, row.role).type" disable-transitions>
              {{ enumMeta(ROLE, row.role).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="余额（元）" min-width="130" align="right">
          <template #default="{ row }">
            <span class="cell-money">{{ formatMoney(row.balance) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="enumMeta(USER_STATUS, row.status).type" disable-transitions>
              {{ enumMeta(USER_STATUS, row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="实名" width="96">
          <template #default="{ row }">
            <!-- 已驳回:tooltip 悬浮展示驳回原因 -->
            <el-tooltip
              v-if="row.realnameStatus === 'REJECTED' && row.realnameRejectReason"
              :content="`驳回原因:${row.realnameRejectReason}`"
              placement="top"
            >
              <el-tag :type="enumMeta(REALNAME_STATUS, row.realnameStatus).type" disable-transitions>
                {{ enumMeta(REALNAME_STATUS, row.realnameStatus).label }}
              </el-tag>
            </el-tooltip>
            <el-tag v-else :type="enumMeta(REALNAME_STATUS, row.realnameStatus).type" disable-transitions>
              {{ enumMeta(REALNAME_STATUS, row.realnameStatus).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="isAdmin" label="操作" width="340" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button
              v-if="row.status === 'ACTIVE' && row.id !== currentUserId"
              link
              type="warning"
              @click="handleFreeze(row)"
            >
              冻结
            </el-button>
            <el-button
              v-else-if="row.status === 'FROZEN'"
              link
              type="success"
              @click="handleUnfreeze(row)"
            >
              解冻
            </el-button>
            <el-button link type="primary" @click="openBalance(row)">余额调整</el-button>
            <el-button link type="primary" @click="openResetPwd(row)">重置密码</el-button>
            <el-button
              v-if="row.realnameStatus === 'PENDING'"
              link
              type="primary"
              @click="openReview(row)"
            >
              实名审核
            </el-button>
            <el-button
              v-else-if="row.realnameStatus === 'APPROVED' || row.realnameStatus === 'REJECTED'"
              link
              type="danger"
              @click="handleResetRealname(row)"
            >
              重置实名
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无用户" :image-size="80" />
        </template>
      </el-table>

      <!-- 分页 -->
      <div class="pager">
        <el-pagination
          background
          layout="total, prev, pager, next"
          :total="total"
          :page-size="PAGE_SIZE"
          :current-page="page"
          @current-change="handlePageChange"
        />
      </div>
    </PageCard>

    <!-- 新建 / 编辑 -->
    <UserFormDialog v-model="formVisible" :user="formUser" @success="onFormSuccess" />
    <!-- 余额调整 -->
    <BalanceDialog v-model="balanceVisible" :user="balanceUser" @success="load" />
    <!-- 重置密码 -->
    <ResetPwdDialog v-model="resetPwdVisible" :user="resetPwdUser" @success="load" />
    <!-- 实名审核 -->
    <RealnameReviewDialog v-model="reviewVisible" :user-id="reviewUserId" @success="load" />
  </div>
</template>

<style scoped>
/* ---- 筛选栏 ---- */
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.filter-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-input {
  width: 220px;
}

.filter-role {
  width: 130px;
}

.filter-realname {
  width: 140px;
}

/* ---- 表格 ---- */
.users-table {
  width: 100%;
}

.user-cell__name {
  font-weight: 600;
  color: var(--el-text-color-primary, #333);
  line-height: 20px;
}

.user-cell__phone {
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
  line-height: 18px;
}

.cell-money {
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary, #333);
}

/* ---- 分页 ---- */
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

@media (max-width: 768px) {
  .filter-input {
    width: 100%;
  }
  .filter-role {
    flex: 1;
  }
  .filter-realname {
    flex: 1;
  }
}
</style>
