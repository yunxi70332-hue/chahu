import { Router } from 'express';
import { prisma } from '../db.js';
import { ok, h, parsePage, round2 } from '../util.js';
import { authRequired, scopeUserIds } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

const TYPES = ['RECHARGE', 'WITHDRAW', 'ORDER', 'COMMISSION', 'ADJUST'];
const TYPE_LABELS = { ORDER: '报单打款', COMMISSION: '佣金', WITHDRAW: '提现', RECHARGE: '补款', ADJUST: '调整' };

// 流水列表:ADMIN 全量,AGENT 自己+下线,MEMBER 仅自己
router.get('/', h(async (req, res) => {
  const userIds = await scopeUserIds(req.user);
  const where = {};
  if (userIds) where.userId = { in: userIds };
  if (req.query.type && TYPES.includes(req.query.type)) where.type = req.query.type;
  // userId 筛选不得越过数据范围:AGENT/MEMBER 只能在自己范围内过滤,范围外一律给空结果
  if (req.query.userId) {
    const uid = parseInt(req.query.userId);
    if (userIds) where.userId = userIds.includes(uid) ? uid : -1;
    else where.userId = uid;
  }
  if (req.query.keyword) {
    where.txNo = { contains: String(req.query.keyword).trim() };
  }
  if (req.query.startDate || req.query.endDate) {
    where.createdAt = {};
    if (req.query.startDate) where.createdAt.gte = new Date(`${req.query.startDate}T00:00:00`);
    if (req.query.endDate) where.createdAt.lte = new Date(`${req.query.endDate}T23:59:59`);
  }
  const { skip, take, page, pageSize } = parsePage(req.query);
  // 收支合计与列表同 where:正金额合计 / 负金额绝对值合计
  const [total, list, incomeAgg, expenseAgg] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        user: { select: { id: true, name: true, phone: true } },
        order: { select: { orderNo: true } },
      },
    }),
    prisma.transaction.aggregate({ where: { ...where, amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { ...where, amount: { lt: 0 } }, _sum: { amount: true } }),
  ]);
  ok(res, {
    total,
    page,
    pageSize,
    incomeSum: round2(incomeAgg._sum.amount || 0),
    expenseSum: round2(Math.abs(expenseAgg._sum.amount || 0)),
    list: list.map((t) => ({ ...t, typeLabel: TYPE_LABELS[t.type] || t.type })),
  });
}));

export default router;
