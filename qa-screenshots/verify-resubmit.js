// v2.3 修复视觉验证:会员视角驳回单出现「修改重提」入口 + 弹窗内驳回原因提示(只看不改)
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:3001';
const OUT = __dirname;

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.getByPlaceholder('手机号').fill('13800000003');
  await page.getByPlaceholder('密码').fill('member123');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForURL('**/orders', { timeout: 8000 });
  await page.waitForTimeout(800);

  // 筛选已驳回
  await page.locator('.filter-status').click();
  await page.waitForTimeout(300);
  await page.getByRole('option', { name: '已驳回' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/40-resubmit-list.png` });

  // 打开修改重提弹窗
  const btn = page.getByRole('button', { name: '修改重提' }).first();
  const hasBtn = await btn.isVisible().catch(() => false);
  if (hasBtn) {
    await btn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/41-resubmit-dialog.png` });
    // 取消,不真实提交
    await page.getByRole('button', { name: '取消' }).click();
  }
  console.log(JSON.stringify({ hasResubmitButton: hasBtn, pageErrors: errors }, null, 2));
  await browser.close();
})();
