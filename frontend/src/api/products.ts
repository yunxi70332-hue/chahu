import { del, get, post, put } from './http'
import type {
  MarkdownRule,
  PageResult,
  Product,
  ProductImportResult,
  ProductListParams,
  ProductMeta,
  ProductPayload,
  ProductStatus,
} from './types'

/** GET /products — 产品分页列表(available=1 仅供建单选品) */
export function listProducts(params: ProductListParams = {}) {
  return get<PageResult<Product>>('/products', params)
}

/** GET /products/meta — 品类 / 品牌去重清单(筛选项) */
export function getProductMeta() {
  return get<ProductMeta>('/products/meta')
}

/** POST /products — 新建产品(ADMIN) */
export function createProduct(data: ProductPayload) {
  return post<Product>('/products', data)
}

/** PUT /products/:id — 编辑产品(ADMIN),字段任意子集 */
export function updateProduct(id: number, data: Partial<ProductPayload>) {
  return put<Product>(`/products/${id}`, data)
}

/** POST /products/:id/status — 上架/下架(ADMIN) */
export function setProductStatus(id: number, status: ProductStatus) {
  return post<true>(`/products/${id}/status`, { status })
}

/** DELETE /products/:id — 已被报单引用时 400「请下架而非删除」 */
export function removeProduct(id: number) {
  return del<true>(`/products/${id}`)
}

/**
 * POST /products/import — Excel 报价表整批导入(ADMIN,.xlsx)
 * 传 File 走 multipart/form-data;不要手动设 Content-Type,浏览器会自动带 boundary
 */
export function importProductsExcel(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return post<ProductImportResult>('/products/import', formData)
}

/** POST /products/recalc — 按当前品类计价规则重算全部在售代理价(v2.5,ADMIN) */
export function recalcPrices() {
  return post<{
    updated: number
    disabled: number
    markdownRules: Record<string, MarkdownRule>
    markdownRates: Record<string, number>
  }>('/products/recalc')
}
