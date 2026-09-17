/* 冒烟测试:登录 → 用户管理 → 双击「已实名」徽章 → 截图验证实名信息快照弹窗 */
const fs = require('fs');
const { execFile } = require('child_process');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const BASE = 'http://localhost:5174';
const OUT = __dirname + '/qa-screenshots';

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

  // 1. 打开登录页并种 token(通过后端 API 登录拿 token)
  await send('Page.navigate', { url: BASE + '/login' });
  await sleep(2500);
  const token = await evalJs(`fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '13800000001', password: 'admin123' }),
    }).then(r => r.json()).then(d => { if (d.code !== 0) throw new Error('登录失败 ' + JSON.stringify(d)); return d.data.token; })`, true);
  await evalJs(`localStorage.setItem('bd_token', ${JSON.stringify(token)})`);
  console.log('登录成功, token 已写入');

  // 2. 进入用户管理页
  await send('Page.navigate', { url: BASE + '/users' });
  await sleep(3000);
  const rowCount = await evalJs(`document.querySelectorAll('.users-table .el-table__row').length`);
  console.log('用户表行数:', rowCount);
  await shot('01-users-list.png');

  // 3. 双击第一个「已实名」徽章
  await evalJs(`(() => {
      const tags = [...document.querySelectorAll('.users-table .el-tag')].filter(t => t.textContent.trim() === '已实名');
      if (!tags.length) throw new Error('未找到「已实名」徽章');
      tags[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      return tags.length;
    })()`);
  await sleep(1800); // 等弹窗加载详情 + 照片 blob

  // 4. 校验弹窗内容
  const check = await evalJs(`(() => {
      const dlg = document.querySelector('.el-dialog');
      if (!dlg) return { open: false };
      const title = dlg.querySelector('.el-dialog__title')?.textContent.trim() || '';
      const body = dlg.textContent;
      return {
        open: true,
        title,
        hasRealName: body.includes('真实姓名'),
        hasIdNo: body.includes('身份证号'),
        hasPhotoArea: !!dlg.querySelector('.el-image'),
        hasResetBtn: body.includes('重置实名'),
        hasApproveBtn: body.includes('通过'),
        hasRejectBtn: body.includes('驳回'),
        hasCloseBtn: body.includes('关闭'),
        tip: dlg.querySelector('.readonly-tip')?.textContent.trim() || '',
      };
    })()`);
  console.log('弹窗校验:', JSON.stringify(check, null, 2));
  await shot('02-snapshot-dialog.png');

  const pass = check.open && check.title.startsWith('实名信息快照') && check.hasRealName && check.hasIdNo
    && check.hasPhotoArea && !check.hasResetBtn && !check.hasApproveBtn && !check.hasRejectBtn;
  console.log(pass ? '✅ 冒烟测试通过' : '❌ 冒烟测试不通过');

  // 5. 关闭弹窗,双击「未实名」徽章验证无响应
  await evalJs(`(() => {
      document.querySelector('.el-dialog__headerbtn')?.click();
      const tags = [...document.querySelectorAll('.users-table .el-tag')].filter(t => t.textContent.trim() === '未实名');
      if (tags.length) tags[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      return true;
    })()`);
  await sleep(800);
  // el-dialog 关闭后 DOM 节点仍保留(仅隐藏),需按可见性判断
  const noneOpened = await evalJs(`(() => {
      const overlays = [...document.querySelectorAll('.el-overlay')];
      return overlays.length === 0 || overlays.every(o => getComputedStyle(o).display === 'none');
    })()`);
  console.log(noneOpened ? '✅ 双击「未实名」无弹窗' : '❌ 双击「未实名」意外弹出弹窗');
  await shot('03-after-none-dblclick.png');

  ws.close();
  process.exit(pass && noneOpened ? 0 : 1);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
