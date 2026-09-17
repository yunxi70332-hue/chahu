// 实名认证页自测(阶段 2 Agent-R):四种状态 UI + 菜单/提醒引导 + 提交流程
// 用法:
//   TEST_MODE=mock node realname-test.js   → 前置:node mock-realname-api.mjs(4190)+ vite preview(4189,代理 /api → 4190)
//   TEST_MODE=real node realname-test.js   → 前置:后端运行于 3001 + vite preview(4189,代理 /api → 3001)
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const MODE = process.env.TEST_MODE || 'mock';
const BASE = 'http://localhost:4189';
const API = MODE === 'real' ? 'http://localhost:3001/api' : 'http://localhost:4189/api';
const OUT = __dirname;
const results = [];
const problems = [];

function ok(name, cond, extra = '') {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' | ' + extra : ''}`);
  if (!cond) problems.push(name);
}

function makeIdCard(base17) {
  const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = '10X98765432';
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(base17[i]) * w[i];
  return base17 + codes[sum % 11];
}

async function apiLogin(phone, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  const json = await res.json();
  if (!json.data) throw new Error(`login failed: ${json.message}`);
  return json.data; // { token, user }
}

async function apiMe(token) {
  const res = await fetch(`${API}/realname/me`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  return json.data;
}

function shot(page, name) {
  return page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

async function loginUI(page, phone, password) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  // 若上一账号未退出成功(仍被守卫重定向),先补一次退出
  if (!page.url().includes('/login')) {
    await logout(page);
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  }
  await page.getByPlaceholder('手机号').fill(phone);
  await page.getByPlaceholder('密码').fill(password);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForTimeout(1800);
  console.log(`[loginUI] ${phone} → ${page.url()}`);
}

async function menuClick(page, title) {
  await page.locator('.side-menu-nav .el-menu-item', { hasText: title }).first().click();
  await page.waitForTimeout(900);
}

async function logout(page) {
  // 等「登录成功」等 toast 消失;实名提醒(duration:0)常驻右上,先关闭避免遮挡
  await page.locator('.el-message').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await page.locator('.el-notification__closeBtn').first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.locator('.user-chip').click();
  const item = page.locator('.el-dropdown-menu__item', { hasText: '退出登录' });
  await item.waitFor({ timeout: 5000 });
  await item.click();
  await page.locator('.el-message-box').waitFor({ timeout: 5000 });
  await page.locator('.el-message-box__btns button', { hasText: '退出' }).click();
  await page.waitForURL('**/login', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(600);
}

async function hasMenu(page, title) {
  const count = await page.locator('.side-menu-nav .el-menu-item', { hasText: title }).count();
  return count > 0;
}

(async () => {
  // ---------- A. API 层:四种状态 ----------
  const members = [
    { phone: '13800000003', name: '李小明', status: 'APPROVED' },
    { phone: '13800000004', name: '王芳', status: 'PENDING' },
    { phone: '13800000005', name: '陈强', status: 'REJECTED' },
    { phone: '13800000007', name: '刘洋', status: 'NONE' },
  ];
  const passwords = MODE === 'real' ? { '13800000001': 'admin123' } : { '13800000001': 'admin123' };
  const pw = (phone) => passwords[phone] || 'member123';
  const tokens = {};
  for (const m of members) {
    const login = await apiLogin(m.phone, pw(m.phone));
    tokens[m.phone] = login.token;
    const me = await apiMe(login.token);
    ok(`API ${m.name} realnameStatus=${m.status}`, me.realnameStatus === m.status, `got=${me.realnameStatus}`);
    if (m.status === 'REJECTED') {
      ok('API 陈强 驳回原因存在', !!me.realnameRejectReason, String(me.realnameRejectReason || '').slice(0, 30));
      ok('API 陈强 证件号脱敏', (me.idCardNo || '').includes('*'), me.idCardNo || 'null');
    }
    if (m.phone === '13800000007') globalThis.liuyangId = login.user.id;
  }

  // ---------- B. UI ----------
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const notifSel = '.el-notification';

  // B1. ADMIN:菜单无「实名认证」、无提醒、访问 /realname 被角色守卫弹回
  await loginUI(page, '13800000001', pw('13800000001'));
  ok('ADMIN 侧栏无「实名认证」', !(await hasMenu(page, '实名认证')));
  ok('ADMIN 无实名提醒弹窗', (await page.locator(notifSel, { hasText: '实名认证提醒' }).count()) === 0);
  await page.goto(BASE + '/realname', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok('ADMIN 访问 /realname 被重定向', !page.url().includes('/realname'), page.url());
  await shot(page, '40-admin-no-realname-menu');

  // B2. 王芳(PENDING):提醒弹一次 + 菜单入口 + 点提醒跳转 + 橙色审核中卡
  await logout(page);
  await loginUI(page, '13800000004', pw('13800000004'));
  const notif = page.locator(notifSel, { hasText: '实名认证提醒' });
  await notif.waitFor({ timeout: 6000 }).catch(() => {});
  ok('待审核登录后弹实名提醒', (await notif.count()) === 1, `count=${await notif.count()}`);
  ok('MEMBER 侧栏有「实名认证」', await hasMenu(page, '实名认证'));
  // SPA 内导航(不整页刷新),确认会话内不重复弹
  await menuClick(page, '资金流水');
  ok('SPA 内导航不重复弹提醒', (await page.locator(notifSel).count()) === 1);
  // 点击提醒 → 跳转 /realname
  await notif.click();
  await page.waitForTimeout(1000);
  ok('点击提醒跳转 /realname', page.url().includes('/realname'), page.url());
  ok('PENDING 页面显示审核中卡', (await page.getByText('实名资料审核中,请耐心等待').count()) > 0);
  ok('PENDING 显示提交时间', (await page.locator('.state-meta', { hasText: '提交时间' }).count()) > 0);
  ok('PENDING 不显示表单', (await page.locator('.realname-form').count()) === 0);
  await shot(page, '41-realname-pending');

  // B3. 李小明(APPROVED):绿卡 + 锁定提示 + 无表单,登录不弹提醒
  await logout(page);
  await loginUI(page, '13800000003', pw('13800000003'));
  ok('已实名(APPROVED)登录不弹提醒', (await page.locator(notifSel, { hasText: '实名认证提醒' }).count()) === 0);
  await menuClick(page, '实名认证');
  ok('APPROVED 显示已完成卡', (await page.getByText('已完成实名认证').count()) > 0);
  ok('APPROVED 显示姓名', (await page.locator('.detail-row', { hasText: '李小明' }).count()) > 0);
  ok('APPROVED 有锁定提示', (await page.getByText('实名信息已锁定,如需变更请联系管理员').count()) > 0);
  ok('APPROVED 无提交按钮(无修改入口)', (await page.getByRole('button', { name: /提交实名认证/ }).count()) === 0);
  await shot(page, '42-realname-approved');

  // B4. 陈强(REJECTED):红卡 + 驳回原因 + 表单回填姓名
  await logout(page);
  await loginUI(page, '13800000005', pw('13800000005'));
  await menuClick(page, '实名认证');
  await page.waitForTimeout(600);
  const chenMe = await apiMe(tokens['13800000005']);
  ok('REJECTED 显示驳回原因', (await page.locator('.reject-reason', { hasText: chenMe.realnameRejectReason }).count()) > 0, chenMe.realnameRejectReason);
  ok('REJECTED 提示可重新提交', (await page.getByText(/重新提交/).count()) > 0);
  const nameVal = await page.getByPlaceholder('请输入身份证上的真实姓名').inputValue().catch(() => '');
  ok('REJECTED 表单回填姓名=陈强', nameVal === '陈强', `got=${nameVal}`);
  const maskedTip = await page.locator('.form-tip', { hasText: '上次提交的证件号' }).count();
  ok('REJECTED 展示上次证件号(脱敏)', maskedTip > 0);
  await shot(page, '43-realname-rejected');

  // B5. 刘洋(NONE):前端校验 + 提交流程(完成后管理员 reset 恢复 seed)
  await logout(page);
  await loginUI(page, '13800000007', pw('13800000007'));
  await menuClick(page, '实名认证');
  ok('NONE 显示未实名横幅', (await page.getByText('您还未完成实名认证').count()) > 0);
  // 非法身份证 → 前端就地 warning,不发请求
  await page.getByPlaceholder('请输入身份证上的真实姓名').fill('测试员');
  await page.getByPlaceholder('请输入 18 位身份证号').fill('123');
  await page.getByRole('button', { name: /提交实名认证/ }).click();
  await page.waitForTimeout(600);
  ok('非法证件号就地 warning', (await page.locator('.el-message--warning').count()) > 0);
  await shot(page, '44-realname-none-invalid-id');
  // 合法数据 + 照片 → 提交成功 → PENDING
  const validId = makeIdCard('41010219900101123');
  const png = path.join(OUT, '_tmp_idcard.png');
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  await page.getByPlaceholder('请输入身份证上的真实姓名').fill('刘洋');
  await page.getByPlaceholder('请输入 18 位身份证号').fill(validId);
  await page.setInputFiles('.photo-upload input[type=file]', png);
  await page.waitForTimeout(800);
  ok('照片本地预览出现', (await page.locator('.photo-preview').count()) > 0);
  await page.getByRole('button', { name: /提交实名认证/ }).click();
  await page.waitForTimeout(1500);
  ok('提交成功提示', (await page.locator('.el-message--success', { hasText: '已提交' }).count()) > 0);
  ok('提交后转 PENDING 卡', (await page.getByText('实名资料审核中,请耐心等待').count()) > 0);
  ok('提交后表单隐藏', (await page.locator('.realname-form').count()) === 0);
  const liuyangMe = await apiMe(tokens['13800000007']);
  ok('API 刘洋 已变 PENDING', liuyangMe.realnameStatus === 'PENDING', `got=${liuyangMe.realnameStatus}`);
  await shot(page, '45-realname-submitted');

  // ---------- C. 恢复 seed:管理员 reset 刘洋 → NONE ----------
  const admin = await apiLogin('13800000001', pw('13800000001'));
  const res = await fetch(`${API}/realname/${globalThis.liuyangId}/reset`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  ok('管理员 reset 刘洋(恢复 seed)', res.ok, `HTTP=${res.status}`);
  const restored = await apiMe(tokens['13800000007']);
  ok('刘洋已恢复 NONE', restored.realnameStatus === 'NONE', `got=${restored.realnameStatus}`);

  await browser.close();
  fs.rmSync(png, { force: true });
  console.log('==== RESULTS ====');
  console.log(results.join('\n'));
  console.log('JS_ERRORS:', errors.length ? errors.join(' | ') : 'none');
  console.log(problems.length ? `FAILED: ${problems.length} → ${problems.join(', ')}` : 'ALL PASS');
  process.exit(problems.length ? 1 : 0);
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
