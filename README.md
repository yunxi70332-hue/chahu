# 数码报单系统

大富通讯二手数码回收生意的线上报单台。v2.4 起为**中介模式**：上游报价采集 → 按品类计价规则下浮 → 代理报单结算，差价即系统利润。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3 + TypeScript + Element Plus + Pinia + Vite |
| 后端 | Node.js (ESM) + Express 4 + Prisma 6 |
| 数据库 | SQLite（`prisma db push` 同步结构，无 migrations 目录） |

## 目录结构

```
backend/            Express API 服务
  prisma/           schema.prisma / seed.js / products.json（种子报价数据）
  scripts/          一次性数据脚本
  src/
    index.js        应用入口（同时托管 frontend/dist）
    routes/         业务路由：auth / dashboard / orders / products / users / transactions / settings / realname
    middleware/     鉴权与角色校验
    util.js         通用工具与计价函数（computeAgentPrice 等）
frontend/           Vue 3 SPA
  src/
    api/            axios 封装与各模块接口
    views/          页面：login / dashboard / orders / products / users / transactions / realname
    layouts/        AdminLayout
  dist/             构建产物（服务器直接托管，需随仓库更新）
docs/               产品需求、API 契约、部署计划与更新记录
scripts/            运维脚本（SQLite 每日备份）
qa-screenshots/     验收截图与 Playwright 验证脚本
```

## 本地开发

```bash
# 1. 后端
cd backend
cp .env.example .env          # 按需修改 DATABASE_URL / JWT_SECRET / IMPORT_KEY
npm install
npx prisma db push            # 同步数据库结构
npm run seed                  # 可选:写入种子数据(会清空现有数据)
npm run dev                   # 启动 API,默认 http://localhost:3001

# 2. 前端(另开终端)
cd frontend
npm install
npm run dev                   # 启动 dev server,/api 代理到 localhost:3001
```

## 构建与部署

```bash
# 前端构建产物由后端托管,改前端后必须重新构建
cd frontend && npm run build   # 输出到 frontend/dist
```

生产环境为宝塔面板 Node 项目（`/www/baodan`），更新流程见 [`docs/上线部署计划-v1.md`](docs/上线部署计划-v1.md)。

## 核心业务规则

**品类计价（v2.5 起支持两种方式，可在「品类计价设置」中按品类二选一）**

- 下浮比例：`代理收购价 = 上游报价 × (1 − 下浮%/100)`
- 减固定金额：`代理收购价 = 上游报价 − 固定金额（元）`

未配置的品类按下浮 0 处理（代理价 = 上游价）；计价结果 ≤0 的产品自动下架，避免免费/负价收购。
规则存于 `Setting` key `markdown_rules`，旧 key `markdown_rates` 保留兼容，存量数据无需迁移。

**权限与敏感数据**

- 上游报价与差价利润仅总部（ADMIN）可见，代理/会员的接口响应中物理不下发。
- 登录态 JWT 有效期 12h；登录失败 5 次锁定 10 分钟。

**订单利润**

建单时快照 `upstreamPrice`，利润 = `(上游价 − 结算价) × 数量`。议价高于上游价时利润为负，不拦截提交，由总部审核把关。

## 报价更新双通道

- **通道 A（脚本自动）**：kdocs 清洗完成 → POST `/api/products/import`（`X-Import-Key` 鉴权）→ 产品库即日更。
- **通道 B（人工上传）**：产品管理 → 导入报价表（管理员 JWT 鉴权），作为兜底与回滚手段。

两条通道共用同一导入核心，计价规则与统计口径完全一致。导入为**整批替换**产品库。

## 文档索引

| 文档 | 说明 |
| --- | --- |
| [更新记录](docs/更新记录.md) | 各版本功能变更、影响范围与验收结果 |
| [产品需求 PRD](docs/数码报单后台管理系统-PRD.md) | 需求、数据模型、权限与验收记录 |
| [API 契约](docs/API契约-v2.1.md) | 全部端点请求/响应示例与枚举定义 |
| [上线部署计划](docs/上线部署计划-v1.md) | 服务器信息与部署 Runbook |

## 安全约定

- `backend/.env` 含真实密钥，**已被 `.gitignore` 排除，切勿提交**；新增环境变量请同步更新 `backend/.env.example`。
- 生产环境 JWT 密钥使用 48 字节强随机值，更换后所有登录态失效属预期。
