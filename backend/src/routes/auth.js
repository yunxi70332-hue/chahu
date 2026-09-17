import { Router } from 'express';
import { prisma } from '../db.js';
import { signToken, comparePassword, hashPassword, ok, fail, h } from '../util.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

// 登录失败锁定:同一手机号 5 次失败锁 10 分钟(内存态,重启即清零)
const failMap = new Map();
const LOCK_LIMIT = 5;
const LOCK_MS = 10 * 60 * 1000;

// 登录
router.post('/login', h(async (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) return fail(res, 400, '请输入手机号和密码');
  const key = String(phone).trim();
  const rec = failMap.get(key);
  if (rec && rec.lockedUntil > Date.now()) {
    return fail(res, 429, `失败次数过多,请 ${Math.ceil((rec.lockedUntil - Date.now()) / 60000)} 分钟后再试`);
  }
  const user = await prisma.user.findUnique({ where: { phone: key } });
  if (!user || !comparePassword(password, user.passwordHash)) {
    const cur = failMap.get(key) || { count: 0, lockedUntil: 0 };
    cur.count += 1;
    if (cur.count >= LOCK_LIMIT) {
      cur.lockedUntil = Date.now() + LOCK_MS;
      cur.count = 0;
    }
    failMap.set(key, cur);
    return fail(res, 400, '手机号或密码错误');
  }
  failMap.delete(key);
  if (user.status === 'FROZEN') return fail(res, 403, '账号已被冻结,请联系管理员');
  const safe = { id: user.id, phone: user.phone, name: user.name, role: user.role };
  ok(res, { token: signToken(user), user: safe });
}));

// 当前用户信息
router.get('/me', authRequired, h(async (req, res) => {
  const { id, phone, name, role, balance, parentId, realnameStatus } = req.user;
  ok(res, { id, phone, name, role, balance, parentId, realnameStatus });
}));

// 修改密码
router.post('/password', authRequired, h(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return fail(res, 400, '请填写原密码和新密码');
  if (String(newPassword).length < 6) return fail(res, 400, '新密码至少 6 位');
  if (!comparePassword(oldPassword, req.user.passwordHash)) {
    return fail(res, 400, '原密码错误');
  }
  await prisma.user.update({
    where: { id: req.user.id },
    data: { passwordHash: hashPassword(newPassword) },
  });
  ok(res, true);
}));

export default router;
