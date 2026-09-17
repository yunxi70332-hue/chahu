// 真实 Excel 报价表 UI 导入实测
const { chromium } = require('playwright-core');
const BASE = 'http://localhost:3001';
const XLSX = 'D:/学习良心/大富通讯报价_清洗结果.xlsx';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 150)));

  // 登录
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('手机号').fill('13800000001');
  await page.getByPlaceholder('密码').fill('admin123');
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await page.waitForTimeout(2000);

  // 产品页 → 打开导入弹窗
  await page.goto(BASE + '/products', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /导入报价表/ }).click();
  await page.waitForTimeout(600);

  // 上传真实报价表
  const fileInput = page.locator('.el-dialog input[type=file]').first();
  await fileInput.setInputFiles(XLSX);
  await page.waitForTimeout(800);
  await page.screenshot({ path: __dirname + '/27-import-real-file.png' });

  // 确认导入
  await page.getByRole('button', { name: /确认导入/ }).click();
  // 导入 1685 行需要几秒,等结果面板出现
  await page.getByText(/异常自动下架|导入成功|导入产品/).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: __dirname + '/28-import-result.png' });

  // 读取结果面板数字
  const panelText = await page.locator('.el-dialog').last().innerText();
  console.log('RESULT_PANEL:', panelText.replace(/\s+/g, ' ').slice(0, 300));

  // 关闭弹窗刷新列表
  await page.getByRole('button', { name: /完\s*成/ }).click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: __dirname + '/29-products-after-import.png' });

  await browser.close();
  console.log('JS_ERRORS:', errors.length ? errors.join('|') : 'none');
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
