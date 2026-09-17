// 客户使用视角全链路 E2E:会员报单 → 管理员审核打款 → 驳回 → 会员核对
const { chromium } = require('playwright-core');
const BASE = 'http://localhost:3001';
const OUT = __dirname;

async function login(page, phone, pwd) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('bd_token'));
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('手机号').fill(phone);
  await page.getByPlaceholder('密码').fill(pwd);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForTimeout(2200);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

  // ========== 1. 会员视角:新建报单(三步向导) ==========
  await login(page, '13800000003', 'member123');
  console.log('member land:', page.url());
  await page.goto(BASE + '/orders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /新建报单/ }).click();
  await page.locator('.el-dialog .el-table__row').first().waitFor({ timeout: 10000 });
  await page.locator('.el-dialog .el-table__row').first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /下一步/ }).click();
  await page.waitForTimeout(700);
  await shot('30-member-wizard-confirm');

  // 提交(佣金不手改 → 服务端按最新比例算)
  const memberName = '李小明';
  await page.getByRole('button', { name: /提交报单/ }).click();
  await page.locator('.el-dialog .el-result').waitFor({ timeout: 10000 });
  const resultText = await page.locator('.el-dialog').last().innerText();
  const orderNoMatch = resultText.match(/BD\d+/);
  const newOrderNo = orderNoMatch ? orderNoMatch[0] : '';
  console.log('member created order:', newOrderNo);
  await shot('31-member-wizard-done');
  await page.getByRole('button', { name: /完\s*成/ }).click();
  await page.waitForTimeout(800);

  // 会员列表里能看到自己的新单(待审核)
  await page.getByPlaceholder(/物流单号|关键词/).fill(newOrderNo).catch(() => {});
  await page.getByPlaceholder('物流单号 / 客户 / 产品').fill(newOrderNo).catch(() => {});
  await page.getByRole('button', { name: /查\s*询/ }).click();
  await page.waitForTimeout(900);
  await shot('32-member-own-pending');

  // ========== 2. 管理员视角:审核通过 → 打款 ==========
  await login(page, '13800000001', 'admin123');
  await page.goto(BASE + '/orders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.getByPlaceholder('物流单号 / 客户 / 产品').fill(newOrderNo);
  await page.getByRole('button', { name: /查\s*询/ }).click();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /^通过$/, exact: true }).first().click();
  await page.waitForTimeout(500);
  await shot('33-admin-approve-dialog');
  // ElMessageBox 确认
  await page.getByRole('button', { name: /确定/ }).click();
  await page.waitForTimeout(1200);
  await shot('34-admin-after-approve');

  // ========== 3. 管理员:驳回另一笔待审单(必填原因) ==========
  await page.getByPlaceholder('物流单号 / 客户 / 产品').fill('');
  await page.getByRole('button', { name: /查\s*询/ }).click();
  await page.waitForTimeout(900);
  // 状态筛 待审核,取第一行驳回
  await page.locator('.el-select').first().click();
  await page.waitForTimeout(300);
  await page.getByText('待审核', { exact: true }).last().click();
  await page.getByRole('button', { name: /查\s*询/ }).click();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /^驳回$/, exact: true }).first().click();
  await page.waitForTimeout(500);
  // 驳回弹窗:原因必填
  const reasonBox = page.locator('.el-dialog:visible, .el-message-box:visible').last();
  await page.getByPlaceholder(/原因/).fill('机身划痕与描述不符,请重新核对后提交');
  await shot('35-admin-reject-dialog');
  await page.getByRole('button', { name: /确认驳回/ }).click();
  await page.waitForTimeout(1000);
  await shot('36-admin-after-reject');

  // ========== 4. 会员视角:看到打款流水与驳回结果 ==========
  await login(page, '13800000003', 'member123');
  await page.goto(BASE + '/transactions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot('37-member-transactions');
  // 报单详情看驳回原因(筛出自己的驳回单)
  await page.goto(BASE + '/orders', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.locator('.el-select').first().click();
  await page.waitForTimeout(300);
  await page.getByText('已驳回', { exact: true }).last().click();
  await page.getByRole('button', { name: /查\s*询/ }).click();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /查看/ }).first().click();
  await page.waitForTimeout(600);
  await shot('38-member-reject-reason');

  await ctx.close();
  await browser.close();
  console.log('DONE. newOrderNo =', newOrderNo);
  console.log('JS_ERRORS:', errors.length ? errors.join('|') : 'none');
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
