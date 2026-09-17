/* 冒烟测试(v2.7 提现审核):会员申请 → 管理员审核通过/待审留存 → 用户侧状态与流水核验 → 截图 */
const fs = require('fs');
const { execFile } = require('child_process');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
const BASE = 'http://localhost:3001';
const OUT = __dirname + '/../qa-screenshots';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, msgId = 0;
const pending = new Map();
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
function onMessage(raw) {
  const m = JSON.parse(raw);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
}

async function evalJs(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', {
    expression, awaitPromise, returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

async function shot(file) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}/${file}`, Buffer.from(r.data, 'base64'));
  console.log('截图:', file);
}

/** 给 Element Plus 输入框赋值(原生 setter + input/change 事件) */
function setInputExpr(selector, value) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('未找到输入框 ' + ${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  })()`;
}

/** 登录指定账号并把 token 写入 localStorage */
async function login(phone, password) {
  await send('Page.navigate', { url: BASE + '/login' });
  await sleep(2000);
  const token = await evalJs(`fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: ${JSON.stringify(phone)}, password: ${JSON.stringify(password)} }),
    }).then(r => r.json()).then(d => { if (d.code !== 0) throw new Error('登录失败 ' + JSON.stringify(d)); return d.data.token; })`, true);
  await evalJs(`localStorage.setItem('bd_token', ${JSON.stringify(token)})`);
  console.log('登录成功:', phone);
  return token;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = execFile(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1600,900', '--user-data-dir=' + __dirname + '/.chrome-tmp', 'about:blank',
  ]);
  process.on('exit', () => { try { chrome.kill(); } catch {} });

  // 等 CDP 端口就绪
  let targets;
  for (let i = 0; i < 30; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); break; } catch { await sleep(500); }
  }
  if (!targets) throw new Error('CDP 端口未就绪');
  const page = targets.find((t) => t.type === 'page');

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => onMessage(e.data);
  await send('Page.enable');
  await send('Runtime.enable');

  /* ===== 1. 王芳(会员)申请提现 ===== */
  await login('13800000004', 'member123');
  await send('Page.navigate', { url: BASE + '/my-withdraws' });
  await sleep(2500);

  const balBefore = await evalJs(`document.querySelector('.balance-value')?.textContent.trim() || ''`);
  console.log('页面当前余额展示:', balBefore);

  // 打开申请弹窗,填写:金额 12000 / 银行卡 / 卡号 / 姓名
  await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('申请提现'));
    if (!btn) throw new Error('未找到「申请提现」按钮');
    btn.click(); return true;
  })()`);
  await sleep(1200);
  await evalJs(setInputExpr('.el-dialog .el-input-number input', '12000'));
  await sleep(300);
  // 选「银行卡」
  await evalJs(`(() => {
    const radio = [...document.querySelectorAll('.el-dialog .el-radio-button')].find(b => b.textContent.includes('银行卡'));
    if (!radio) throw new Error('未找到银行卡选项');
    radio.querySelector('input')?.click() || radio.click(); return true;
  })()`);
  await sleep(300);
  await evalJs(setInputExpr('.el-dialog .el-form-item:nth-child(3) input', '622202020011223340'));
  await sleep(200);
  await evalJs(setInputExpr('.el-dialog .el-form-item:nth-child(4) input', '王芳'));
  await sleep(300);
  await shot('v27-1-apply-dialog.png');

  // 提交
  await evalJs(`(() => {
    const btn = [...document.querySelectorAll('.el-dialog footer button, .el-dialog__footer button')].find(b => b.textContent.includes('提交申请'));
    if (!btn) throw new Error('未找到提交按钮');
    btn.click(); return true;
  })()`);
  await sleep(2000);
  const pendingRow = await evalJs(`(() => {
    const row = [...document.querySelectorAll('.el-table__row')].find(r => r.textContent.includes('WD'));
    return row ? { text: row.textContent.replace(/\\s+/g, ' ').slice(0, 160) } : null;
  })()`);
  console.log('申请后首行:', JSON.stringify(pendingRow));
  await shot('v27-2-my-withdraw-pending.png');

  // 第二笔:支付宝 8000(走 API,供管理员页多条展示)
  await evalJs(`fetch('/api/withdraws', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('bd_token') },
      body: JSON.stringify({ amount: 8000, method: 'ALIPAY', account: 'wangfang@163.com', accountName: '王芳' }),
    }).then(r => r.json()).then(d => { if (d.code !== 0) throw new Error('第二笔失败 ' + JSON.stringify(d)); return d.data.wdNo; })`, true);
  await send('Page.navigate', { url: BASE + '/my-withdraws' });
  await sleep(2000);
  await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('查询'));
    return true;
  })()`);
  await sleep(500);
  await shot('v27-3-my-withdraw-two-pending.png');

  /* ===== 2. 管理员审核 ===== */
  await login('13800000001', 'admin123');
  // 看板:提现待审卡
  await send('Page.navigate', { url: BASE + '/dashboard' });
  await sleep(2500);
  const dash = await evalJs(`(() => {
    const cards = [...document.querySelectorAll('.stat-card')].map(c => ({
      title: c.querySelector('.stat-card__title')?.textContent.trim(),
      value: c.querySelector('.stat-card__value')?.textContent.trim(),
    }));
    return cards.find(c => c.title && c.title.includes('提现待审')) || null;
  })()`);
  console.log('看板提现待审卡:', JSON.stringify(dash));
  await shot('v27-4-dashboard-card.png');

  // 提现审核列表
  await send('Page.navigate', { url: BASE + '/withdraw-review' });
  await sleep(2500);
  const listInfo = await evalJs(`(() => {
    const rows = document.querySelectorAll('.el-table__row').length;
    const summary = document.querySelector('.summary-item__value')?.textContent.trim() || '';
    return { rows, pendingSum: summary };
  })()`);
  console.log('审核列表:', JSON.stringify(listInfo));
  await shot('v27-5-review-list.png');

  // 打开 12000(银行卡)那笔的审核弹窗
  await evalJs(`(() => {
    const row = [...document.querySelectorAll('.el-table__row')].find(r => r.textContent.includes('622202020011223340'));
    if (!row) throw new Error('未找到银行卡申请行');
    const btn = [...row.querySelectorAll('button')].find(b => b.textContent.includes('审核'));
    if (!btn) throw new Error('行内无审核按钮');
    btn.click(); return true;
  })()`);
  await sleep(1800);
  const dlgInfo = await evalJs(`(() => {
    const dlg = document.querySelector('.el-dialog');
    if (!dlg) return { open: false };
    const body = dlg.textContent;
    return {
      open: true,
      title: dlg.querySelector('.el-dialog__title')?.textContent.trim(),
      hasWdNo: body.includes('WD'),
      hasAccount: body.includes('622202020011223340'),
      hasAmount: body.includes('12,000.00'),
      hasApprove: body.includes('通过打款'),
      hasReject: body.includes('驳 回'),
    };
  })()`);
  console.log('审核弹窗:', JSON.stringify(dlgInfo));
  await shot('v27-6-review-dialog.png');

  // 通过打款 → 确认
  await evalJs(`(() => {
    const btn = [...document.querySelectorAll('.el-dialog button')].find(b => b.textContent.includes('通过打款'));
    if (!btn) throw new Error('未找到「通过打款」');
    btn.click(); return true;
  })()`);
  await sleep(1200);
  await evalJs(`(() => {
    const btn = [...document.querySelectorAll('.el-message-box button')].find(b => b.textContent.includes('确认通过'));
    if (!btn) throw new Error('未找到确认按钮');
    btn.click(); return true;
  })()`);
  await sleep(2200);
  const approvedRow = await evalJs(`(() => {
    const row = [...document.querySelectorAll('.el-table__row')].find(r => r.textContent.includes('622202020011223340'));
    return row ? { text: row.textContent.replace(/\\s+/g, ' ').slice(0, 160) } : null;
  })()`);
  console.log('通过后该行:', JSON.stringify(approvedRow));
  await shot('v27-7-review-after-approve.png');

  /* ===== 3. 回到会员视角核验 ===== */
  await login('13800000004', 'member123');
  await send('Page.navigate', { url: BASE + '/my-withdraws' });
  await sleep(2500);
  const myCheck = await evalJs(`(() => {
    const rows = [...document.querySelectorAll('.el-table__row')];
    const approved = rows.find(r => r.textContent.includes('已通过'));
    const pended = rows.find(r => r.textContent.includes('待审核'));
    return {
      approvedFound: !!approved,
      approvedHasTx: approved ? /TX\\d+/.test(approved.textContent) : false,
      pendingFound: !!pended,
      pendingHasCancel: pended ? [...pended.querySelectorAll('button')].some(b => b.textContent.includes('撤销')) : false,
      balance: document.querySelector('.balance-value')?.textContent.trim(),
      available: document.querySelectorAll('.balance-value')[1]?.textContent.trim(),
    };
  })()`);
  console.log('会员侧核验:', JSON.stringify(myCheck, null, 2));
  await shot('v27-8-my-withdraw-after.png');

  // 资金流水出现 WITHDRAW
  await send('Page.navigate', { url: BASE + '/transactions?type=WITHDRAW' });
  await sleep(2500);
  const txnCheck = await evalJs(`(() => {
    const row = document.querySelector('.el-table__row');
    return row ? { text: row.textContent.replace(/\\s+/g, ' ').slice(0, 180) } : null;
  })()`);
  console.log('流水首行:', JSON.stringify(txnCheck));
  await shot('v27-9-transactions-withdraw.png');

  const pass = pendingRow && approvedRow && approvedRow.text.includes('已通过')
    && myCheck.approvedFound && myCheck.approvedHasTx && myCheck.pendingFound && myCheck.pendingHasCancel
    && txnCheck && txnCheck.text.includes('提现打款') && txnCheck.text.includes('WD');
  console.log(pass ? '✅ 冒烟测试通过' : '❌ 冒烟测试不通过');
  process.exitCode = pass ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
