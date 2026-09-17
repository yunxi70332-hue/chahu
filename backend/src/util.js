import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'baodan-dev-secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '12h';

export function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function comparePassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

export function ok(res, data) {
  res.json({ code: 0, data });
}

export function fail(res, status, message) {
  res.status(status).json({ code: status, message });
}

// 统一包裹 async 路由,异常交给全局错误中间件
export function h(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function genNo(prefix) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}${ts}${rand}`;
}

export function parsePage(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(query.pageSize) || 10));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

// 金额四舍五入到 2 位小数
export function round2(n) {
  return Math.round(n * 100) / 100;
}

// 读取品类佣金比例设置(Setting key=commission_rates,JSON {品类:比例}),未配置按 0
// v2.3 起佣金机制废弃,此读取仅为历史数据兼容保留
export async function getCommissionRates() {
  const s = await prisma.setting.findUnique({ where: { key: 'commission_rates' } });
  if (!s) return {};
  try {
    const v = JSON.parse(s.value);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

// 品类计价规则(v2.5,Setting key=markdown_rules):{ 品类: { mode:'percent'|'fixed', value } }
// - percent:代理收购价 = 上游价 ×(1 - value/100)
// - fixed  :代理收购价 = 上游价 - value(元)
// 未配置的品类按 percent/0 处理(代理价=上游价)。
// 兼容:新 key 不存在时,把旧 key markdown_rates 的 {品类:下浮%} 规范化为 percent 规则返回,
// 因此存量数据无需迁移即可继续工作。
export async function getMarkdownRules() {
  const [s, legacy] = await Promise.all([
    prisma.setting.findUnique({ where: { key: 'markdown_rules' } }),
    prisma.setting.findUnique({ where: { key: 'markdown_rates' } }),
  ]);
  let raw = null;
  if (s) {
    try {
      raw = JSON.parse(s.value);
    } catch {
      raw = null;
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return normalizeRules(raw);
  if (!legacy) return {};
  try {
    const v = JSON.parse(legacy.value);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const converted = {};
    for (const [k, rate] of Object.entries(v)) converted[k] = { mode: 'percent', value: Number(rate) || 0 };
    return converted;
  } catch {
    return {};
  }
}

// 规则规范化 + 校验:丢弃非法项,统一 mode/value 形态
export function normalizeRules(input) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input)) {
    const name = String(k).trim();
    if (!name) continue;
    // 兼容 { 品类: 数字 } 的简写(等价 percent)
    const rule = v && typeof v === 'object' && !Array.isArray(v) ? v : { mode: 'percent', value: v };
    const mode = rule.mode === 'fixed' ? 'fixed' : 'percent';
    const value = Number(rule.value);
    if (!Number.isFinite(value) || value < 0) continue;
    if (mode === 'percent' && value > 100) continue;
    out[name] = { mode, value: round2(value) };
  }
  return out;
}

// 单一计价入口:代理收购价 = 上游价 ×(1-下浮%) 或 上游价 - 固定减额
// 上游价非法返回 null(调用方据此下架);未配置规则按 percent/0(代理价=上游价)
export function computeAgentPrice(upstream, rule) {
  if (!Number.isFinite(upstream)) return null;
  const value = Number(rule?.value) || 0;
  const raw = rule?.mode === 'fixed' ? upstream - value : upstream * (1 - value / 100);
  return round2(raw);
}

// 由规则派生下浮比例映射(仅 percent 品类),供 /recalc 等旧响应字段兼容
export function rulesToRates(rules) {
  const rates = {};
  for (const [k, r] of Object.entries(rules || {})) {
    if (r?.mode === 'percent') rates[k] = r.value;
  }
  return rates;
}
