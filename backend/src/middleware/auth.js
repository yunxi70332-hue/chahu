import { verifyToken } from '../util.js';
import { prisma } from '../db.js';
import { fail } from '../util.js';

// 校验 JWT 并挂载 req.user
export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return fail(res, 401, '未登录或登录已过期');
  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return fail(res, 401, '账号不存在');
    if (user.status === 'FROZEN') return fail(res, 403, '账号已被冻结');
    req.user = user;
    next();
  } catch {
    return fail(res, 401, '登录已过期,请重新登录');
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return fail(res, 403, '无权限执行该操作');
    }
    next();
  };
}

// 数据可见范围:ADMIN(总部)全部;AGENT/MEMBER 仅自己
// (层级只有总部/代理两级,代理没有下线,不再递归向下)
export async function scopeUserIds(user) {
  if (user.role === 'ADMIN') return null; // null 表示不过滤
  return [user.id];
}
