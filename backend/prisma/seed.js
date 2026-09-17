import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));

const DAY = 86400000;
const now = new Date();
const daysAgo = (n, hourJitter = true) => {
  const d = new Date(now.getTime() - n * DAY);
  if (hourJitter) d.setHours(Math.floor(Math.random() * 12) + 8, Math.floor(Math.random() * 60), 0, 0);
  return d;
};
const genNo = (prefix, i) => {
  const pad = (x) => String(x).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return `${prefix}${ts}${String(i).padStart(5, '0')}`;
};
const round2 = (n) => Math.round(n * 100) / 100;

// ===== 实名认证演示数据 =====
const PHOTO_DIR = process.env.PHOTO_DIR
  || (process.platform === 'win32' ? 'D:/baodan-data/uploads/idcards' : '/www/baodan-data/uploads/idcards');

// 生成一个 24 位 BMP 示例图(纯色带边框),仅作演示照片
function makeBmp(width, height, [r, g, b]) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelSize = rowSize * height;
  const fileSize = 54 + pixelSize;
  const buf = Buffer.alloc(fileSize);
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelSize, 34);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const border = x < 4 || y < 4 || x >= width - 4 || y >= height - 4;
      const i = 54 + y * rowSize + x * 3;
      buf[i] = border ? 40 : b;
      buf[i + 1] = border ? 40 : g;
      buf[i + 2] = border ? 40 : r;
    }
  }
  return buf;
}

// 生成校验位合法的 18 位身份证号(前 17 位给定)
function idCard(base17) {
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = '10X98765432';
  const sum = weights.reduce((acc, w, i) => acc + Number(base17[i]) * w, 0);
  return base17 + codes[sum % 11];
}

  // 严格 17 位数字前缀,避免校验位算出 undefined
  function base17Gen() {
    return '4101' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0') + String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  }
  function realnamePatch({ name, status, reason = null, reviewed = false, color = [70, 110, 220] }) {
    if (!existsSync(PHOTO_DIR)) mkdirSync(PHOTO_DIR, { recursive: true });
    const file = `seed-${name}-${crypto.randomUUID().slice(0, 8)}.bmp`;
    writeFileSync(join(PHOTO_DIR, file), makeBmp(240, 150, color));
    return {
      realName: name,
      idCardNo: idCard(base17Gen()),
      idCardPhoto: file,
      realnameStatus: status,
      realnameRejectReason: reason,
      realnameSubmittedAt: daysAgo(3),
      realnameReviewedBy: reviewed ? 1 : null,
      realnameReviewedAt: reviewed ? daysAgo(2) : null,
    };
  }

// 品类计价规则(v2.5 中介模式):代理收购价 = 上游报价 ×(1-下浮%) 或 上游报价 - 固定减额(元)
// 与路由同一数据源(Setting key=markdown_rules)
const MARKDOWN_RULES = {
  手机: { mode: 'percent', value: 2 },
  平板电脑: { mode: 'percent', value: 3 },
  智能穿戴: { mode: 'percent', value: 4 },
  笔记本电脑: { mode: 'percent', value: 3 },
  配件: { mode: 'percent', value: 5 },
  游戏设备: { mode: 'percent', value: 4 },
  摄影摄像: { mode: 'percent', value: 4 },
  外设: { mode: 'percent', value: 5 },
  酒水: { mode: 'percent', value: 3 },
  奶粉: { mode: 'percent', value: 3 },
  特殊配方奶粉: { mode: 'percent', value: 3 },
};

// 与 backend/src/util.js computeAgentPrice 同式(seed 不引 db,本地复刻)
const agentPriceOf = (upstream, rule) => {
  const value = Number(rule?.value) || 0;
  return round2(rule?.mode === 'fixed' ? upstream - value : upstream * (1 - value / 100));
};

async function main() {
  console.log('清理旧数据…');
  await prisma.transaction.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();

  console.log('写入品类计价规则设置…');
  await prisma.setting.create({
    data: { key: 'markdown_rules', value: JSON.stringify(MARKDOWN_RULES) },
  });

  console.log('创建账号…(v2.1 代理/会员余额从 0 开始;实名状态各不相同供演示)');
  const pwd = (p) => bcrypt.hashSync(p, 10);
  const admin = await prisma.user.create({
    data: { phone: '13800000001', name: '系统管理员', role: 'ADMIN', passwordHash: pwd('admin123'), balance: 0 },
  });
  const agent = await prisma.user.create({
    data: { phone: '13800000002', name: '张代理', role: 'AGENT', level: 1, passwordHash: pwd('agent123'), balance: 0 },
  });
  const members = [];
  const memberNames = ['李小明', '王芳', '陈强', '赵丽', '刘洋'];
  for (let i = 0; i < memberNames.length; i++) {
    const m = await prisma.user.create({
      data: {
        phone: `1380000000${3 + i}`,
        name: memberNames[i],
        role: 'MEMBER',
        // 层级只有总部/代理两级:报单员直接归属总部(管理员)
        parentId: admin.id,
        passwordHash: pwd('member123'),
        balance: 0,
      },
    });
    members.push(m);
  }

  // 实名演示:代理+会员同一性质,均需实名;状态覆盖 通过/待审/驳回/未提交
  await prisma.user.update({ where: { id: agent.id }, data: realnamePatch({ name: '张建军', status: 'APPROVED', reviewed: true }) });
  await prisma.user.update({ where: { id: admin.id }, data: realnamePatch({ name: '管理员', status: 'APPROVED', reviewed: true }) });
  const realnamePlan = [
    ['李小明', 'APPROVED', null, true],
    ['王芳', 'PENDING', null, false],
    ['陈强', 'REJECTED', '照片模糊无法核对证件号,请重新拍摄上传', false],
    ['赵丽', 'APPROVED', null, true],
    ['刘洋', 'NONE', null, false],
  ];
  for (const [name, status, reason, reviewed] of realnamePlan) {
    const m = members.find((x) => x.name === name);
    if (status === 'NONE') continue;
    const patch = realnamePatch({ name, status, reason, reviewed });
    await prisma.user.update({ where: { id: m.id }, data: { ...patch, realnameReviewedBy: reviewed ? admin.id : null } });
  }

  console.log('导入产品…');
  const products = JSON.parse(readFileSync(join(__dirname, 'products.json'), 'utf-8'));
  // products.json 有少量 brand 为 null(如部分特殊配方奶粉),schema 中 brand 非空,归一化为空串
  // v2.4:原始 price 即上游报价;代理收购价按品类计价规则重算,上游价无效(≤0/空)保持下架
  const normalized = products.map((p) => {
    const upstream = typeof p.price === 'number' && p.price > 0 ? p.price : null;
    const agentPrice = upstream != null ? agentPriceOf(upstream, MARKDOWN_RULES[p.category ?? '']) : null;
    return {
      ...p,
      category: p.category ?? '',
      brand: p.brand ?? '',
      name: p.name ?? '',
      upstreamPrice: upstream,
      price: agentPrice != null && agentPrice > 0 ? agentPrice : null,
      status: agentPrice != null && agentPrice > 0 ? 'ACTIVE' : 'DISABLED',
    };
  });
  for (let i = 0; i < normalized.length; i += 300) {
    await prisma.product.createMany({ data: normalized.slice(i, i + 300) });
  }
  const productCount = await prisma.product.count();
  console.log(`产品导入完成:${productCount} 条`);

  console.log('生成报单与流水…(v2.4 中介模式:审核通过 = 按收购价打款,差价利润留存)');
  const allProducts = await prisma.product.findMany({
    where: { price: { not: null }, status: 'ACTIVE' },
    take: 800,
  });
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // 可用余额(内存模拟,结束时落库)
  const balances = new Map();
  for (const m of members) balances.set(m.id, 0);
  let txSeq = 1;
  let orderSeq = 1;

  // 生成 80 笔报单,时间散布在近 30 天;前 6 笔固定为今天 PENDING(保证看板有待审)
  const drafts = [];
  for (let i = 0; i < 80; i++) {
    const user = pick(members);
    const product = pick(allProducts);
    const quantity = Math.random() < 0.85 ? 1 : 2;
    const unitPrice = Math.max(1, Math.round(product.price * (0.98 + Math.random() * 0.04)));
    const totalAmount = round2(quantity * unitPrice);
    const upstreamPrice = product.upstreamPrice ?? null;
    const profit = upstreamPrice != null ? round2((upstreamPrice - unitPrice) * quantity) : 0;
    const forcedPending = i < 6;
    const dayOffset = forcedPending ? 0 : Math.floor(Math.random() * 30); // 0=今天 … 29
    const createdAt = daysAgo(dayOffset);
    const r = Math.random();
    drafts.push({
      user,
      product,
      quantity,
      unitPrice,
      totalAmount,
      upstreamPrice,
      profit,
      createdAt,
      logisticsNo: Math.random() < 1 / 3 ? `SF${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}` : null,
      wantStatus: forcedPending ? 'PENDING' : r < 0.62 ? 'APPROVED' : r < 0.87 ? 'PENDING' : 'REJECTED',
    });
  }
  // 按时间先后处理,保证余额演进正确
  drafts.sort((a, b) => a.createdAt - b.createdAt);
  for (const d of drafts) {
    const status = d.wantStatus;
    const spec = [d.product.memory, d.product.disk, d.product.screen, d.product.color].filter(Boolean).join(' / ') || null;
    const order = await prisma.order.create({
      data: {
        orderNo: genNo('BD', orderSeq++),
        userId: d.user.id,
        productId: d.product.id,
        productName: d.product.name,
        productType: d.product.category,
        spec,
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        totalAmount: d.totalAmount,
        upstreamPrice: d.upstreamPrice,
        profit: d.profit,
        commission: 0,
        logisticsNo: d.logisticsNo,
        status,
        remark: status === 'REJECTED' ? '信息填写有误,请核对后重新提交' : null,
        reviewedBy: status !== 'PENDING' ? admin.id : null,
        reviewedAt: status !== 'PENDING' ? new Date(d.createdAt.getTime() + 3600000) : null,
        createdAt: d.createdAt,
        updatedAt: d.createdAt,
      },
    });
    if (status === 'APPROVED') {
      // 中介模式打款:余额 += 货款(收购价),一笔 ORDER 流水,无佣金
      const bal = round2((balances.get(d.user.id) || 0) + d.totalAmount);
      balances.set(d.user.id, bal);
      await prisma.transaction.create({
        data: {
          txNo: genNo('TX', txSeq++), userId: d.user.id, type: 'ORDER',
          amount: d.totalAmount, balanceAfter: bal,
          orderId: order.id, remark: `报单打款 ${order.orderNo}`,
          createdAt: new Date(d.createdAt.getTime() + 3600000),
        },
      });
    }
  }

  // 部分提现流水(线下转账后管理员记账,含今天)
  let extraTx = 1;
  const withdrawPlan = [
    [0, members[2], 2000, '线下转账提现,工行尾号8899'],
    [2, members[0], 1500, '线下转账提现,建行尾号3310'],
    [5, members[1], 3000, '线下转账提现,招行尾号7742'],
  ];
  for (const [offset, user, amount, remark] of withdrawPlan) {
    const cur = balances.get(user.id) || 0;
    if (cur < amount) continue;
    balances.set(user.id, round2(cur - amount));
    await prisma.transaction.create({
      data: {
        txNo: genNo('TX', 70000 + extraTx++), userId: user.id, type: 'WITHDRAW',
        amount: -amount, balanceAfter: round2(cur - amount), remark, createdAt: daysAgo(offset),
      },
    });
  }

  // 余额落库(代理/会员)
  for (const m of members) {
    await prisma.user.update({ where: { id: m.id }, data: { balance: round2(balances.get(m.id) || 0) } });
  }

  const [u, o, t] = await Promise.all([
    prisma.user.count(), prisma.order.count(), prisma.transaction.count(),
  ]);
  const pendingToday = await prisma.order.count({ where: { status: 'PENDING', createdAt: { gte: daysAgo(0, false) } } });
  const withLogistics = await prisma.order.count({ where: { logisticsNo: { not: null } } });
  console.log(`完成:用户 ${u}(管理员 admin123 / 代理 agent123 / 会员 member123),报单 ${o}(今日待审 ${pendingToday},含快递单号 ${withLogistics}),流水 ${t}`);
  console.log(`管理员登录:13800000001 / admin123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
