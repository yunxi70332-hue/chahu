<script setup lang="ts">
/**
 * 通用白卡片容器:白底 + 圆角 8px + 浅阴影(契约 §8)
 * 用法:<PageCard title="报单列表">内容</PageCard>,或用 #header 插槽自定义头部
 */
defineProps<{
  title?: string
}>()
</script>

<template>
  <section class="page-card">
    <header v-if="title || $slots.header" class="page-card__header">
      <slot name="header">
        <h3 class="page-card__title">{{ title }}</h3>
      </slot>
    </header>
    <div class="page-card__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.page-card {
  background: #fff;
  border: 1px solid var(--el-border-color, #e8e8e8);
  border-radius: var(--bd-card-radius, 8px);
  box-shadow: var(--bd-card-shadow, 0 1px 4px rgba(0, 21, 41, 0.06));
}

.page-card__header {
  padding: 16px 20px 0;
}

.page-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary, #333);
}

.page-card__body {
  padding: 16px 20px 20px;
}
</style>
