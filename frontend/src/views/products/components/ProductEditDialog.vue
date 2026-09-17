<script setup lang="ts">
import { nextTick, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { getProductMeta, setProductStatus, updateProduct } from '@/api/products'
import type { Product, ProductMeta, ProductStatus } from '@/api/types'

/**
 * 产品编辑弹窗(ADMIN):
 * - 「编辑」与价格异常行的「核对」共用;核对进入时价格输入框自动聚焦
 * - 弹窗内含「上架状态」开关,保存时若与原状态不同则额外调 POST /products/:id/status
 * - 保存成功后 emit('saved'),由父级刷新列表
 */

const emit = defineEmits<{ saved: [] }>()

const visible = ref(false)
const saving = ref(false)
const needFocusPrice = ref(false)
const productId = ref<number>(0)
const originStatus = ref<ProductStatus>('ACTIVE')
const meta = ref<ProductMeta>({ categories: [], brands: [] })

const formRef = ref<FormInstance>()
const priceRef = ref()

interface EditForm {
  category: string
  brand: string
  name: string
  model: string
  memory: string
  disk: string
  screen: string
  color: string
  condition: string
  price: number | null
  quoteDate: string
  status: ProductStatus
}

const emptyForm = (): EditForm => ({
  category: '',
  brand: '',
  name: '',
  model: '',
  memory: '',
  disk: '',
  screen: '',
  color: '',
  condition: '',
  price: null,
  quoteDate: '',
  status: 'ACTIVE',
})

const form = reactive<EditForm>(emptyForm())

const rules: FormRules = {
  category: [{ required: true, message: '请选择大类', trigger: 'change' }],
  brand: [{ required: true, message: '请选择或输入品牌', trigger: 'change' }],
  name: [{ required: true, message: '请输入产品名称', trigger: 'blur' }],
}

/** 打开弹窗;opts.focusPrice = true 时(「核对」进入)价格框自动聚焦 */
function open(product: Product, opts?: { focusPrice?: boolean }) {
  productId.value = product.id
  originStatus.value = product.status
  needFocusPrice.value = !!opts?.focusPrice

  form.category = product.category ?? ''
  form.brand = product.brand ?? ''
  form.name = product.name ?? ''
  form.model = product.model ?? ''
  form.memory = product.memory ?? ''
  form.disk = product.disk ?? ''
  form.screen = product.screen ?? ''
  form.color = product.color ?? ''
  form.condition = product.condition ?? ''
  form.price = product.price ?? null
  form.quoteDate = product.quoteDate ?? ''
  form.status = product.status

  // 品类/品牌下拉选项(异步刷新,失败不影响打开编辑)
  getProductMeta()
    .then((m) => (meta.value = m))
    .catch(() => {})

  visible.value = true
  formRef.value?.clearValidate()
}

async function handleOpened() {
  if (!needFocusPrice.value) return
  await nextTick()
  priceRef.value?.focus()
  needFocusPrice.value = false
}

async function handleSave() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    await updateProduct(productId.value, {
      category: form.category.trim(),
      brand: form.brand.trim(),
      name: form.name.trim(),
      model: form.model.trim(),
      memory: form.memory.trim(),
      disk: form.disk.trim(),
      screen: form.screen.trim(),
      color: form.color.trim(),
      condition: form.condition.trim(),
      price: form.price,
      quoteDate: form.quoteDate,
    })
    // 上架状态在弹窗内被改动时同步调用 setStatus
    if (form.status !== originStatus.value) {
      await setProductStatus(productId.value, form.status)
    }
    ElMessage.success('保存成功')
    visible.value = false
    emit('saved')
  } catch {
    // 失败原因(如 400 校验信息)已由 http 拦截器统一提示
  } finally {
    saving.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <el-dialog
    v-model="visible"
    title="编辑产品"
    width="680px"
    :close-on-click-modal="false"
    @opened="handleOpened"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="92px">
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="大类" prop="category">
            <el-select
              v-model="form.category"
              placeholder="选择或输入大类"
              filterable
              allow-create
              default-first-option
              style="width: 100%"
            >
              <el-option v-for="c in meta.categories" :key="c" :label="c" :value="c" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="品牌" prop="brand">
            <el-select
              v-model="form.brand"
              placeholder="选择或输入品牌"
              filterable
              allow-create
              default-first-option
              style="width: 100%"
            >
              <el-option v-for="b in meta.brands" :key="b" :label="b" :value="b" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="产品名称" prop="name">
        <el-input v-model="form.name" placeholder="产品名称" maxlength="100" />
      </el-form-item>

      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="型号">
            <el-input v-model="form.model" placeholder="型号 / 子规格" maxlength="100" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="颜色">
            <el-input v-model="form.color" placeholder="颜色" maxlength="50" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="内存">
            <el-input v-model="form.memory" placeholder="如 8G" maxlength="50" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="硬盘">
            <el-input v-model="form.disk" placeholder="如 256G" maxlength="50" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="屏幕">
            <el-input v-model="form.screen" placeholder="尺寸 / 屏幕" maxlength="50" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="参考回收价">
            <el-input-number
              ref="priceRef"
              v-model="form.price"
              :min="0"
              :precision="2"
              :step="1"
              :controls="false"
              placeholder="0.00"
              style="width: 100%"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="报价日期">
            <el-date-picker
              v-model="form.quoteDate"
              type="date"
              placeholder="选择日期"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="上架状态">
            <el-switch
              v-model="form.status"
              active-value="ACTIVE"
              inactive-value="DISABLED"
              inline-prompt
              active-text="上架"
              inactive-text="下架"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="成色备注">
        <el-input
          v-model="form.condition"
          type="textarea"
          :rows="2"
          maxlength="200"
          placeholder="成色 / 备注"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取 消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">保 存</el-button>
    </template>
  </el-dialog>
</template>
