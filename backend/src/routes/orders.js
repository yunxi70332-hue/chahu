import { Router } from 'express';
import { prisma } from '../db.js';
import { ok, fail, h, genNo, parsePage, round2 } from '../util.js';
import { authRequired, requireRole, scopeUserIds } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

// :id 参数合法性守卫(防 NaN 打进 Prisma 变 500)
router.param('id', (req, res, next) => {
  const n = Number(req.params.id);
  if (Number.isInteger(n) && n > 0) {
    req.params.id = n;
    return next();
  }
  return fail(res, 400, '非法的 ID');
});

// 审核人:仅总部(ADMIN)。代理没有审单权限,审单权收归总部
const REVIEWERS = ['ADMIN'];

// 操作范围:ADMIN 全量;AGENT/MEMBER 仅自己(层级只有总部/代理两级,代理无下线)
async function inScope(orderUserId, user) {
  if (user.role === 'ADMIN') return true;
  const ids = await scopeUserIds(user);
  return ids.includes(orderUserId);
}

function buildWhere(query, userIds) {
  const where = {};
  if (userIds) where.userId = { in: userIds };
  if (query.status) where.status = query.status;
  if (query.type) where.productType = query.type;
  // userId 筛选不得越过数据范围:AGENT/MEMBER 只能在自己范围内过滤,范围外一律给空结果
  if (query.userId) {
    const uid = parseInt(query.userId);
    if (userIds) where.userId = userIds.includes(uid) ? uid : -1;
    else where.userId = uid;
  }
  if (query.keyword) {
    const kw = String(query.keyword).trim();
    where.OR = [
      { orderNo: { contains: kw } },
      { logisticsNo: { contains: kw } },
      { productName: { contains: kw } },
      { user: { is: { OR: [{ name: { contains: kw } }, { phone: { contains: kw } }] } } },
    ];
  }
  if (query.startDate || query.endDate) {
    where.createdAt = {};
    if (query.startDate) where.createdAt.gte = new Date(`${query.startDate}T00:00:00`);
    if (query.endDate) where.createdAt.lte = new Date(`${query.endDate}T23:59:59`);
  }
  return where;
}

// 上游价/差价利润是商业机密,仅总部可见:返回给代理/会员前裁剪
function sanitizeOrder(order, role) {
  if (!order || role === 'ADMIN') return order;
  const { upstreamPrice, profit, ...rest } = order;
  return rest;
}

const ORDER_INCLUDE = {
  user: { select: { id: true, name: true, phone: true, role: true } },
  reviewer: { select: { name: true } },
};

// 报单列表
router.get('/', h(async (req, res) => {
  const userIds = await scopeUserIds(req.user);
  const where = buildWhere(req.query, userIds);
  const { skip, take, page, pageSize } = parsePage(req.query);
  const [total, list] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: ORDER_INCLUDE,
    }),
  ]);
  ok(res, {
    total,
    page,
    pageSize,
    list: list.map((o) => sanitizeOrder(o, req.user.role)),
  });
}));

// 新建报单
router.post('/', h(async (req, res) => {
  const b = req.body || {};
  // 非管理员只能给自己报单
  const targetUserId = req.user.role === 'ADMIN' && b.userId ? parseInt(b.userId) : req.user.id;
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) return fail(res, 400, '报单人不存在');
  if (target.status === 'FROZEN') return fail(res, 400, '报单人账号已冻结');
  // 实名门槛(本版本代理与会员同一性质):报单人须实名审核通过,管理员作为报单人除外
  if (target.role !== 'ADMIN' && target.realnameStatus !== 'APPROVED') {
    return fail(res, 400, `报单人 ${target.name} 未完成实名认证,请先在「实名认证」页提交并等待审核通过`);
  }

  let productId = null;
  let productName = b.productName;
  let productType = b.productType;
  let spec = b.spec || null;
  let unitPrice = Number(b.unitPrice);
  let upstreamPrice = null;

  if (b.productId) {
    const product = await prisma.product.findUnique({ where: { id: parseInt(b.productId) } });
    if (!product) return fail(res, 400, '产品不存在');
    if (product.status !== 'ACTIVE') return fail(res, 400, '该产品已下架');
    productId = product.id;
    productName = product.name;
    productType = product.category;
    spec = [product.memory, product.disk, product.screen, product.color].filter(Boolean).join(' / ') || null;
    if (!unitPrice || Number.isNaN(unitPrice)) unitPrice = product.price ?? 0;
    // 上游价快照:建单时锁定,报价变动不影响历史单的利润口径
    upstreamPrice = product.upstreamPrice ?? null;
  }
  if (!productName || !productType) return fail(res, 400, '请选择产品或填写产品名称/类型');
  const quantity = Math.max(1, parseInt(b.quantity) || 1);
  if (!unitPrice || Number.isNaN(unitPrice) || unitPrice <= 0) return fail(res, 400, '单价必须大于 0');
  const totalAmount = round2(quantity * unitPrice);

  // v2.4 中介模式:佣金机制废弃(恒 0);利润 =(上游价-结算价)×数量,议价高于上游价为负,
  // 不硬拦,审核列表标红由总部人工把关
  const commission = 0;
  const profit = upstreamPrice != null ? round2((upstreamPrice - unitPrice) * quantity) : 0;

  const created = await prisma.order.create({
    data: {
      orderNo: genNo('BD'),
      userId: targetUserId,
      productId,
      productName,
      productType,
      spec,
      quantity,
      unitPrice,
      totalAmount,
      upstreamPrice,
      profit,
      commission,
      logisticsNo: b.logisticsNo ? String(b.logisticsNo).trim() : null,
      remark: b.remark || null,
    },
  });
  const full = await prisma.order.findUnique({ where: { id: created.id }, include: ORDER_INCLUDE });
  ok(res, sanitizeOrder(full, req.user.role));
}));

// 编辑报单(待审核可改;已驳回可改后重新提交,回到待审核;范围:自己/下线)
router.put('/:id', h(async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!order) return fail(res, 404, '报单不存在');
  if (!(await inScope(order.userId, req.user))) return fail(res, 403, '无权限操作该报单(仅限自己与下线)');
  if (order.status !== 'PENDING' && order.status !== 'REJECTED') {
    return fail(res, 400, '仅待审核或已驳回的报单可以编辑');
  }
  const resubmit = order.status === 'REJECTED';

  const b = req.body || {};
  const quantity = Math.max(1, parseInt(b.quantity) || order.quantity);
  const unitPrice = Number(b.unitPrice ?? order.unitPrice);
  if (!unitPrice || Number.isNaN(unitPrice) || unitPrice <= 0) return fail(res, 400, '单价必须大于 0');
  // v2.4:佣金字段废弃(存量待审单一并归零),利润随改价重算
  const profit = order.upstreamPrice != null ? round2((order.upstreamPrice - unitPrice) * quantity) : 0;
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      quantity,
      unitPrice,
      totalAmount: round2(quantity * unitPrice),
      commission: 0,
      profit,
      logisticsNo: b.logisticsNo === undefined ? order.logisticsNo : (b.logisticsNo ? String(b.logisticsNo).trim() : null),
      remark: b.remark ?? order.remark,
      // 驳回单改后重提:回到待审核,清空上一轮审核痕迹
      ...(resubmit ? { status: 'PENDING', rejectReason: null, reviewedBy: null, reviewedAt: null } : {}),
    },
  });
  ok(res, sanitizeOrder(updated, req.user.role));
}));

// 删除报单(仅待审核;范围:自己/下线)
router.delete('/:id', h(async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!order) return fail(res, 404, '报单不存在');
  if (!(await inScope(order.userId, req.user))) return fail(res, 403, '无权限操作该报单(仅限自己与下线)');
  if (order.status !== 'PENDING') return fail(res, 400, '仅待审核的报单可以删除');
  await prisma.order.delete({ where: { id: order.id } });
  ok(res, true);
}));

// 审核通过(v2.4 中介模式):余额 += 货款(收购价),一笔流水。
// 差价利润 = (上游价-结算价)×数量 留存系统;佣金机制已废弃。
// 订单/用户读取与校验放在事务内(SQLite 写事务串行),防止并发双审双打款
async function doApprove(orderId, reviewer, remark) {
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw conflict('报单不存在', 404);
      if (order.status !== 'PENDING') throw conflict('该报单已审核过', 400);
      const user = await tx.user.findUnique({ where: { id: order.userId } });
      if (!user) throw conflict('报单人不存在', 400);

      const balance = round2(user.balance + order.totalAmount);
      await tx.user.update({ where: { id: user.id }, data: { balance } });
      await tx.transaction.create({
        data: {
          txNo: genNo('TX'),
          userId: user.id,
          type: 'ORDER',
          amount: round2(order.totalAmount),
          balanceAfter: balance,
          orderId: order.id,
          remark: `报单打款 ${order.orderNo}`,
        },
      });
      return tx.order.update({
        where: { id: order.id },
        data: { status: 'APPROVED', reviewedBy: reviewer.id, reviewedAt: new Date(), remark: remark || order.remark },
      });
    });
    return { ok: true, order: updated };
  } catch (e) {
    if (e && e.isConflict) return { ok: false, code: e.status, reason: e.message };
    throw e;
  }
}

function conflict(message, status) {
  const e = new Error(message);
  e.isConflict = true;
  e.status = status;
  return e;
}

// 审核驳回:原因写入 rejectReason,保留报单人原备注
async function doReject(orderId, reviewer, remark) {
  if (!remark || !String(remark).trim()) return { ok: false, code: 400, reason: '请填写驳回原因' };
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, code: 404, reason: '报单不存在' };
  if (order.status !== 'PENDING') return { ok: false, code: 400, reason: '该报单已审核过' };
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status: 'REJECTED', reviewedBy: reviewer.id, reviewedAt: new Date(), rejectReason: String(remark).trim() },
  });
  return { ok: true, order: updated };
}

router.post('/:id/approve', h(async (req, res) => {
  if (!REVIEWERS.includes(req.user.role)) return fail(res, 403, '无权限执行审核');
  const order = await prisma.order.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!order) return fail(res, 404, '报单不存在');
  if (!(await inScope(order.userId, req.user))) return fail(res, 403, '无权限操作该报单(仅限自己与下线)');
  const r = await doApprove(order.id, req.user, req.body?.remark || null);
  if (!r.ok) return fail(res, r.code, r.reason);
  ok(res, r.order);
}));

router.post('/:id/reject', h(async (req, res) => {
  if (!REVIEWERS.includes(req.user.role)) return fail(res, 403, '无权限执行审核');
  const order = await prisma.order.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!order) return fail(res, 404, '报单不存在');
  if (!(await inScope(order.userId, req.user))) return fail(res, 403, '无权限操作该报单(仅限自己与下线)');
  const r = await doReject(order.id, req.user, req.body?.remark || null);
  if (!r.ok) return fail(res, r.code, r.reason);
  ok(res, r.order);
}));

// 批量审核:逐单复用单笔逻辑,允许部分成功;逐单校验数据范围(与单笔审核同规则)
async function batchReview(ids, reviewer, review) {
  const success = [];
  const failed = [];
  for (const id of ids) {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order || !(await inScope(order.userId, reviewer))) {
      failed.push({ id, reason: '无权限操作该报单(仅限自己与下线)' });
      continue;
    }
    const r = await review(order.id);
    if (r.ok) success.push(id);
    else failed.push({ id, reason: r.reason });
  }
  return { success, failed };
}

router.post('/batch-approve', h(async (req, res) => {
  if (!REVIEWERS.includes(req.user.role)) return fail(res, 403, '无权限执行审核');
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (!ids.length) return fail(res, 400, '请提供报单 ID 列表');
  ok(res, await batchReview(ids, req.user, (id) => doApprove(id, req.user, null)));
}));

router.post('/batch-reject', h(async (req, res) => {
  if (!REVIEWERS.includes(req.user.role)) return fail(res, 403, '无权限执行审核');
  const remark = req.body?.remark;
  if (!remark || !String(remark).trim()) return fail(res, 400, '请填写驳回原因');
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (!ids.length) return fail(res, 400, '请提供报单 ID 列表');
  ok(res, await batchReview(ids, req.user, (id) => doReject(id, req.user, String(remark).trim())));
}));

export default router;
