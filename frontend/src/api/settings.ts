import { get, put } from './http'
import type { MarkdownRule, MarkdownSetting } from './types'

/** GET /settings/markdown — 品类计价规则(v2.5,未配置的品类按下浮 0,即代理价=上游价) */
export function getMarkdown() {
  return get<MarkdownSetting>('/settings/markdown')
}

/** PUT /settings/markdown — 全量覆盖保存(ADMIN);保存后需调 recalcPrices 重算在售代理价 */
export function setMarkdown(rules: Record<string, MarkdownRule>) {
  return put<MarkdownSetting>('/settings/markdown', { rules })
}
