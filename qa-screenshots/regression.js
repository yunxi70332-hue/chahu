// 审计修复 + 实名认证功能回归测试(v2.2)
const BASE = 'http://localhost:3001/api';
let pass = 0, fail = 0;
const out = [];

function check(name, cond, detail = '') {
  if (cond) { pass++; out.push(`PASS  ${name}`); }
  else { fail++; out.push(`FAIL  ${name}  ${detail}`); }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function login(phone, password) {
  const r = await api('POST', '/auth/login', { body: { phone, password } });
  return r.json?.data?.token;
}

// 生成校验位合法的 18 位身份证号
function idCard(base17) {
  const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = '10X98765432';
  const sum = w.reduce((a, x, i) => a + Number(base17[i]) * x, 0);
  return base17 + codes[sum % 11];
}

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function submitRealname(token, name, base17) {
  const form = new FormData();
  form.append('realName', name);
  form.append('idCardNo', idCard(base17));
  form.append('photo', new Blob([TINY_PNG], { type: 'image/png' }), 'idcard.png');
  const res = await fetch(BASE + '/realname/submit', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function getPhoto(token, userId) {
  const res = await fetch(`${BASE}/realname/${userId}/photo`, { headers: { Authorization: `Bearer ${token}` } });
  return res.status;
}

(async () => {
  const admin = await login('13800000001', 'admin123');
  const agent = await login('13800000002', 'agent123');
  const member = await login('13800000003', 'member123'); // 李小明,seed 已实名
  const wangfang = await login('13800000004', 'member123'); // 王芳,seed 待审核
  const liuyang = await login('13800000007', 'member123'); // 刘洋,seed 未实名
  check('五账号登录', !!admin && !!agent && !!member && !!wangfang && !!liuyang);

  // 状态复位:王芳/刘洋重置为未实名,保证用例可重复执行
  for (const [token, kw] of [[wangfang, '王芳'], [liuyang, '刘洋']]) {
    const me = await api('GET', '/users?keyword=' + encodeURIComponent(kw), { token: admin });
    const uid = me.json?.data?.list?.[0]?.id;
    if (uid) await api('POST', `/realname/${uid}/reset`, { token: admin });
  }

  // ===== 实名基础:未实名拦截报单 =====
  let r = await api('POST', '/orders', { token: liuyang, body: { productId: 1, quantity: 1 } });
  check('未实名提交报单 → 400', r.status === 400 && /实名/.test(r.json?.message || ''), JSON.stringify(r.json));

  // options 默认只含已实名
  r = await api('GET', '/users/options', { token: admin });
  const opts = r.json?.data || [];
  check('options 仅已实名非管理员', opts.length > 0 && opts.every((u) => u.realnameStatus === 'APPROVED' && u.role !== 'ADMIN'), JSON.stringify(opts.slice(0, 3)));

  // 刘洋提交实名 → PENDING;重复提交 → 400(此后刘洋有照片,用于照片权限用例)
  r = await submitRealname(liuyang, '刘洋', '41010220020101123');
  check('刘洋提交实名 → PENDING', r.status === 200 && r.json?.data?.realnameStatus === 'PENDING', JSON.stringify(r.json));
  r = await submitRealname(liuyang, '刘洋', '41010220020101123');
  check('PENDING 重复提交 → 400', r.status === 400, JSON.stringify(r.json));
  const liuyangId = (await api('GET', '/users?keyword=刘洋', { token: admin })).json?.data?.list?.[0]?.id;

  // 王芳重置后重新提交,恢复待审核
  r = await submitRealname(wangfang, '王芳', '41010220020101123');
  check('王芳重新提交 → PENDING', r.status === 200 && r.json?.data?.realnameStatus === 'PENDING', JSON.stringify(r.json));

  // 王芳(待审核)报单 → 400
  r = await api('POST', '/orders', { token: wangfang, body: { productId: 1, quantity: 1 } });
  check('待审核状态报单 → 400', r.status === 400 && /实名/.test(r.json?.message || ''), JSON.stringify(r.json));

  // 照片权限(用已提交照片的刘洋):本人 200;他人 403;ADMIN 200;未登录 401
  check('本人看照片 → 200', (await getPhoto(liuyang, liuyangId)) === 200);
  check('他人看照片 → 403', (await getPhoto(member, liuyangId)) === 403);
  check('ADMIN 看照片 → 200', (await getPhoto(admin, liuyangId)) === 200);
  {
    const res = await fetch(`${BASE}/realname/${liuyangId}/photo`);
    check('未登录看照片 → 401', res.status === 401);
  }

  // 管理员审核:通过 → 锁定
  const wangId = (await api('GET', '/users?keyword=' + encodeURIComponent('王芳'), { token: admin })).json?.data?.list?.[0]?.id;
  r = await api('POST', `/realname/${wangId}/approve`, { token: admin });
  check('审核通过 → APPROVED', r.status === 200 && r.json?.data?.realnameStatus === 'APPROVED', JSON.stringify(r.json));
  r = await submitRealname(wangfang, '王芳', '41010220020101123');
  check('APPROVED 重提 → 400 锁定', r.status === 400 && /锁定/.test(r.json?.message || ''), JSON.stringify(r.json));
  r = await api('POST', '/orders', { token: wangfang, body: { productId: 1, quantity: 1 } });
  check('已实名报单不再拦截(走到其他校验)', r.status !== 400 || !/实名/.test(r.json?.message || ''), JSON.stringify(r.json));

  // 驳回链路:ADMIN 重置王芳 → 重新提交 → 驳回 → 原因可见 → 再提交
  r = await api('POST', `/realname/${wangId}/reset`, { token: admin });
  check('管理员重置 → NONE', r.status === 200 && r.json?.data?.realnameStatus === 'NONE', JSON.stringify(r.json));
  r = await submitRealname(wangfang, '王芳', '41010220020101123');
  check('重置后可重新提交', r.status === 200 && r.json?.data?.realnameStatus === 'PENDING', JSON.stringify(r.json));
  r = await api('POST', `/realname/${wangId}/reject`, { token: admin, body: {} });
  check('驳回无原因 → 400', r.status === 400, JSON.stringify(r.json));
  r = await api('POST', `/realname/${wangId}/reject`, { token: admin, body: { reason: '照片反光,请重拍' } });
  check('驳回成功', r.status === 200 && r.json?.data?.realnameRejectReason === '照片反光,请重拍', JSON.stringify(r.json));
  r = await api('GET', '/realname/me', { token: wangfang });
  check('本人可见驳回原因', r.json?.data?.realnameRejectReason === '照片反光,请重拍', JSON.stringify(r.json));
  // 恢复王芳为通过态(供演示)
  r = await submitRealname(wangfang, '王芳', '41010220020101123');
  await api('POST', `/realname/${wangId}/approve`, { token: admin });

  // 证件号非法校验
  const tempPhone = '138' + String(Date.now()).slice(-8);
  r = await api('POST', '/users', { token: admin, body: { phone: tempPhone, name: '临时用户', password: '123456', role: 'MEMBER' } });
  const temp = await login(tempPhone, '123456');
  r = await submitRealname(temp, '临时用户', '410102200201011230'); // 18位但校验位错
  check('身份证校验位错误 → 400', r.status === 400 && /身份证/.test(r.json?.message || ''), JSON.stringify(r.json));

  // ===== 原有核心链路(隔离会员走完整实名) =====
  const isolatedPhone = '138' + String(Date.now()).slice(-8);
  r = await api('POST', '/users', { token: admin, body: { phone: isolatedPhone, name: '隔离会员', password: '123456', role: 'MEMBER' } });
  check('ADMIN 建隔离会员', r.status === 200, JSON.stringify(r.json));
  const isolated = await login(isolatedPhone, '123456');
  const isoBase17 = '41010219990909999';
  const isoTokenRes = await submitRealname(isolated, '隔离会员', isoBase17);
  check('隔离会员实名提交', isoTokenRes.status === 200, JSON.stringify(isoTokenRes.json));
  const isoId = (await api('GET', '/users?keyword=' + encodeURIComponent(isolatedPhone), { token: admin })).json?.data?.list?.[0]?.id;
  r = await api('POST', `/realname/${isoId}/approve`, { token: admin });
  check('隔离会员实名通过', r.status === 200, JSON.stringify(r.json));

  r = await api('GET', '/products?available=1&pageSize=1', { token: admin });
  const prod = r.json?.data?.list?.[0];
  check('可用产品存在', !!prod);

  r = await api('POST', '/orders', { token: admin, body: { productId: prod.id, quantity: 1, userId: isoId } });
  const isolatedOrder = r.json?.data;
  check('ADMIN 为隔离会员建单(佣金自动算)', r.status === 200 && typeof isolatedOrder?.commission === 'number', JSON.stringify(r.json));

  r = await api('POST', `/orders/${isolatedOrder.id}/approve`, { token: agent });
  check('AGENT 越权审非下线单 → 403', r.status === 403, JSON.stringify(r.json));

  r = await api('POST', '/orders', { token: admin, body: { productId: prod.id, quantity: 1, userId: member ? (await api('GET', '/users?keyword=李小明', { token: admin })).json?.data?.list?.[0]?.id : undefined } });
  const inScopeOrder = r.json?.data;
  const lmId = inScopeOrder?.userId;
  const before = (await api('GET', '/users/options?all=1', { token: admin })).json?.data?.find((u) => u.id === lmId)?.balance ?? 0;
  r = await api('POST', `/orders/${inScopeOrder.id}/approve`, { token: agent });
  check('AGENT 审下线单 → 200', r.status === 200, JSON.stringify(r.json));
  const after = (await api('GET', '/users/options?all=1', { token: admin })).json?.data?.find((u) => u.id === lmId)?.balance ?? 0;
  check('打款=本金+佣金', Math.abs(after - before - inScopeOrder.totalAmount - inScopeOrder.commission) < 0.01);

  r = await api('POST', `/orders/${inScopeOrder.id}/approve`, { token: admin });
  check('重复审核 → 400', r.status === 400);

  r = await api('GET', `/transactions?userId=${lmId}&pageSize=5`, { token: admin });
  const txs = r.json?.data?.list || [];
  const latest2 = txs.slice(0, 2).reverse();
  check('流水两笔类型正确', latest2[0]?.type === 'ORDER' && latest2[1]?.type === 'COMMISSION');
  check('balanceAfter=最终余额', Math.abs(latest2[1].balanceAfter - after) < 0.01);

  r = await api('POST', '/orders', { token: admin, body: { productId: prod.id, quantity: 1, userId: isoId, remark: '客户原备注ABC' } });
  const ro = r.json?.data;
  r = await api('POST', `/orders/${ro.id}/reject`, { token: admin, body: { remark: '价格与报价表不符' } });
  check('驳回+备注保留+rejectReason', r.status === 200 && r.json?.data?.remark === '客户原备注ABC' && r.json?.data?.rejectReason === '价格与报价表不符', JSON.stringify(r.json?.data));

  r = await api('POST', `/users/${isoId}/balance`, { token: admin, body: { type: 'WITHDRAW', amount: 999999, remark: '超额' } });
  check('超额提现 → 400', r.status === 400);
  r = await api('PUT', '/settings/commission', { token: admin, body: { rates: { 手机: 150 } } });
  check('比例>100 → 400', r.status === 400);
  r = await api('PUT', `/users/${isoId}`, { token: admin, body: { parentId: isoId } });
  check('上级=自己 → 400', r.status === 400);

  console.log(out.join('\n'));
  console.log(`\n===> PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
