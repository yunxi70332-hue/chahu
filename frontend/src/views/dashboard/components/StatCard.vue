<script setup lang="ts">
/**
 * 看板指标卡:灰色小标题 + 28px 加粗大数字 + 右上贴题图标
 * tone = primary 时数字用主色强调(今日打款);tone = warning 时数字用警示橙且整卡可点击(待审核)
 */
defineProps<{
  title: string
  /** 已格式化好的展示值(金额用 formatMoney,计数用 toLocaleString) */
  value: string
  /** 副标题,如「本金+佣金」 */
  subtitle?: string
  /** 全局注册的 icons-vue 图标名,如 'Wallet' */
  icon: string
  /** default | primary(主色强调)| warning(警示橙) */
  tone?: 'default' | 'primary' | 'warning'
  /** 传入则整卡可点击并跳转,如 '/orders?status=PENDING' */
  to?: string
}>()

const emit = defineEmits<{ (e: 'jump'): void }>()

function onClick() {
  emit('jump')
}
</script>

<template>
  <section
    class="stat-card"
    :class="{ 'is-clickable': !!to, [`tone-${tone || 'default'}`]: true }"
    :role="to ? 'button' : undefined"
    @click="onClick"
  >
    <div class="stat-card__icon">
      <el-icon :size="20"><component :is="icon" /></el-icon>
    </div>
    <div class="stat-card__title">
      {{ title }}
      <span v-if="subtitle" class="stat-card__subtitle">{{ subtitle }}</span>
    </div>
    <div class="stat-card__value">{{ value }}</div>
  </section>
</template>

<style scoped>
.stat-card {
  position: relative;
  padding: 16px 18px;
  background: #fff;
  border: 1px solid var(--el-border-color);
  border-radius: var(--bd-card-radius, 8px);
  box-shadow: var(--bd-card-shadow);
  transition:
    box-shadow 0.2s,
    transform 0.2s;
}

.stat-card.is-clickable {
  cursor: pointer;
}

.stat-card.is-clickable:hover {
  box-shadow: 0 4px 12px rgba(0, 21, 41, 0.12);
  transform: translateY(-2px);
}

.stat-card__icon {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: var(--bd-primary);
  background: var(--el-color-primary-light-9);
}

.tone-warning .stat-card__icon {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.stat-card__title {
  padding-right: 40px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-card__subtitle {
  margin-left: 2px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.stat-card__value {
  margin-top: 10px;
  font-size: 28px;
  line-height: 1.2;
  font-weight: 700;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tone-primary .stat-card__value {
  color: var(--bd-primary);
}

.tone-warning .stat-card__value {
  color: var(--el-color-warning);
}

@media (max-width: 480px) {
  .stat-card {
    padding: 12px 14px;
  }

  .stat-card__value {
    font-size: 21px;
  }
}
</style>
