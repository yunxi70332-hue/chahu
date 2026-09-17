import { Router } from 'express';
import { prisma } from '../db.js';
import { ok, h, round2 } from '../util.js';
import { authRequired, scopeUserIds } from '../middleware/auth.js';

const router = Router();

function dayStart(d) {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  return t;
}

// 看板聚合数据:全部按当前用户可见范围(scopeUserIds)过滤
router.get('/stats', authRequired, h(async (req, res) => {
  const userIds = await scopeUserIds(req.user);
  const scope = userIds ? { userId: { in: userIds } } : {}; // ADMIN 不过滤

  const now = new Date();
  const today = dayStart(now);
  const tomorrow = new Date(today.getTime() + 86400000);
  // 差价利润是总部口径(代理/会员不应得知上游价),仅 ADMIN 计算
  const isAdmin = req.user.role === 'ADMIN';

  const [todayOrders, todayAmountAgg, payoutAgg, withdrawAgg, pendingCount, userCount, profitAgg] = await Promise.all([
    // 今日提交报单数(全部状态)
    prisma.order.count({ where: { ...scope, createdAt: { gte: today, lt: tomorrow } } }),
    // 今日全部报单总额
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: { ...scope, createdAt: { gte: today, lt: tomorrow } },
    }),
    // 今日打款 = 当日 ORDER 流水合计(v2.4 中介模式:打款即货款,无佣金流水)
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { ...scope, type: { in: ['ORDER', 'COMMISSION'] }, createdAt: { gte: today, lt: tomorrow } },
    }),
    // 今日提现(绝对值)
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { ...scope, type: 'WITHDRAW', createdAt: { gte: today, lt: tomorrow } },
    }),
    prisma.order.count({ where: { ...scope, status: 'PENDING' } }),
    userIds ? Promise.resolve(userIds.length) : prisma.user.count(),
    // 今日差价利润 = 今日审核通过订单的 profit 快照合计(仅 ADMIN)
    isAdmin
      ? prisma.order.aggregate({
          _sum: { profit: true },
          where: { status: 'APPROVED', reviewedAt: { gte: today, lt: tomorrow } },
        })
      : Promise.resolve({ _sum: { profit: null } }),
  ]);

  // 近 N 天趋势:orderAmount(报单金额)+ payout(打款流水)双序列
  const days = Math.min(30, Math.max(7, parseInt(req.query.days) || 7));
  const trendStart = new Date(today.getTime() - (days - 1) * 86400000);
  const inTrend = { gte: trendStart, lt: tomorrow };
  const [trendOrders, trendTxs] = await Promise.all([
    prisma.order.findMany({
      where: { ...scope, createdAt: inTrend },
      select: { createdAt: true, totalAmount: true },
    }),
    prisma.transaction.findMany({
      where: { ...scope, type: { in: ['ORDER', 'COMMISSION'] }, createdAt: inTrend },
      select: { createdAt: true, amount: true },
    }),
  ]);
  const trend = [];
  for (let i = 0; i < days; i++) {
    trend.push({ date: new Date(trendStart.getTime() + i * 86400000).toISOString().slice(0, 10), orderAmount: 0, payout: 0 });
  }
  for (const o of trendOrders) {
    const idx = Math.floor((dayStart(o.createdAt).getTime() - trendStart.getTime()) / 86400000);
    if (idx >= 0 && idx < days) trend[idx].orderAmount = round2(trend[idx].orderAmount + o.totalAmount);
  }
  for (const t of trendTxs) {
    const idx = Math.floor((dayStart(t.createdAt).getTime() - trendStart.getTime()) / 86400000);
    if (idx >= 0 && idx < days) trend[idx].payout = round2(trend[idx].payout + t.amount);
  }

  const [statusRows, catRows] = await Promise.all([
    prisma.order.groupBy({ by: ['status'], _count: true, where: scope }),
    prisma.order.groupBy({ by: ['productType'], _count: true, _sum: { totalAmount: true }, where: scope }),
  ]);
  const statusDist = statusRows.map((r) => ({ status: r.status, count: r._count }));
  const categoryDist = catRows
    .map((r) => ({ category: r.productType, count: r._count, amount: round2(r._sum.totalAmount || 0) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const pendingList = await prisma.order.findMany({
    where: { ...scope, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { user: { select: { name: true, role: true } } },
  });
  const latestPending = pendingList.map((o) => ({
    id: o.id,
    orderNo: o.orderNo,
    productName: o.productName,
    totalAmount: o.totalAmount,
    createdAt: o.createdAt,
    user: o.user,
  }));

  ok(res, {
    cards: {
      todayOrders,
      todayAmount: round2(todayAmountAgg._sum.totalAmount || 0),
      todayPayout: round2(payoutAgg._sum.amount || 0),
      todayWithdraw: round2(Math.abs(withdrawAgg._sum.amount || 0)),
      pendingCount,
      userCount,
      // 仅 ADMIN 有值,代理/会员侧为 undefined 不下发
      ...(isAdmin ? { todayProfit: round2(profitAgg._sum.profit || 0) } : {}),
    },
    trend,
    statusDist,
    categoryDist,
    latestPending,
  });
}));

export default router;
