import { Router } from 'express';
import { prisma } from '../db.js';
import { ok, fail, h, getCommissionRates, getMarkdownRules, rulesToRates } from '../util.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

// 佣金比例设置:v2.3 废弃,仅历史兼容可读
router.get('/commission', h(async (_req, res) => {
  const rates = await getCommissionRates();
  ok(res, { rates });
}));

// 保存:仅 ADMIN,全量覆盖(历史兼容保留)
router.put('/commission', requireRole('ADMIN'), h(async (req, res) => {
  const rates = req.body?.rates;
  if (!rates || typeof rates !== 'object' || Array.isArray(rates)) {
    return fail(res, 400, 'rates 必须是 { 品类: 比例 } 对象');
  }
  const clean = {};
  for (const [k, v] of Object.entries(rates)) {
    const num = Number(v);
    if (!k.trim() || Number.isNaN(num) || num < 0 || num > 100) return fail(res, 400, `比例不合法(需在 0-100 之间):${k}`);
    clean[k.trim()] = num;
  }
  const value = JSON.stringify(clean);
  await prisma.setting.upsert({
    where: { key: 'commission_rates' },
    update: { value },
    create: { key: 'commission_rates', value },
  });
  ok(res, { rates: clean });
}));

// 品类计价规则(v2.5):代理收购价 = 上游报价 ×(1 - 下浮%) 或 上游报价 - 固定减额(元)
// 响应同时给出 rules(新)与 rates(仅 percent 品类派生,旧前端/脚本兼容)
router.get('/markdown', h(async (_req, res) => {
  const rules = await getMarkdownRules();
  ok(res, { rules, rates: rulesToRates(rules) });
}));

// 保存计价规则:仅 ADMIN,全量覆盖;保存后需调 /products/recalc 重算在售代理价
// 请求体优先取 { rules },并兼容旧版 { rates: {品类:数字} }(= 全 percent)
router.put('/markdown', requireRole('ADMIN'), h(async (req, res) => {
  const body = req.body || {};
  const payload = body.rules !== undefined ? body.rules : body.rates;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fail(res, 400, 'rules 必须是 { 品类: { mode, value } } 对象');
  }
  const clean = {};
  for (const [k, v] of Object.entries(payload)) {
    const name = String(k).trim();
    if (!name) return fail(res, 400, '品类名称不能为空');
    const rule = v && typeof v === 'object' && !Array.isArray(v) ? v : { mode: 'percent', value: v };
    const mode = rule.mode === 'fixed' ? 'fixed' : 'percent';
    const num = Number(rule.value);
    if (!Number.isFinite(num) || num < 0) return fail(res, 400, `计价数值不合法(不能为负):${name}`);
    if (mode === 'percent' && num > 100) return fail(res, 400, `下浮比例不合法(需在 0-100 之间):${name}`);
    if (mode === 'fixed' && num > 1000000) return fail(res, 400, `固定减额过大(上限 1000000 元):${name}`);
    clean[name] = { mode, value: num };
  }
  const value = JSON.stringify(clean);
  await prisma.setting.upsert({
    where: { key: 'markdown_rules' },
    update: { value },
    create: { key: 'markdown_rules', value },
  });
  ok(res, { rules: clean, rates: rulesToRates(clean) });
}));

export default router;
