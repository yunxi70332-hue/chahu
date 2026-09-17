// v2.4 中介模式视觉验证:四个视角截图
// A 管理员-产品页双价列 / B 管理员-向导无佣金字段 / C 管理员-订单差价列+看板利润卡 / D 会员-订单无差价列
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:3001';
const OUT = __dirname;

async function login(page, phone, password, land) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('bd_token'));
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('手机号').fill(phone);
  await page.getByPlaceholder('密码').fill(password);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**' + land, { timeout: 8000 });
  await page.waitForTimeout(800);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  // A. 管理员-产品页:上游报价 + 代理收购价 双列
  await login(page, '13800000001', 'admin123', '/dashboard');
  await page.goto(BASE + '/products');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/50-admin-products-dual-price.png` });

  // B. 管理员-新建报单向导 step2:无佣金字段
  await page.goto(BASE + '/orders');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /新建报单/ }).click();
  await page.waitForTimeout(1000);
  await page.locator('.el-dialog .el-table__row').first().click();
  await page.getByRole('button', { name: /下一步/ }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/51-admin-wizard-no-commission.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // C1. 管理员-订单列表:差价列(含已通过单)
  await page.screenshot({ path: `${OUT}/52-admin-orders-profit.png` });

  // C2. 管理员-看板:今日差价利润卡
  await page.goto(BASE + '/dashboard');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/53-admin-dashboard-profit.png` });

  // D. 会员-订单列表:无差价列
  await login(page, '13800000003', 'member123', '/orders');
  await page.goto(BASE + '/orders');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/54-member-orders-no-profit.png` });

  console.log(JSON.stringify({ errors }, null, 2));
  await browser.close();
})();
