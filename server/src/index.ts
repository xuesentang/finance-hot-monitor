import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import cron from 'node-cron';

import { prisma } from './db.js';
import keywordsRouter from './routes/keywords.js';
import hotspotsRouter from './routes/hotspots.js';
import notificationsRouter from './routes/notifications.js';
// 搜索功能已阶段性放弃，路由入口已隔离；后续删除搜索时清理此行
// import searchRouter from './routes/search.js';
import {
  checkFastSources,
  checkAnnouncementSources,
  checkMacroSources,
  runHotspotCheck,
} from './jobs/hotspotChecker.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const socketAllowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map(s => s.trim())
  : ['http://localhost:5173'];

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (socketAllowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// 中间件
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map(s => s.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // 允许无 origin 的请求（如 curl、服务端调用）
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
}));
app.use(express.json());

// 路由
app.use('/api/keywords', keywordsRouter);
app.use('/api/hotspots', hotspotsRouter);
app.use('/api/notifications', notificationsRouter);
// 搜索功能已阶段性放弃，路由入口已隔离；后续删除搜索时清理此行
// app.use('/api/search', searchRouter);

// 代理跳转：后端代为请求目标页面，绕过目标 WAF 的跨站导航拦截
app.get('/api/goto', async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).send('Missing url parameter');
  }
  let targetUrl: URL;
  try {
    targetUrl = new URL(url);
  } catch {
    return res.status(400).send('Invalid url');
  }

  // 仅允许白名单域名，防止被用作开放代理
  const allowedHosts = ['data.stats.gov.cn', 'www.stats.gov.cn'];
  if (!allowedHosts.includes(targetUrl.hostname)) {
    return res.status(400).send('Domain not allowed');
  }

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    const contentType = resp.headers.get('content-type') || 'text/html';
    let body = await resp.text();

    // 注入 <base> 使相对路径资源正确加载
    const baseTag = `<base href="${targetUrl.origin}/">`;
    body = body.replace(/<head[^>]*>/i, (match) => match + baseTag);

    res.set('Content-Type', contentType);
    res.send(body);
  } catch (err) {
    console.error('Proxy fetch failed:', err);
    res.status(502).send('Failed to fetch target page');
  }
});

// 健康检查
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// 手动触发全源热点检查
app.post('/api/check-hotspots', async (_req, res) => {
  try {
    await runHotspotCheck(io);
    res.json({ message: 'Hotspot check completed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to run hotspot check' });
  }
});

// WebSocket 连接
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('subscribe', (keywords: string[]) => {
    keywords.forEach((kw) => socket.join(`keyword:${kw}`));
  });

  socket.on('unsubscribe', (keywords: string[]) => {
    keywords.forEach((kw) => socket.leave(`keyword:${kw}`));
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// 定时任务：按信源类型独立频率
// 快讯类（财联社 + 东财）：每 20 分钟
cron.schedule('*/20 * * * *', async () => {
  try {
    await checkFastSources(io);
  } catch (error) {
    console.error('Fast-source cron failed:', error);
  }
});

// 公告类（SEC EDGAR + 巨潮）：每 1 小时
cron.schedule('0 * * * *', async () => {
  try {
    await checkAnnouncementSources(io);
  } catch (error) {
    console.error('Announcement cron failed:', error);
  }
});

// 宏观类（FRED + NBS）：每 2 小时
cron.schedule('0 */2 * * *', async () => {
  try {
    await checkMacroSources(io);
  } catch (error) {
    console.error('Macro cron failed:', error);
  }
});

// 数据清理：每天凌晨 3 点删除 3 天前的热点和通知
const CLEANUP_RETENTION_DAYS = 3;
cron.schedule('0 3 * * *', async () => {
  const cutoff = new Date(Date.now() - CLEANUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  console.log(`🧹 Running daily cleanup (before ${cutoff.toISOString()})...`);
  try {
    // Prisma 级联删除：先删 Notification，再删 Hotspot
    const { count: notifCount } = await prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    const { count: hotspotCount } = await prisma.hotspot.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    console.log(`✅ Cleanup done: ${hotspotCount} hotspots, ${notifCount} notifications removed`);
  } catch (error) {
    console.error('❌ Daily cleanup failed:', error);
  }
});

export { io };

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`
  🔥 金融热点监控服务启动
  📡 http://0.0.0.0:${PORT}
  🔌 WebSocket ready
  ⏱  快讯: */20min | 公告: hourly | 宏观: */2h
  `);
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await prisma.$disconnect();
  process.exit(0);
});
