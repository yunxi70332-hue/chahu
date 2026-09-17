// 临时 mock API:仅用于后端不可用时的前端 UI 自测(镜像真实后端响应形状,端口 4190,绝不占用 3001)
// 启动:node mock-realname-api.mjs  → http://localhost:4190
import http from 'node:http'

const PORT = 4190

// seed 镜像:login 响应不含 realnameStatus(与真实后端 auth.js 一致),/auth/me 与 /realname/me 返回
const users = {
  '13800000001': { id: 1, phone: '13800000001', name: '系统管理员', role: 'ADMIN', realnameStatus: 'APPROVED' },
  '13800000003': { id: 3, phone: '13800000003', name: '李小明', role: 'MEMBER', realnameStatus: 'APPROVED', realName: '李小明', idCardNo: '410102********6789', realnameReviewedAt: '2026-09-10T08:00:00.000Z' },
  '13800000004': { id: 4, phone: '13800000004', name: '王芳', role: 'MEMBER', realnameStatus: 'PENDING', realName: '王芳', idCardNo: '410102********2233', realnameSubmittedAt: '2026-09-14T10:24:00.000Z' },
  '13800000005': { id: 5, phone: '13800000005', name: '陈强', role: 'MEMBER', realnameStatus: 'REJECTED', realName: '陈强', idCardNo: '410102********1234', realnameRejectReason: '照片模糊,请重新上传清晰的人像面照片', realnameSubmittedAt: '2026-09-13T09:00:00.000Z', realnameReviewedAt: '2026-09-14T15:30:00.000Z' },
  '13800000007': { id: 7, phone: '13800000007', name: '刘洋', role: 'MEMBER', realnameStatus: 'NONE' },
}
const PASSWORD = 'member123'

function makeIdOk(id) {
  const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const codes = '10X98765432'
  if (!/^\d{17}[\dX]$/.test(id)) return false
  let sum = 0
  for (let i = 0; i < 17; i++) sum += Number(id[i]) * w[i]
  return codes[sum % 11] === id[17]
}

function myRealname(u) {
  return {
    realnameStatus: u.realnameStatus,
    realName: u.realName ?? null,
    idCardNo: u.idCardNo ?? null,
    realnameRejectReason: u.realnameStatus === 'REJECTED' ? (u.realnameRejectReason ?? null) : null,
    realnameSubmittedAt: u.realnameSubmittedAt ?? null,
    realnameReviewedAt: u.realnameReviewedAt ?? null,
  }
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}
const okRes = (res, data) => send(res, 200, { code: 0, data })
const fail = (res, code, message) => send(res, code, { code, message })

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

function authUser(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '')
  const phone = m && m[1].startsWith('mock-') ? m[1].slice(5) : null
  return phone ? users[phone] : null
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const p = url.pathname

  if (p === '/api/auth/login' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}')
    const u = users[body.phone]
    const expectPw = u && u.role === 'ADMIN' ? 'admin123' : PASSWORD
    if (!u || body.password !== expectPw) return fail(res, 400, '手机号或密码错误')
    // 与真实后端一致:登录响应不含 realnameStatus
    return okRes(res, { token: `mock-${body.phone}`, user: { id: u.id, phone: u.phone, name: u.name, role: u.role } })
  }

  if (p === '/api/auth/me' && req.method === 'GET') {
    const u = authUser(req)
    if (!u) return fail(res, 401, '未登录')
    const { id, phone, name, role, balance = 0, parentId = null, realnameStatus } = u
    return okRes(res, { id, phone, name, role, balance, parentId, realnameStatus })
  }

  if (p === '/api/realname/me' && req.method === 'GET') {
    const u = authUser(req)
    if (!u) return fail(res, 401, '未登录')
    return okRes(res, myRealname(u))
  }

  if (p === '/api/realname/submit' && req.method === 'POST') {
    const u = authUser(req)
    if (!u) return fail(res, 401, '未登录')
    if (u.role === 'ADMIN') return fail(res, 403, '无权限')
    if (u.realnameStatus === 'APPROVED') return fail(res, 400, '实名已通过并锁定,不可修改')
    if (u.realnameStatus === 'PENDING') return fail(res, 400, '实名资料审核中,请等待管理员审核')
    const body = await readBody(req)
    const text = body.toString('binary')
    const name = /name="realName"\r\n\r\n(.*)\r\n/.exec(text)?.[1]?.trim()
    const id = (/name="idCardNo"\r\n\r\n(.*)\r\n/.exec(text)?.[1]?.trim() || '').toUpperCase()
    const hasPhoto = /name="photo"; filename="[^"]+"/.test(text)
    if (!name) return fail(res, 400, '姓名必填')
    if (!makeIdOk(id)) return fail(res, 400, '身份证号格式不正确')
    if (!hasPhoto) return fail(res, 400, '请上传身份证照片')
    Object.assign(u, {
      realnameStatus: 'PENDING',
      realName: name,
      idCardNo: `${id.slice(0, 6)}********${id.slice(-4)}`,
      realnameRejectReason: null,
      realnameSubmittedAt: new Date().toISOString(),
      realnameReviewedAt: null,
    })
    return okRes(res, myRealname(u))
  }

  const resetMatch = /^\/api\/realname\/(\d+)\/reset$/.exec(p)
  if (resetMatch && req.method === 'POST') {
    const u = authUser(req)
    if (!u || u.role !== 'ADMIN') return fail(res, 403, '无权限')
    const target = Object.values(users).find((x) => x.id === Number(resetMatch[1]))
    if (!target) return fail(res, 404, '用户不存在')
    Object.assign(target, { realnameStatus: 'NONE', realName: null, idCardNo: null, realnameRejectReason: null, realnameSubmittedAt: null, realnameReviewedAt: null })
    return okRes(res, true)
  }

  fail(res, 404, 'not found')
})

server.listen(PORT, () => console.log(`mock realname api on :${PORT}`))
