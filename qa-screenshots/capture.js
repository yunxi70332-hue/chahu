// 数码报单系统 QA 截图:登录 + 六页面(桌面/移动)+ 关键流程
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:3001';
const OUT = __dirname;
const results = [];

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  results.push(name);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });

  // ---------- 桌面端 ----------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });

  // 1. 登录页
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '01-login');

  // 2. 登录(admin)
  await page.getByPlaceholder('手机号').fill('13800000001');
  await page.getByPlaceholder('密码').fill('admin123');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**/dashboard', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, '02-dashboard');

  // 3. 报单管理
  await page.goto(BASE + '/orders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, '03-orders');

  // 4. 新建报单向导(打开到选品步)
  await page.getByRole('button', { name: /新建报单/ }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, '04-order-wizard-step1');
  // 选品:点第一行"选择"或行,进入确认信息步
  const pickRow = page.locator('.el-dialog table .el-table__body-wrapper tbody tr').first();
  await pickRow.click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /下一步/ }).click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, '05-order-wizard-step2');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 5. 产品管理
  await page.goto(BASE + '/products', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '06-products');
  // 佣金比例设置弹窗
  await page.getByRole('button', { name: /佣金比例设置/ }).click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, '07-commission-dialog');
  await page.keyboard.press('Escape');
  // 导入弹窗
  await page.getByRole('button', { name: /导入报价表/ }).click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, '08-import-dialog');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 6. 用户管理
  await page.goto(BASE + '/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, '09-users');
  // 余额调整弹窗
  const balBtn = page.getByRole('button', { name: /余额调整/ }).first();
  await balBtn.click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, '10-balance-dialog');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 7. 资金流水
  await page.goto(BASE + '/transactions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, '11-transactions');

  // 8. 退出登录 → 会员登录验证角色菜单
  await page.getByText('系统管理员').first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.getByText('退出登录').click().catch(() => {});
  await page.waitForTimeout(1000);
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('手机号').fill('13800000003');
  await page.getByPlaceholder('密码').fill('member123');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**/dashboard', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, '12-member-view');
  await ctx.close();

  // ---------- 移动端 ----------
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true });
  const mpage = await mctx.newPage();
  await mpage.goto(BASE, { waitUntil: 'networkidle' });
  await mpage.waitForTimeout(800);
  await shot(mpage, '13-mobile-login');
  await mpage.getByPlaceholder('手机号').fill('13800000001');
  await mpage.getByPlaceholder('密码').fill('admin123');
  await mpage.getByRole('button', { name: /登\s*录/ }).click();
  await mpage.waitForURL('**/dashboard', { timeout: 8000 }).catch(() => {});
  await mpage.waitForTimeout(1500);
  await shot(mpage, '14-mobile-dashboard');
  // 抽屉菜单
  const burger = mpage.locator('.el-icon').filter({ hasText: '' }).first();
  await mpage.getByRole('button').first().click().catch(() => {});
  await mpage.waitForTimeout(800);
  await shot(mpage, '15-mobile-drawer');
  await mctx.close();

  await browser.close();
  console.log('SHOTS:', results.join(', '));
  console.log('JS_ERRORS:', errors.length ? errors.slice(0, 10).join(' | ') : 'none');
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
