import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import orderRoutes from './routes/orders.js';
import productRoutes from './routes/products.js';
import userRoutes from './routes/users.js';
import transactionRoutes from './routes/transactions.js';
import settingsRoutes from './routes/settings.js';
import realnameRoutes from './routes/realname.js';

const app = express();
// 同源部署:Express 托管前端 dist,浏览器请求全部同源,不开放跨域
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/realname', realnameRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// 生产模式:托管前端构建产物(frontend/dist),SPA history 路由回退到 index.html
const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(distDir, 'index.html')));
}

// 全局错误处理
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  if (err.code === 'P2025') {
    return res.status(404).json({ code: 404, message: '数据不存在' });
  }
  res.status(500).json({ code: 500, message: err.message || '服务器内部错误' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`[baodan] API server running at http://localhost:${port}`);
});
