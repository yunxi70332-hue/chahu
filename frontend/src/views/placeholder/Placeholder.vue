<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Box } from '@element-plus/icons-vue'

/**
 * 占位视图:显示当前页面名(取 route.meta.title)。
 * 阶段 2 页面 Agent 用真实页面替换各 view 壳文件即可,本组件可保留作为参考。
 */
const route = useRoute()
const title = computed(() => (route.meta?.title as string) || '页面')
</script>

<template>
  <div class="placeholder">
    <el-empty :description="`「${title}」页面建设中`">
      <template #image>
        <el-icon :size="72" color="var(--el-color-primary-light-5)"><Box /></el-icon>
      </template>
      <span class="placeholder-tip">路由已预注册,本视图将在阶段 2 替换为真实页面</span>
    </el-empty>
  </div>
</template>

<style scoped>
.placeholder {
  min-height: 64vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary, #999);
}
</style>
