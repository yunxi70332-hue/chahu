import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { ok, fail, h, parsePage, getMarkdownRules, computeAgentPrice, rulesToRates } from '../util.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = Router();

// 脚本导入通道:X-Import-Key 等价总部身份,仅放行 POST /import(时序安全比较)
function importKeyValid(req) {
  const expected = process.env.IMPORT_KEY;
  const got = req.get('X-Import-Key');
  if (!expected || !got) return false;
  const a = Buffer.from(String(got));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.use((req, res, next) => {
  if (importKeyValid(req)) {
    if (req.path === '/import' && req.method === 'POST') {
      req.user = { id: 0, role: 'ADMIN', name: '报价管道' };
      return next();
    }
    return fail(res, 401, '导入密钥仅可用于 POST /api/products/import');
  }
  return authRequired(req, res, next);
});

// :id 参数合法性守卫
router.param('id', (req, res, next) => {
  const n = Number(req.params.id);
  if (Number.isInteger(n) && n > 0) {
    req.params.id = n;
    return next();
  }
  return fail(res, 400, '非法的 ID');
});

function buildWhere(query) {
  const where = {};
  if (query.category) where.category = query.category;
  if (query.brand) where.brand = query.brand;
  if (query.status) where.status = query.status;
  // 建单选品:仅上架且价格有效
  if (query.available === '1') {
    where.status = 'ACTIVE';
    where.price = { gt: 0 };
  }
  if (query.keyword) {
    const kw = String(query.keyword).trim();
    where.OR = [
      { name: { contains: kw } },
      { brand: { contains: kw } },
      { model: { contains: kw } },
    ];
  }
  return where;
}

// 产品列表;上游价是商业机密,仅总部可见
router.get('/', h(async (req, res) => {
  const where = buildWhere(req.query);
  const { skip, take, page, pageSize } = parsePage(req.query);
  const isAdmin = req.user.role === 'ADMIN';
  const [total, list] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, orderBy: { id: 'asc' }, skip, take }),
  ]);
  ok(res, {
    total,
    page,
    pageSize,
    list: isAdmin ? list : list.map(({ upstreamPrice, ...rest }) => rest),
  });
}));

// 筛选项:大类 + 品牌
router.get('/meta', h(async (req, res) => {
  const [categories, brands] = await Promise.all([
    prisma.product.groupBy({ by: ['category'] }),
    prisma.product.groupBy({ by: ['brand'] }),
  ]);
  ok(res, {
    categories: categories.map((c) => c.category).sort(),
    brands: brands.map((b) => b.brand).sort(),
  });
}));

// 新建产品(总部手工;upstreamPrice 选填,填了即可参与下浮重算)
router.post('/', requireRole('ADMIN'), h(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.category || !b.brand) return fail(res, 400, '产品名称/大类/品牌必填');
  let price = null;
  if (!(b.price === '' || b.price == null)) {
    price = Number(b.price);
    if (!Number.isFinite(price)) return fail(res, 400, '价格必须是数字');
  }
  let upstreamPrice = null;
  if (!(b.upstreamPrice === '' || b.upstreamPrice == null)) {
    upstreamPrice = Number(b.upstreamPrice);
    if (!Number.isFinite(upstreamPrice)) return fail(res, 400, '上游价必须是数字');
  }
  const product = await prisma.product.create({
    data: {
      category: b.category,
      brand: b.brand,
      name: b.name,
      model: b.model || null,
      memory: b.memory || null,
      disk: b.disk || null,
      screen: b.screen || null,
      color: b.color || null,
      condition: b.condition || null,
      price,
      upstreamPrice,
      quoteDate: b.quoteDate || null,
    },
  });
  ok(res, product);
}));

// 编辑产品
router.put('/:id', requireRole('ADMIN'), h(async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!product) return fail(res, 404, '产品不存在');
  const b = req.body || {};
  let price = product.price;
  if (b.price !== undefined && !(b.price === '' || b.price == null)) {
    price = Number(b.price);
    if (!Number.isFinite(price)) return fail(res, 400, '价格必须是数字');
  } else if (b.price === '' || b.price === null) {
    price = null;
  }
  let upstreamPrice = product.upstreamPrice;
  if (b.upstreamPrice !== undefined) {
    if (b.upstreamPrice === '' || b.upstreamPrice == null) upstreamPrice = null;
    else {
      upstreamPrice = Number(b.upstreamPrice);
      if (!Number.isFinite(upstreamPrice)) return fail(res, 400, '上游价必须是数字');
    }
  }
  const updated = await prisma.product.update({
    where: { id: product.id },
    data: {
      category: b.category ?? product.category,
      brand: b.brand ?? product.brand,
      name: b.name ?? product.name,
      model: b.model ?? product.model,
      memory: b.memory ?? product.memory,
      disk: b.disk ?? product.disk,
      screen: b.screen ?? product.screen,
      color: b.color ?? product.color,
      condition: b.condition ?? product.condition,
      price,
      upstreamPrice,
      quoteDate: b.quoteDate ?? product.quoteDate,
    },
  });
  ok(res, updated);
}));

// 上/下架
router.post('/:id/status', requireRole('ADMIN'), h(async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!product) return fail(res, 404, '产品不存在');
  const status = req.body?.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE';
  const updated = await prisma.product.update({ where: { id: product.id }, data: { status } });
  ok(res, updated);
}));

// 删除产品
router.delete('/:id', requireRole('ADMIN'), h(async (req, res) => {
  const id = parseInt(req.params.id);
  const used = await prisma.order.count({ where: { productId: id } });
  if (used > 0) return fail(res, 400, '该产品已被报单引用,请下架而非删除');
  await prisma.product.delete({ where: { id } });
  ok(res, true);
}));

// ===== Excel 批量导入(整批替换产品库) =====
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/\.xlsx$/i.test(file.originalname)) return cb(new Error('仅支持 .xlsx 文件'));
    cb(null, true);
  },
});

// 表头 → 字段(兼容 / 与 · 两种分隔)
const HEADER_MAP = [
  [['产品大类'], 'category'],
  [['品牌'], 'brand'],
  [['产品名称'], 'name'],
  [['型号/子规格', '型号·子规格', '型号'], 'model'],
  [['内存'], 'memory'],
  [['硬盘'], 'disk'],
  [['屏幕/尺寸', '屏幕·尺寸', '屏幕'], 'screen'],
  [['颜色'], 'color'],
  [['成色/备注', '成色·备注', '成色'], 'condition'],
  [['参考回收价'], 'price'],
  [['报价日期'], 'quoteDate'],
];

function cellValue(cell) {
  const v = cell?.value;
  if (v == null) return { text: '', date: null };
  if (v instanceof Date) return { text: '', date: v };
  if (typeof v === 'object') {
    if (v.result instanceof Date) return { text: '', date: v.result };
    if (Array.isArray(v.richText)) return { text: v.richText.map((t) => t.text).join(''), date: null };
    if (v.text != null) return { text: String(v.text), date: null };
    if (v.result != null) return { text: String(v.result), date: null };
    return { text: String(v), date: null };
  }
  return { text: String(v), date: null };
}

function fmtDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

router.post('/import', requireRole('ADMIN'), (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? '文件大小不能超过 10MB' : err.message || '文件上传失败';
      return fail(res, 400, msg);
    }
    next();
  });
}, h(async (req, res) => {
  if (!req.file) return fail(res, 400, '请上传 .xlsx 文件');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(req.file.buffer);
  const ws = wb.worksheets[0];
  if (!ws) return fail(res, 400, '文件中没有工作表');

  // 解析表头
  const colMap = {};
  ws.getRow(1).eachCell((cell, colNumber) => {
    const text = cellValue(cell).text.replace(/\s+/g, '');
    if (!text) return;
    for (const [names, field] of HEADER_MAP) {
      if (names.includes(text)) {
        if (!colMap[field]) colMap[field] = colNumber;
        break;
      }
    }
  });
  if (!colMap.category || !colMap.brand || !colMap.name) {
    return fail(res, 400, '表头缺少必需列(产品大类/品牌/产品名称)');
  }

  const todayStr = fmtDate(new Date());
  const get = (row, field) => (colMap[field] ? cellValue(row.getCell(colMap[field])).text.trim() : '');

  // 品类计价规则:代理收购价 = 上游报价 ×(1-下浮%) 或 上游报价 - 固定减额
  const rules = await getMarkdownRules();

  const rows = [];
  let disabled = 0;
  let fileQuoteDate = '';
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const category = get(row, 'category');
    const brand = get(row, 'brand');
    const name = get(row, 'name');
    if (!category && !brand && !name) return; // 空行跳过

    // 报价日期:单元格可能为日期类型
    let quoteDate = '';
    if (colMap.quoteDate) {
      const cv = cellValue(row.getCell(colMap.quoteDate));
      quoteDate = cv.date ? fmtDate(cv.date) : cv.text.trim();
      if (quoteDate && !fileQuoteDate) fileQuoteDate = quoteDate;
    }
    if (!quoteDate) quoteDate = fileQuoteDate || todayStr;

    // 上游价(参考回收价)无效(非数字/≤0/空)→ DISABLED,原始价格文本保留进成色备注便于人工核对
    const priceRaw = get(row, 'price');
    const upstream = priceRaw === '' ? NaN : Number(priceRaw);
    const validUpstream = Number.isFinite(upstream) && upstream > 0;
    const agentPrice = validUpstream ? computeAgentPrice(upstream, rules[category]) : null;
    // 计价后 ≤0(规则配错等)同样下架,避免出现免费/负价收购
    const validPrice = validUpstream && agentPrice > 0;
    if (!validPrice) disabled += 1;
    const conditionRaw = get(row, 'condition');
    const condition =
      !validUpstream && priceRaw !== ''
        ? [conditionRaw, `原始报价:${priceRaw}`].filter(Boolean).join(' | ')
        : conditionRaw || null;

    rows.push({
      // 必填字段兜底空串(真实报价表存在品牌为空的行,如特殊配方奶粉);名称缺失用型号兜底
      category: category || '',
      brand: brand || '',
      name: name || get(row, 'model') || '未命名产品',
      model: get(row, 'model') || null,
      memory: get(row, 'memory') || null,
      disk: get(row, 'disk') || null,
      screen: get(row, 'screen') || null,
      color: get(row, 'color') || null,
      condition,
      upstreamPrice: validUpstream ? upstream : null,
      price: validPrice ? agentPrice : null,
      quoteDate,
      status: validPrice ? 'ACTIVE' : 'DISABLED',
    });
  });
  if (!rows.length) return fail(res, 400, '文件中没有可导入的数据行');

  // 事务内整批替换;历史报单 productId 由 onDelete: SetNull 自动置空
  const imported = await prisma.$transaction(async (tx) => {
    await tx.product.deleteMany();
    let count = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const r = await tx.product.createMany({ data: rows.slice(i, i + 200) });
      count += r.count;
    }
    return count;
  });

  ok(res, {
    imported,
    disabled,
    quoteDate: fileQuoteDate || todayStr,
    markdownRules: rules,
    markdownRates: rulesToRates(rules),
  });
}));

// 按当前计价规则重算全部在售代理价(改完计价设置后一键执行)
router.post('/recalc', requireRole('ADMIN'), h(async (_req, res) => {
  const rules = await getMarkdownRules();
  const products = await prisma.product.findMany({
    where: { upstreamPrice: { not: null } },
    select: { id: true, upstreamPrice: true, category: true, status: true },
  });
  let updated = 0;
  let disabled = 0;
  for (const p of products) {
    const price = computeAgentPrice(p.upstreamPrice, rules[p.category]);
    // 计价后 ≤0(规则配错等)不落库负价,置空并下架(与导入口径一致)
    const invalid = price === null || price <= 0;
    const data = { price: invalid ? null : price };
    // 重算不会把手工下架的产品重新上架,只拦截计价后异常的价格
    if (invalid) {
      data.status = 'DISABLED';
      disabled += 1;
    }
    await prisma.product.update({ where: { id: p.id }, data });
    updated += 1;
  }
  ok(res, { updated, disabled, markdownRules: rules, markdownRates: rulesToRates(rules) });
}));

export default router;
