import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../db.js';
import { ok, fail, h } from '../util.js';
import { authRequired, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

// 照片存储目录(数据目录,不经任何第三方;可用环境变量 PHOTO_DIR 覆盖)
const PHOTO_DIR = process.env.PHOTO_DIR
  || (process.platform === 'win32' ? 'D:/baodan-data/uploads/idcards' : '/www/baodan-data/uploads/idcards');
if (!existsSync(PHOTO_DIR)) mkdirSync(PHOTO_DIR, { recursive: true });

const PHOTO_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!PHOTO_MIME[file.mimetype]) return cb(new Error('照片仅支持 JPG/PNG/WEBP'));
    cb(null, true);
  },
});

// :userId 参数守卫
router.param('userId', (req, res, next) => {
  const n = Number(req.params.userId);
  if (Number.isInteger(n) && n > 0) {
    req.params.userId = n;
    return next();
  }
  return fail(res, 400, '非法的 ID');
});

// 身份证号校验:18 位 + GB11643 校验位
function validIdCard(no) {
  const s = String(no || '').toUpperCase();
  if (!/^\d{17}[\dX]$/.test(s)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = '10X98765432';
  const sum = weights.reduce((acc, w, i) => acc + Number(s[i]) * w, 0);
  return codes[sum % 11] === s[17];
}

// 对本人展示时证件号脱敏;管理员审核走 /:userId 拿全号
function publicInfo(u) {
  if (!u || u.realnameStatus === 'NONE') {
    return { realnameStatus: 'NONE', realName: null, idCardNo: null, realnameRejectReason: null, realnameSubmittedAt: null, realnameReviewedAt: null };
  }
  return {
    realnameStatus: u.realnameStatus,
    realName: u.realName,
    idCardNo: u.idCardNo ? String(u.idCardNo).replace(/^(.{6}).+(.{4})$/, '$1********$2') : null,
    realnameRejectReason: u.realnameStatus === 'REJECTED' ? u.realnameRejectReason : null,
    realnameSubmittedAt: u.realnameSubmittedAt,
    realnameReviewedAt: u.realnameReviewedAt,
  };
}

// 自己的实名信息
router.get('/me', h(async (req, res) => {
  ok(res, publicInfo(req.user));
}));

// 提交实名:APPROVED 锁定不可改;PENDING 不可重复;NONE/REJECTED 可提交
router.post('/submit', (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? '照片不能超过 5MB' : err.message || '上传失败';
      return fail(res, 400, msg);
    }
    next();
  });
}, h(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return fail(res, 401, '账号不存在');
  if (user.realnameStatus === 'APPROVED') return fail(res, 400, '实名已通过并锁定,不可修改');
  if (user.realnameStatus === 'PENDING') return fail(res, 400, '实名资料审核中,请等待管理员审核');

  const { realName, idCardNo } = req.body || {};
  if (!realName || !String(realName).trim()) return fail(res, 400, '请填写真实姓名');
  if (!validIdCard(idCardNo)) return fail(res, 400, '身份证号格式不正确');
  if (!req.file) return fail(res, 400, '请上传身份证人像面照片');

  // 落盘到 D 盘数据目录;驳回重传时覆盖删除旧照片
  const filename = `${crypto.randomUUID()}${PHOTO_MIME[req.file.mimetype]}`;
  await writeFile(path.join(PHOTO_DIR, filename), req.file.buffer);
  if (user.idCardPhoto) {
    unlink(path.join(PHOTO_DIR, user.idCardPhoto)).catch(() => {});
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      realName: String(realName).trim(),
      idCardNo: String(idCardNo).toUpperCase(),
      idCardPhoto: filename,
      realnameStatus: 'PENDING',
      realnameRejectReason: null,
      realnameSubmittedAt: new Date(),
      realnameReviewedBy: null,
      realnameReviewedAt: null,
    },
  });
  ok(res, publicInfo(updated));
}));

// 照片查看:仅本人或 ADMIN(前端以 blob 方式加载,照片 URL 不对外暴露)
router.get('/:userId/photo', h(async (req, res) => {
  const targetId = req.params.userId;
  if (req.user.role !== 'ADMIN' && req.user.id !== targetId) {
    return fail(res, 403, '无权限查看他人实名照片');
  }
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target?.idCardPhoto) return fail(res, 404, '照片不存在');
  const abs = path.resolve(PHOTO_DIR, target.idCardPhoto);
  const base = path.resolve(PHOTO_DIR);
  if (!abs.toLowerCase().startsWith(base.toLowerCase())) return fail(res, 404, '照片不存在');
  if (!existsSync(abs)) return fail(res, 404, '照片不存在');
  res.sendFile(abs);
}));

// 管理端:查看某用户实名信息(含完整证件号供核对;照片另走鉴权接口)
router.get('/:userId', requireRole('ADMIN'), h(async (req, res) => {
  const target = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: {
      id: true, name: true, phone: true, role: true,
      realName: true, idCardNo: true, idCardPhoto: true,
      realnameStatus: true, realnameRejectReason: true,
      realnameSubmittedAt: true, realnameReviewedAt: true,
    },
  });
  if (!target) return fail(res, 404, '用户不存在');
  ok(res, { ...target, hasPhoto: !!target.idCardPhoto, idCardPhoto: undefined });
}));

// 审核通过 → 锁定,用户不可再改
router.post('/:userId/approve', requireRole('ADMIN'), h(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!target) return fail(res, 404, '用户不存在');
  if (target.realnameStatus !== 'PENDING') return fail(res, 400, '该用户没有待审核的实名资料');
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { realnameStatus: 'APPROVED', realnameRejectReason: null, realnameReviewedBy: req.user.id, realnameReviewedAt: new Date() },
  });
  ok(res, publicInfo(updated));
}));

// 审核驳回(必填原因)→ 用户可重新上传
router.post('/:userId/reject', requireRole('ADMIN'), h(async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return fail(res, 400, '请填写驳回原因');
  const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!target) return fail(res, 404, '用户不存在');
  if (target.realnameStatus !== 'PENDING') return fail(res, 400, '该用户没有待审核的实名资料');
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { realnameStatus: 'REJECTED', realnameRejectReason: reason, realnameReviewedBy: req.user.id, realnameReviewedAt: new Date() },
  });
  ok(res, publicInfo(updated));
}));

// 管理员重置实名(纠错:清空回未实名,照片文件一并删除)
router.post('/:userId/reset', requireRole('ADMIN'), h(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!target) return fail(res, 404, '用户不存在');
  if (target.realnameStatus === 'NONE') return fail(res, 400, '该用户尚未提交实名');
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      realName: null, idCardNo: null, idCardPhoto: null,
      realnameStatus: 'NONE', realnameRejectReason: null,
      realnameReviewedBy: null, realnameReviewedAt: null, realnameSubmittedAt: null,
    },
  });
  if (target.idCardPhoto) unlink(path.join(PHOTO_DIR, target.idCardPhoto)).catch(() => {});
  ok(res, publicInfo(updated));
}));

export default router;
