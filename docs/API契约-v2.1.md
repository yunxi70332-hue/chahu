# 数码报单系统 — API 契约 v2.1(唯一事实来源)

> 所有前后端开发以本文档为准。发现缺口回报主线程裁决,不得自行发挥。
> 业务背景:二手数码**回收**平台。报单审核通过 = **平台打款**给报单人(余额 += 货款 + 佣金);提现为线下转账后管理员记账扣减。

---

## 0. 通用约定

- Base URL:`http://localhost:3001/api`(前端 Vite dev 代理 `/api` → 3001)
- 认证:除 `/auth/login` 外均需 `Authorization: Bearer <token>`(JWT,12h)
- 成功响应:`{ "code": 0, "data": <见各端点> }`(HTTP 200)
- 失败响应:HTTP 4xx/5xx + `{ "code": <同HTTP状态>, "message": "中文错误" }`;401 = 未登录/过期(前端跳登录);403 = 无权限
- 数据可见范围:**ADMIN 全量;AGENT 自己+下线(递归);MEMBER 仅自己**(适用于报单、流水、看板)

### 枚举

| 枚举 | 值 | 中文 |
| --- | --- | --- |
| 角色 role | ADMIN / AGENT / MEMBER | 管理员 / 代理 / 会员 |
| 报单状态 status | PENDING / APPROVED / REJECTED | 待审核(橙) / 已通过(绿) / 已驳回(红) |
| 流水类型 type | ORDER / COMMISSION / WITHDRAW / RECHARGE / ADJUST | 报单打款 / 佣金 / 提现 / 补款 / 调整 |
| 产品状态 | ACTIVE / DISABLED | 上架 / 下架 |
| 用户状态 | ACTIVE / FROZEN | 正常 / 已冻结 |

### 佣金规则

- 管理员按品类设置比例(%),存于设置项;**未配置的品类按 0**
- 建单时 body **不传 `commission`** → 自动:`commission = round(totalAmount × rate / 100, 2)`
- body 传了 `commission`(含 0)→ 按手动值
- 审核通过写两笔流水:货款(ORDER,`+totalAmount`,备注 `报单打款 <orderNo>`)与佣金(COMMISSION,`+commission`,备注 `<orderNo> · <品类> <比例>%`,仅 commission>0 时)

---

## 1. 认证 `/auth`

### POST /auth/login
```json
// req
{ "phone": "13800000001", "password": "admin123" }
// res.data
{ "token": "eyJ...", "user": { "id": 1, "phone": "13800000001", "name": "系统管理员", "role": "ADMIN" } }
```
错误:400 手机号或密码错误;403 账号已冻结。

### GET /auth/me → `data`
`{ "id":1, "phone":"13800000001", "name":"系统管理员", "role":"ADMIN", "balance":0, "parentId":null }`

### POST /auth/password
`{ "oldPassword":"...", "newPassword":"..." }`(≥6 位)→ `true`

---

## 2. 看板 GET /dashboard/stats?days=7(7|30)

按当前用户可见范围过滤。`data`:
```json
{
  "cards": {
    "todayOrders": 32,        // 今日提交报单数(全部状态)
    "todayAmount": 286450,    // 今日报单总金额
    "todayPayout": 298120,    // 今日打款 = 当日 ORDER+COMMISSION 流水合计
    "todayWithdraw": 50000,   // 今日提现合计(绝对值)
    "pendingCount": 14,
    "userCount": 128
  },
  "trend": [ { "date": "2026-09-09", "orderAmount": 0, "payout": 0 } ],   // 近 days 天
  "statusDist": [ { "status": "APPROVED", "count": 62 } ],
  "categoryDist": [ { "category": "手机", "count": 45, "amount": 123456 } ], // top8,按 count 降序
  "latestPending": [ { "id":101, "orderNo":"BD20260915032", "productName":"iPhone 17 Pro 256G", "totalAmount":8999, "createdAt":"...", "user": { "name":"张伟", "role":"AGENT" } } ] // 最新 5 条待审
}
```

---

## 3. 报单 `/orders`

### GET /orders?page=1&pageSize=10&status=&type=&keyword=&startDate=2026-09-01&endDate=2026-09-15&userId=
- `keyword` 匹配:orderNo / logisticsNo / productName / 报单人姓名/手机号
- `type` = 产品大类;日期含首尾
```json
// res.data
{ "total": 80, "page": 1, "pageSize": 10,
  "list": [ {
    "id":101, "orderNo":"BD20260915032", "logisticsNo":"SF1234567890",
    "userId":3, "user": { "id":3, "name":"张伟", "phone":"13800000002", "role":"AGENT" },
    "productId":55, "productName":"iPhone 17 Pro 256G 黑色", "productType":"手机",
    "spec":"8G+256G / 黑色", "quantity":1, "unitPrice":8999, "totalAmount":8999,
    "commission":135, "status":"PENDING", "remark":null,
    "reviewedBy":null, "reviewer":null, "reviewedAt":null,
    "createdAt":"2026-09-15T10:24:00.000Z", "updatedAt":"..."
  } ] }
```
`reviewer` 为审核人 `{ "name": "系统管理员" }` 或 null。

### POST /orders
```json
{ "productId": 55, "quantity": 1, "commission": 135, "logisticsNo": "SF123", "remark": "", "userId": 3 }
```
- `productId` 必填(从产品库选);`quantity` 默认 1;`unitPrice` 不传自动取产品 price
- `userId` 仅 ADMIN 传(代客下单),其他角色强制自己
- 佣金规则见 §0; productName/productType/spec 服务端从产品快照生成
- 校验:产品不存在/已下架 400
- res.data = 完整 order(结构同列表项)

### PUT /orders/:id — 仅 PENDING 可改(quantity/unitPrice/commission/remark/logisticsNo),重算 totalAmount
### DELETE /orders/:id — 仅 PENDING 可删(范围:自己/下线)
### POST /orders/:id/approve { "remark": "" } — ADMIN/AGENT(范围:自己/下线);通过=打款(见 §0);重复审核 400
### POST /orders/:id/reject { "remark": "必填" } — 400 当 remark 为空;原因写入 `rejectReason` 字段,**不覆盖报单人 remark**

### 批量审核
```
POST /orders/batch-approve { "ids": [101,102] }
POST /orders/batch-reject  { "ids": [101,102], "remark": "必填" }
// res.data
{ "success": [101,102], "failed": [ { "id":103, "reason":"该报单已审核过" } ] }
```

---

## 4. 产品 `/products`

### GET /products?page&pageSize&keyword&category&brand&status&available=1
- `keyword` 匹配 name/brand/model;`available=1` 仅供建单选品:**status=ACTIVE 且 price>0**
```json
{ "total":1685, "page":1, "pageSize":20,
  "list": [ { "id":55, "category":"手机", "brand":"Apple", "name":"iPhone 17 Pro 256G 黑色",
      "model":"iPhone 17 Pro", "memory":null, "disk":"256G", "screen":null, "color":"黑色",
      "condition":"官方价8999", "price":8999, "quoteDate":"2026-09-15",
      "status":"ACTIVE", "createdAt":"..." } ] }
```
价格异常行 = `price === null || price <= 0 || status === 'DISABLED'`(前端操作列显示「核对」)。

### GET /products/meta → `{ "categories": ["手机","平板电脑",...], "brands": ["Apple","华为",...] }`

### POST /products(ADMIN)`{ "category":"手机", "brand":"小米", "name":"红米 K90 256G", "model":"","memory":"","disk":"256G","screen":"","color":"","condition":"","price":1999, "quoteDate":"2026-09-15" }` → 完整产品
### PUT /products/:id(ADMIN)同上字段任意子集
### POST /products/:id/status(ADMIN)`{ "status": "DISABLED" }`
### DELETE /products/:id(ADMIN)已被报单引用时 400「请下架而非删除」

### POST /products/import(ADMIN)— multipart/form-data,字段名 `file`,.xlsx
服务端:解析表头(产品大类/品牌/产品名称/型号·子规格/内存/硬盘/屏幕·尺寸/颜色/成色·备注/参考回收价/报价日期)→ **事务内整批替换产品库**(历史报单靠快照字段,productId 置空)→ 价格 ≤0/空的产品置 DISABLED。
```json
// res.data
{ "imported": 1685, "disabled": 23, "quoteDate": "2026-09-15" }
```

---

## 5. 佣金设置 `/settings/commission`

### GET → `{ "rates": { "手机": 1.5, "平板电脑": 1.2, "智能穿戴": 1.0, "笔记本电脑": 1.0, "配件": 0.5 } }`
### PUT(ADMIN)`{ "rates": { "手机": 1.8 } }` → 同 GET 结构(全量覆盖保存)

---

## 6. 用户 `/users`(除 options 外均 ADMIN)

### GET /users?page&pageSize&role&status&keyword
```json
{ "total":7, "page":1, "pageSize":10,
  "list": [ { "id":3, "phone":"13800000002", "name":"张伟", "role":"AGENT", "parentId":2,
      "level":0, "balance":45230.5, "status":"ACTIVE", "createdAt":"...",
      "parent": { "name": null } } ] }
```
`parent` = 上级 `{ "name": "张代理" }` 或 null。管理员页面手机号显示完整号(见 §8)。

### POST /users `{ "phone":"13800000009", "name":"王店长", "password":"123456", "role":"AGENT", "parentId":2, "level":0, "balance":0 }` → `{ "id": 8 }`;初始 balance>0 记一笔 RECHARGE 流水(备注 开户充值)
### PUT /users/:id — phone/name/role/parentId/level 任意子集
### POST /users/:id/freeze · /unfreeze → true(不能冻结自己)
### POST /users/:id/reset-password `{ "password": "123456" }` → true
### POST /users/:id/balance `{ "type":"WITHDRAW", "amount":20000, "remark":"9/15 线下转账提现,工行尾号8899" }`
- RECHARGE 补款(+) / WITHDRAW 提现(−) / ADJUST 调整(amount 可正负)
- remark 必填;结果为负余额 400「调整后余额不能为负」
- res.data = 流水记录(结构同 §7 列表项);余额不足 WITHDRAW 同样 400
### GET /users/options(ADMIN,建单选报单人)→ `[ { "id":3, "name":"张伟", "phone":"13800000002", "role":"AGENT", "balance":45230.5 } ]`(仅 ACTIVE)

---

## 7. 流水 GET /transactions?page&pageSize&type&keyword&startDate&endDate&userId

- 可见范围按 §0;`keyword` 匹配 txNo
```json
{ "total":96, "page":1, "pageSize":10,
  "incomeSum": 298120,    // 当前筛选范围内 正金额合计
  "expenseSum": 50000,    // 当前筛选范围内 负金额绝对值合计
  "list": [ { "id":201, "txNo":"LS20260915021", "userId":3,
      "user": { "id":3, "name":"张伟", "phone":"13800000002" },
      "type":"ORDER", "typeLabel":"报单打款", "amount":8999, "balanceAfter":45095.5,
      "orderId":101, "order": { "orderNo":"BD20260915032" },
      "remark":"报单打款 BD20260915032", "createdAt":"..." } ] }
```
typeLabel 服务端给出;`order` 可为 null(非报单类流水)。

---

## 8. 设计规范(前端全局)

| Token | 值 | 用途 |
| --- | --- | --- |
| 主色 | `#0052D9` | 按钮/链接/选中/图表主系列 |
| 侧栏 | `#191919` 底 + 白字 | 桌面固定,≤768px 抽屉 |
| 文字 | `#333333` 标题 / `#666666` 正文 / `#999999` 辅助 | |
| 边框 | `#E8E8E8` | 分隔线/卡片描边 |
| success | `#2BA471` | 已通过、收入 +¥ |
| warning | `#E37318` | 待审核 |
| danger | `#D54941` | 已驳回、支出 −¥ |

- 金额:¥ + 千分位(如 ¥45,230.50);流水收入 `+¥` 绿、支出 `−¥` 红
- 手机号打码:仅针对非管理员展示层(如 138****6688);**ADMIN 账号全站显示完整号**(用户列表/实名审核/重置密码/报单人下拉等均为原文),非 ADMIN 在共用的报单页仍打码
- 品牌:登录页左区 logo「单」+「数码报单系统」+ 徽标「内部版」+「郑州天讯商贸行」
- 菜单:ADMIN 全部(看板/报单管理/产品管理/用户管理/资金流水);AGENT(看板/报单管理/**实名认证**/资金流水);MEMBER(报单管理/**实名认证**/资金流水)

---

## 9. 实名认证 `/realname`(v2.2;代理与会员同一性质,均需实名)

实名状态:`NONE 未实 / PENDING 待审 / APPROVED 已实(锁定) / REJECTED 已驳(可重传)`。
照片存 `D:\baodan-data\uploads\idcards\`,仅经鉴权接口查看(本人或 ADMIN),前端 blob 加载。

### GET /realname/me → 本人实名信息(证件号脱敏 `6********4`)
```json
{ "realnameStatus": "REJECTED", "realName": "陈强", "idCardNo": "410102********1234",
  "realnameRejectReason": "照片模糊…", "realnameSubmittedAt": "...", "realnameReviewedAt": "..." }
```

### POST /realname/submit — multipart(form-data):`realName` / `idCardNo` / `photo`(jpg·png·webp ≤5MB)
- 校验:姓名必填;身份证号 18 位+校验位;照片必传
- 状态机:NONE/REJECTED → PENDING;PENDING → 400「审核中」;**APPROVED → 400「实名已通过并锁定,不可修改」**
- 驳回重传自动覆盖旧照片文件

### GET /realname/:userId — ADMIN 查看实名详情(含**完整证件号**供核对 + hasPhoto)
### GET /realname/:userId/photo — 本人或 ADMIN 可看(他人 403,未登录 401),图片流
### POST /realname/:userId/approve — ADMIN → APPROVED(锁定)
### POST /realname/:userId/reject — ADMIN,`{ "reason": "必填" }` → REJECTED
### POST /realname/:userId/reset — ADMIN 纠错 → NONE(删除照片)

### 联动规则
- `POST /orders`:报单人 role ≠ ADMIN 时 `realnameStatus` 必须 APPROVED,否则 400「未完成实名认证」
- `GET /users/options`:默认仅返回 ACTIVE + **已实名** + 非管理员;`?all=1` 返回全部 ACTIVE
- `GET /users` 列表项新增:`realName/idCardNo/realnameStatus/realnameRejectReason/realnameSubmittedAt/realnameReviewedAt`;筛选支持 `realnameStatus`
- `GET /auth/me` 返回体新增 `realnameStatus`
- 证件号展示:本人/列表脱敏;管理员审核弹窗用完整号

## 10. 提现 `/withdraws`(v2.7;申请-审核流,与用户管理「线下转账记账」两通道并存)

申请状态:`PENDING 待审 / APPROVED 已通过(已扣款) / REJECTED 已驳回`。
可用余额 = `balance − 待审中提现合计`(申请时校验);审核通过在事务内复查状态与余额后扣款,并写 `WITHDRAW` 负金额流水(remark `提现打款 <wdNo>`),`transactionId` 关联该流水。

### POST /withdraws — 发起申请(AGENT/MEMBER;ADMIN 400)
```json
// req
{ "amount": 12000, "method": "BANK", "account": "622202020011223340", "accountName": "王芳" }
// res.data
{ "id": 1, "wdNo": "WD20260918013251CPT5", "userId": 49, "amount": 12000, "method": "BANK",
  "account": "622202020011223340", "accountName": "王芳", "status": "PENDING", "createdAt": "..." }
```
- method 枚举:`ALIPAY / WECHAT / BANK`;账号 ≤100 字符,姓名 ≤50 字符,均必填
- 400:`realnameStatus ≠ APPROVED`「请先完成实名认证…」/ 金额非正 / 超出可用余额(附当前可用值)/ 冻结账号 403

### GET /withdraws — 列表(ADMIN 全量;AGENT/MEMBER 仅自己)
- 筛选:`status` / `keyword`(wdNo 模糊)/ `startDate` / `endDate` / `userId`(不得越过数据范围)
- `res.data.list` 项含 `user{id,name,phone,role}` 与 `transaction{txNo}`(未通过为 null)
- `res.data.pendingSum`:筛选范围内待审合计(用户侧据此展示可用余额)

### GET /withdraws/:id — 详情(本人或 ADMIN;含 user.balance/realName),他人 403
### POST /withdraws/:id/approve — ADMIN,事务内扣余额 + 写 WITHDRAW 流水 + 置 APPROVED
- 400「该申请已审核过」(并发双审只成功一次)/「申请人当前余额不足,请驳回该申请」

### POST /withdraws/:id/reject — ADMIN,`{ "reason": "必填" }` → REJECTED,不动余额
### DELETE /withdraws/:id — 撤销(申请人本人或 ADMIN,仅 PENDING),不动余额;已审核 400
