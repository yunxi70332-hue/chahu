import { Router } from 'express';
import { prisma } from '../db.js';
import { ok, fail, h, genNo, parsePage, hashPassword, round2 } from '../util.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authRequired, requireRole('ADMIN'));

const PHONE_RE = /^1[3-9]\d{9}$/;

// :id 参数合法性守卫
router.param('id', (req, res, next) => {
  const n = Number(req.params.id);
  if (Number.isInteger(n) && n > 0) {
    req.params.id = n;
    return next();
  }
  return fail(res, 400, '非法的 ID');
});

// 用户列表
router.get('/', h(async (req, res) => {
  const where = {};
  if (req.query.role) where.role = req.query.role;
  if (req.query.status) where.status = req.query.status;
  if (req.query.keyword) {
    const kw = String(req.query.keyword).trim();
    where.OR = [{ name: { contains: kw } }, { phone: { contains: kw } }];
  }
  const { skip, take, page, pageSize } = parsePage(req.query);
  const [total, list] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { id: 'asc' },
      skip,
      take,
      select: {
        id: true, phone: true, name: true, role: true, parentId: true, level: true,
        balance: true, status: true, createdAt: true,
        realName: true, idCardNo: true, realnameStatus: true,
        realnameRejectReason: true, realnameSubmittedAt: true, realnameReviewedAt: true,
        parent: { select: { name: true } },
      },
    }),
  ]);
  ok(res, { total, page, pageSize, list });
}));

// 新建用户
router.post('/', h(async (req, res) => {
  const b = req.body || {};
  if (!PHONE_RE.test(String(b.phone || ''))) return fail(res, 400, '手机号格式不正确');
  if (!b.name) return fail(res, 400, '请填写姓名');
  if (String(b.password || '').length < 6) return fail(res, 400, '初始密码至少 6 位');
  if (!['ADMIN', 'AGENT', 'MEMBER'].includes(b.role)) return fail(res, 400, '角色不合法');
  const exists = await prisma.user.findUnique({ where: { phone: b.phone } });
  if (exists) return fail(res, 400, '该手机号已存在');
  // 上级校验:层级只有总部/代理两级,上级只能是总部(管理员)
  const parentId = b.parentId ? parseInt(b.parentId) : null;
  if (parentId) {
    const parent = await prisma.user.findUnique({ where: { id: parentId } });
    if (!parent) return fail(res, 400, '上级不存在');
    if (parent.role !== 'ADMIN') return fail(res, 400, '层级只有总部/代理两级,上级只能是总部(管理员)');
  }

  const initial = Math.max(0, Number(b.balance) || 0);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        phone: b.phone,
        name: b.name,
        role: b.role,
        parentId,
        level: Math.max(0, parseInt(b.level) || 0),
        balance: initial,
        passwordHash: hashPassword(b.password),
      },
    });
    if (initial > 0) {
      await tx.transaction.create({
        data: {
          txNo: genNo('TX'),
          userId: created.id,
          type: 'RECHARGE',
          amount: initial,
          balanceAfter: initial,
          remark: '开户充值',
        },
      });
    }
    return created;
  });
  ok(res, { id: user.id });
}));

// 编辑用户
router.put('/:id', h(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!user) return fail(res, 404, '用户不存在');
  const b = req.body || {};
  if (b.phone && !PHONE_RE.test(String(b.phone))) return fail(res, 400, '手机号格式不正确');
  if (b.phone && b.phone !== user.phone) {
    const exists = await prisma.user.findUnique({ where: { phone: b.phone } });
    if (exists) return fail(res, 400, '该手机号已存在');
  }
  // 上级校验:层级只有总部/代理两级,上级只能是总部(管理员);不能是自己,沿链查环兜底
  let newParentId = b.parentId === undefined ? user.parentId : (b.parentId ? parseInt(b.parentId) : null);
  if (newParentId) {
    if (newParentId === user.id) return fail(res, 400, '上级不能是自己');
    const parent = await prisma.user.findUnique({ where: { id: newParentId } });
    if (!parent) return fail(res, 400, '上级不存在');
    if (parent.role !== 'ADMIN') return fail(res, 400, '层级只有总部/代理两级,上级只能是总部(管理员)');
    let cursor = parent;
    const seen = new Set([user.id]);
    while (cursor.parentId) {
      if (seen.has(cursor.parentId)) return fail(res, 400, '上级设置会形成循环,请调整');
      seen.add(cursor.parentId);
      const next = await prisma.user.findUnique({ where: { id: cursor.parentId } });
      if (!next) break;
      cursor = next;
    }
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      phone: b.phone ?? user.phone,
      name: b.name ?? user.name,
      role: b.role ?? user.role,
      parentId: newParentId,
      level: b.level === undefined ? user.level : Math.max(0, parseInt(b.level) || 0),
    },
  });
  ok(res, true);
}));

// 冻结 / 解冻
router.post('/:id/freeze', h(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!user) return fail(res, 404, '用户不存在');
  if (user.id === req.user.id) return fail(res, 400, '不能冻结自己的账号');
  await prisma.user.update({ where: { id: user.id }, data: { status: 'FROZEN' } });
  ok(res, true);
}));

router.post('/:id/unfreeze', h(async (req, res) => {
  await prisma.user.update({ where: { id: parseInt(req.params.id) }, data: { status: 'ACTIVE' } });
  ok(res, true);
}));

// 重置密码
router.post('/:id/reset-password', h(async (req, res) => {
  const password = String(req.body?.password || '');
  if (password.length < 6) return fail(res, 400, '新密码至少 6 位');
  await prisma.user.update({
    where: { id: parseInt(req.params.id) },
    data: { passwordHash: hashPassword(password) },
  });
  ok(res, true);
}));

// 调整余额(充值/提现/调整),写入流水
router.post('/:id/balance', h(async (req, res) => {
  const { type, amount: rawAmount, remark } = req.body || {};
  if (!remark || !String(remark).trim()) return fail(res, 400, '请填写调整备注');
  if (!['RECHARGE', 'WITHDRAW', 'ADJUST'].includes(type)) return fail(res, 400, '调整类型不合法');

  // 金额统一舍入到分:RECHARGE 恒为正,WITHDRAW 恒为负,ADJUST 按填写符号
  const num = Number(rawAmount);
  let delta;
  if (type === 'WITHDRAW') delta = -round2(Math.abs(num));
  else if (type === 'RECHARGE') delta = round2(Math.abs(num));
  else delta = round2(num);
  if (!Number.isFinite(delta) || delta === 0) return fail(res, 400, '金额必须大于 0');

  // 用户读取放在事务内,防止并发下基于旧余额覆盖写
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!user) return { error: 404, message: '用户不存在' };
    if (round2(user.balance + delta) < 0) return { error: 400, message: '调整后余额不能为负' };
    const balanceAfter = round2(user.balance + delta);
    await tx.user.update({ where: { id: user.id }, data: { balance: balanceAfter } });
    const record = await tx.transaction.create({
      data: {
        txNo: genNo('TX'),
        userId: user.id,
        type,
        amount: delta,
        balanceAfter,
        remark: remark || null,
      },
    });
    return { record };
  });
  if (result.error) return fail(res, result.error, result.message);
  ok(res, result.record);
}));

// 用户下拉选项(建单选报单人):默认仅返回已实名的 ACTIVE 用户;?all=1 返回全部
router.get('/options', h(async (req, res) => {
  const where = { status: 'ACTIVE' };
  if (req.query.all !== '1') {
    where.realnameStatus = 'APPROVED';
    where.role = { not: 'ADMIN' };
  }
  const list = await prisma.user.findMany({
    where,
    select: {
      id: true, name: true, phone: true, role: true, balance: true, realnameStatus: true,
    },
    orderBy: { id: 'asc' },
  });
  ok(res, list);
}));

export default router;
