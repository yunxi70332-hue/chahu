import { Router } from 'express';
import { prisma } from '../db.js';
import { ok, fail, h, genNo, parsePage, round2 } from '../util.js';
import { authRequired, scopeUserIds } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

const METHODS = ['ALIPAY', 'WECHAT', 'BANK'];
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
// 审核权收归总部(v2.3 审单同规则)
const REVIEWERS = ['ADMIN'];

// :id 参数合法性守卫
router.param('id', (req, res, next) => {
  const n = Number(req.params.id);
  if (Number.isInteger(n) && n > 0) {
    req.params.id = n;
    return next();
  }
  return fail(res, 400, '非法的 ID');
});

// 范围内待审提现合计
async function pendingSumOf(userId) {
  const agg = await prisma.withdrawRequest.aggregate({
    where: { userId, status: 'PENDING' },
    _sum: { amount: true },
  });
  return round2(agg._sum.amount || 0);
}

// 发起申请:仅 AGENT/MEMBER,须已实名通过;金额 ≤ 余额-待审合计(防超额申请)
router.post('/', h(async (req, res) => {
  if (req.user.role === 'ADMIN') return fail(res, 400, '总部账号无需申请提现,请在用户管理中直接记账');
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return fail(res, 401, '账号不存在');
  if (user.status !== 'ACTIVE') return fail(res, 403, '账号已被冻结,无法申请提现');
  if (user.realnameStatus !== 'APPROVED') return fail(res, 400, '请先完成实名认证并通过审核后再申请提现');

  const { method } = req.body || {};
  if (!METHODS.includes(method)) return fail(res, 400, '收款方式不合法');
  const account = String(req.body?.account || '').trim();
  if (!account) return fail(res, 400, '请填写收款账号');
  if (account.length > 100) return fail(res, 400, '收款账号过长');
  const accountName = String(req.body?.accountName || '').trim();
  if (!accountName) return fail(res, 400, '请填写收款人姓名');
  if (accountName.length > 50) return fail(res, 400, '收款人姓名过长');

  const amount = round2(Number(req.body?.amount));
  if (!Number.isFinite(amount) || amount <= 0) return fail(res, 400, '提现金额必须大于 0');
  const available = round2(user.balance - (await pendingSumOf(user.id)));
  if (amount > available) {
    return fail(res, 400, `超出可用余额,当前可用 ¥${available.toFixed(2)}`);
  }

  const record = await prisma.withdrawRequest.create({
    data: { wdNo: genNo('WD'), userId: user.id, amount, method, account, accountName },
  });
  ok(res, record);
}));

// 列表:ADMIN 全量,AGENT/MEMBER 仅自己
router.get('/', h(async (req, res) => {
  const userIds = await scopeUserIds(req.user);
  const where = {};
  if (userIds) where.userId = { in: userIds };
  if (req.query.status && STATUSES.includes(req.query.status)) where.status = req.query.status;
  // userId 筛选不得越过数据范围,范围外一律空结果(与 transactions 同规则)
  if (req.query.userId) {
    const uid = parseInt(req.query.userId);
    if (userIds) where.userId = userIds.includes(uid) ? uid : -1;
    else where.userId = uid;
  }
  if (req.query.keyword) {
    where.wdNo = { contains: String(req.query.keyword).trim() };
  }
  if (req.query.startDate || req.query.endDate) {
    where.createdAt = {};
    if (req.query.startDate) where.createdAt.gte = new Date(`${req.query.startDate}T00:00:00`);
    if (req.query.endDate) where.createdAt.lte = new Date(`${req.query.endDate}T23:59:59`);
  }
  const { skip, take, page, pageSize } = parsePage(req.query);
  const [total, list, pendingAgg] = await Promise.all([
    prisma.withdrawRequest.count({ where }),
    prisma.withdrawRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        user: { select: { id: true, name: true, phone: true, role: true } },
        transaction: { select: { txNo: true } },
      },
    }),
    prisma.withdrawRequest.aggregate({ where: { ...where, status: 'PENDING' }, _sum: { amount: true } }),
  ]);
  ok(res, {
    total,
    page,
    pageSize,
    pendingSum: round2(pendingAgg._sum.amount || 0),
    list,
  });
}));

// 详情:本人或 ADMIN
router.get('/:id', h(async (req, res) => {
  const record = await prisma.withdrawRequest.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, name: true, phone: true, role: true, balance: true, realName: true } },
      transaction: { select: { txNo: true } },
    },
  });
  if (!record) return fail(res, 404, '提现申请不存在');
  if (req.user.role !== 'ADMIN' && record.userId !== req.user.id) return fail(res, 403, '无权限查看该申请');
  ok(res, record);
}));

function conflict(message, status) {
  const e = new Error(message);
  e.isConflict = true;
  e.status = status;
  return e;
}

// 审核通过:申请单/用户读取与校验放在事务内(SQLite 写事务串行),防止并发双审双扣;
// 通过后余额不足则拒绝,由管理员改走驳回
async function doApprove(id, reviewer) {
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.withdrawRequest.findUnique({ where: { id } });
      if (!record) throw conflict('提现申请不存在', 404);
      if (record.status !== 'PENDING') throw conflict('该申请已审核过', 400);
      const user = await tx.user.findUnique({ where: { id: record.userId } });
      if (!user) throw conflict('申请人不存在', 400);
      if (round2(user.balance) < record.amount) throw conflict('申请人当前余额不足,请驳回该申请', 400);

      const balance = round2(user.balance - record.amount);
      await tx.user.update({ where: { id: user.id }, data: { balance } });
      const transaction = await tx.transaction.create({
        data: {
          txNo: genNo('TX'),
          userId: user.id,
          type: 'WITHDRAW',
          amount: -record.amount,
          balanceAfter: balance,
          remark: `提现打款 ${record.wdNo}`,
        },
      });
      return tx.withdrawRequest.update({
        where: { id: record.id },
        data: {
          status: 'APPROVED',
          reviewedBy: reviewer.id,
          reviewedAt: new Date(),
          transactionId: transaction.id,
        },
      });
    });
    return { ok: true, record: updated };
  } catch (e) {
    if (e && e.isConflict) return { ok: false, code: e.status, reason: e.message };
    throw e;
  }
}

// 审核驳回:原因必填,不动余额
async function doReject(id, reviewer, reason) {
  if (!reason || !String(reason).trim()) return { ok: false, code: 400, reason: '请填写驳回原因' };
  const record = await prisma.withdrawRequest.findUnique({ where: { id } });
  if (!record) return { ok: false, code: 404, reason: '提现申请不存在' };
  if (record.status !== 'PENDING') return { ok: false, code: 400, reason: '该申请已审核过' };
  const updated = await prisma.withdrawRequest.update({
    where: { id: record.id },
    data: {
      status: 'REJECTED',
      reviewedBy: reviewer.id,
      reviewedAt: new Date(),
      rejectReason: String(reason).trim(),
    },
  });
  return { ok: true, record: updated };
}

router.post('/:id/approve', h(async (req, res) => {
  if (!REVIEWERS.includes(req.user.role)) return fail(res, 403, '无权限执行审核');
  const r = await doApprove(req.params.id, req.user);
  if (!r.ok) return fail(res, r.code, r.reason);
  ok(res, r.record);
}));

router.post('/:id/reject', h(async (req, res) => {
  if (!REVIEWERS.includes(req.user.role)) return fail(res, 403, '无权限执行审核');
  const r = await doReject(req.params.id, req.user, req.body?.reason);
  if (!r.ok) return fail(res, r.code, r.reason);
  ok(res, r.record);
}));

// 撤销:申请人撤回自己的待审单(ADMIN 也可代撤),不动余额
router.delete('/:id', h(async (req, res) => {
  const record = await prisma.withdrawRequest.findUnique({ where: { id: req.params.id } });
  if (!record) return fail(res, 404, '提现申请不存在');
  if (req.user.role !== 'ADMIN' && record.userId !== req.user.id) return fail(res, 403, '无权限操作该申请');
  if (record.status !== 'PENDING') return fail(res, 400, '仅待审核的申请可以撤销');
  await prisma.withdrawRequest.delete({ where: { id: record.id } });
  ok(res, true);
}));

export default router;
