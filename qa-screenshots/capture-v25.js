// v2.5 品类计价设置 UI 验证:全局方式切换 / 单行方式切换 / 单位切换 / 保存并重算
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
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  await login(page, '13800000001', 'admin123', '/dashboard');
  await page.goto(BASE + '/products');
  await page.waitForTimeout(1200);

  // 打开弹窗
  await page.getByRole('button', { name: /品类计价设置/ }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/v25-1-dialog-default.png` });

  // 全局切换为「减固定金额」:全部行的单位应变成「元」
  await page.locator('.global-mode').getByText('减固定金额').click();
  await page.waitForTimeout(600);
  const unitsAfterGlobal = await page.locator('.rate-cell__unit').allInnerTexts();
  await page.screenshot({ path: `${OUT}/v25-2-global-fixed.png` });

  // 单行改回「下浮比例」:该行单位应变回 %
  const selects = page.locator('.mode-select');
  await selects.first().click();
  await page.waitForTimeout(400);
  await page.getByRole('option', { name: '下浮比例' }).click();
  await page.waitForTimeout(600);
  const firstRowUnit = await page.locator('.rate-cell__unit').first().innerText();
  await page.screenshot({ path: `${OUT}/v25-3-mixed-modes.png` });

  // 保存并重算
  await page.getByRole('button', { name: /保存并重算/ }).click();
  await page.waitForTimeout(3000);
  const toast = await page.locator('.el-message').first().innerText().catch(() => '(no toast)');
  await page.screenshot({ path: `${OUT}/v25-4-saved-list.png` });

  // 保存后的规则回读
  const rules = await page.evaluate(async () => {
    const r = await fetch('/api/settings/markdown', {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('bd_token') },
    });
    return (await r.json()).data.rules;
  });

  console.log(
    JSON.stringify(
      {
        unitsAfterGlobalFixed: unitsAfterGlobal.slice(0, 5),
        firstRowUnitAfterRowSwitch: firstRowUnit,
        saveToast: toast,
        rulesAfterSave: rules,
        errors,
      },
      null,
      1
    )
  );

  await browser.close();
})();
