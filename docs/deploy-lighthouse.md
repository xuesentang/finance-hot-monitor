# 🔥 金融热点监控 — Lighthouse 香港节点部署指南

## 部署架构

```
用户浏览器
    │
    ├─ 前端 SPA ──→ EdgeOne Pages (免费 CDN，全球加速)
    │
    └─ API/WS ────→ Nginx :80 ──→ Express :3001
                                     │
                        Lighthouse HK ─├─→ DeepSeek API (AI 分析)
                                       ├─→ SEC EDGAR / FRED (美国)
                                       ├─→ 财联社 / 东财 / 巨潮 / NBS (大陆)
                                       └─→ Neon PostgreSQL (云数据库)
```

## 你只做 3 步

### Step 1：买服务器
腾讯云控制台 → 轻量应用服务器 → 香港地域 → 入门款（1核512MB，~36元/月），选 Ubuntu 22.04。

### Step 2：连接 CodeBuddy
在 CodeBuddy 对话框顶部 Integration 面板，登录两个服务：
- **Tencent Lighthouse** → 绑定刚买的服务器
- **EdgeOne Pages** → 授权前端部署

### Step 3：说一句话
> "帮我把后端部署到 Lighthouse，前端部署到 EdgeOne Pages"

剩下的 CodeBuddy 全自动完成：SSH → 装依赖 → 编译 → 配 Nginx → PM2 守护 → 前端发布。

---

## 代码审查修复清单（部署前已全部完成）

| # | 问题 | 严重程度 | 文件 | 状态 |
|---|------|----------|------|------|
| 1 | `app.use(cors())` 生产开放所有来源 | 🔴 | `server/src/index.ts` | ✅ |
| 2 | Socket.io CORS 开放所有来源 | 🔴 | `server/src/index.ts` | ✅ |
| 3 | 启动日志 cron 频率显示错误 | 🟡 | `server/src/index.ts` | ✅ |
| 4 | `/api/health` 不检查 DB 连通性 | 🟡 | `server/src/index.ts` | ✅ |
| 5 | AI fetch 无超时，网络卡顿永久挂起 | 🔴 | `server/src/services/ai.ts` | ✅ 30s |
| 6 | `recentlyPushed` Map 无定期清理 | 🟡 | `server/src/jobs/hotspotChecker.ts` | ✅ |
| 7 | Python venv 路径错误 | 🔴 | `scripts/deploy-hk.sh` | ✅ |
| 8 | `prisma db push --accept-data-loss` | 🟡 | Dockerfile / 部署脚本 | ✅ |
| 9 | 无 PM2 进程管理 | 🟡 | `ecosystem.config.cjs` | ✅ |
| 10 | 无 Nginx 反向代理 | 🟢 | `nginx-hk.conf` | ✅ |
| 11 | 无部署文档 | 🟢 | 本文档 | ✅ |

---

## 运维常用命令

```bash
pm2 status                              # 进程状态
pm2 logs finance-hot-monitor --lines 50 # 实时日志
pm2 restart finance-hot-monitor         # 重启
curl http://localhost:3001/api/health   # 健康检查
sudo nginx -t && sudo nginx -s reload   # 重载 Nginx
df -h && free -h                        # 磁盘 + 内存
```

## 容量建议

入门服务器（512MB RAM）需要配置 2GB swap：

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 环境变量

部署时 CodeBuddy 会从你的 `server/.env` 读取并写入服务器。关键变量：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | Neon PostgreSQL 池化连接 |
| `DIRECT_URL` | Neon 直连（migration用） |
| `DEEPSEEK_API_KEY` | DeepSeek API Key |
| `FRED_API_KEY` | FRED 宏观数据（可选） |
| `CLIENT_URL` | 前端地址，CORS 白名单（EdgeOne Pages URL） |

## 成本估算

| 项目 | 月费 |
|------|------|
| Lighthouse HK 1核512MB | ~36 元 |
| EdgeOne Pages | 0 元 |
| Neon PostgreSQL | 0 元（免费层） |
| DeepSeek API | 按量 |
| **合计（不含 API）** | **~36 元/月** |
