// 第二轮补拍:看板 / 修正后报单页 / 向导第二步 / 会员视角 / 移动端
const { chromium } = require('playwright-core');
const BASE = 'http://localhost:3001';
const OUT = __dirname;
const results = [];
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` }).then(() => results.push(n));

async function login(page, phone, pwd) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('手机号').fill(phone);
  await page.getByPlaceholder('密码').fill(pwd);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForTimeout(2500);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 150)));

  // 1. admin 登录 → 看板(等数据出现)
  await login(page, '13800000001', 'admin123');
  await page.getByText('今日报单数').first().waitFor({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, '16-dashboard-retry');
  console.log('after admin login url:', page.url());

  // 2. 报单页(验证列宽修复)
  await page.goto(BASE + '/orders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '17-orders-fixed');

  // 3. 向导:打开 → 等行出现 → 点第一行 → 验证选中 → 下一步
  await page.getByRole('button', { name: /新建报单/ }).first().click();
  await page.locator('.el-dialog .el-table__row').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  await shot(page, '18-wizard-step1');
  await page.locator('.el-dialog .el-table__row').first().click();
  await page.locator('.el-dialog .picker-row--selected').first().waitFor({ timeout: 5000 }).catch(() => {});
  const nextBtn = page.getByRole('button', { name: /下一步/ });
  if (await nextBtn.count()) await nextBtn.first().click();
  await page.waitForTimeout(900);
  await shot(page, '19-wizard-step2');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // 4. 会员登录(退出 admin:清 localStorage 最稳)
  await page.evaluate(() => localStorage.removeItem('bd_token'));
  await login(page, '13800000003', 'member123');
  await page.waitForTimeout(1500);
  console.log('after member login url:', page.url());
  await shot(page, '20-member-view');
  // 会员的报单页
  await page.goto(BASE + '/orders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '21-member-orders');
  await ctx.close();

  // 5. 移动端
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  await login(mp, '13800000001', 'admin123');
  await mp.waitForTimeout(1500);
  await shot(mp, '22-mobile-dashboard');
  // 汉堡按钮开抽屉(顶栏左侧第一个按钮)
  await mp.locator('header button, .topbar button, .navbar button').first().click().catch(() => {});
  await mp.waitForTimeout(900);
  await shot(mp, '23-mobile-drawer');
  await mctx.close();

  await browser.close();
  console.log('SHOTS:', results.join(', '));
  console.log('JS_ERRORS:', errors.length ? errors.join(' | ') : 'none');
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
