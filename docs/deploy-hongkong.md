# 🔥 金融热点监控 — 腾讯云香港节点部署指南

## 为什么选香港节点？

你的项目需要同时访问 **美国网站**（SEC EDGAR、FRED、DeepSeek API）和 **大陆网站**（巨潮资讯、财联社、东财全球、国家统计局）。香港节点是天然的中转枢纽：
- 🇺🇸 对美访问：直连低延迟，无墙
- 🇨🇳 对大陆访问：CN2 线路，巨潮/财联社/东财/统计局均可正常访问

---

## 硬件要求

| 配置 | 最低 | 推荐 |
|------|------|------|
| CPU | 1 核 | 2 核 |
| 内存 | 512 MB | 1 GB |
| 硬盘 | 10 GB | 20 GB |
| 系统 | Ubuntu 22.04 | Ubuntu 22.04 |
| 带宽 | 1 Mbps | 3 Mbps+ |

> ⚠️ **入门服务器注意事项**：Python 采集脚本启动时有瞬时内存峰值（约 150MB），加上 Node.js 常驻 ~150MB，总共约 300MB。512MB 内存刚好够用，但建议启用 1GB swap。

---

## 部署前准备

### 1. 腾讯云安全组配置

在腾讯云控制台 → 云服务器 → 安全组，放行以下端口：

| 端口 | 协议 | 说明 |
|------|------|------|
| 22 | TCP | SSH 管理 |
| 80 | TCP | HTTP（Nginx） |
| 443 | TCP | HTTPS（如配置 SSL） |
| 3001 | TCP | **不要开放！** 仅本地 127.0.0.1 访问 |

### 2. 配置环境变量

```bash
# SSH 到服务器后，创建环境变量文件
sudo mkdir -p /opt/finance-monitor
sudo chown $USER:$USER /opt/finance-monitor
cd /opt/finance-monitor

# 拉取代码
git clone https://github.com/your-username/finance-hot-monitor.git .
```

创建 `/opt/finance-monitor/server/.env`：

```env
# ── 数据库（Neon PostgreSQL）───────────────────────────────
DATABASE_URL="postgresql://user:pass@ep-xxxx-pooler.us-east-2.aws.neon.tech/finance_hot_monitor?sslmode=require"
DIRECT_URL="postgresql://user:pass@ep-xxxx.us-east-2.aws.neon.tech/finance_hot_monitor?sslmode=require"

# ── AI API Key ────────────────────────────────────────────
DEEPSEEK_API_KEY="sk-your-deepseek-api-key-here"

# ── FRED API Key（可选，不配置则跳过 FRED 采集）─────────────
FRED_API_KEY="your-fred-api-key-here"

# ── 前端地址（CORS 白名单）─────────────────────────────────
# 支持多个地址，逗号分隔
# 例如：https://your-frontend.vercel.app,http://localhost:5173
CLIENT_URL="http://localhost:5173"

# ── 服务端口 ───────────────────────────────────────────────
PORT=3001
```

---

## 一键部署

```bash
cd /opt/finance-monitor
chmod +x scripts/deploy-hk.sh
./scripts/deploy-hk.sh
```

该脚本会自动完成：
1. 安装系统依赖（Python 3.11、Nginx、build-essential）
2. 安装 Node.js 20
3. 安装 PM2
4. 创建 Python 虚拟环境
5. 安装 Node 依赖 + 编译 TypeScript
6. 启动 PM2 + 配置开机自启

---

## 手动部署步骤

如果一键脚本失败，按以下步骤操作：

### Step 1: 系统依赖

```bash
sudo apt update
sudo apt install -y curl git nginx python3.11 python3.11-venv python3-pip build-essential
```

### Step 2: Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Step 3: Python 虚拟环境

```bash
python3.11 -m venv /opt/fhot-venv
/opt/fhot-venv/bin/pip install requests==2.34.0 urllib3==2.7.0
```

### Step 4: 项目构建

```bash
cd /opt/finance-monitor/server
npm ci
npx prisma generate
npx tsc
```

### Step 5: PM2 启动

```bash
npm install -g pm2
pm2 start /opt/finance-monitor/ecosystem.config.cjs
pm2 save
pm2 startup  # 按提示执行输出的命令
```

### Step 6: Nginx 配置

```bash
sudo cp /opt/finance-monitor/nginx-hk.conf /etc/nginx/sites-available/finance-monitor
sudo ln -s /etc/nginx/sites-available/finance-monitor /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default  # 移除默认站点
sudo nginx -t
sudo systemctl reload nginx
```

---

## 验证部署

```bash
# 检查 PM2 状态
pm2 status

# 健康检查 API
curl http://localhost:3001/api/health

# 查看日志
pm2 logs finance-hot-monitor --lines 50

# 查看 Nginx 访问日志
sudo tail -f /var/log/nginx/finance-monitor-access.log
```

---

## 运维常用命令

```bash
# 重启服务
pm2 restart finance-hot-monitor

# 查看实时日志
pm2 logs finance-hot-monitor

# 查看资源占用
pm2 monit

# 重载 Nginx
sudo nginx -t && sudo nginx -s reload

# 查看磁盘使用
df -h

# 查看内存使用
free -h
```

---

## 监控告警建议

### 配置 swap（入门服务器必备）

```bash
# 创建 2GB swap 文件
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 持久化
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 日志轮转（防止磁盘满）

创建 `/etc/logrotate.d/finance-monitor`：

```
/opt/finance-monitor/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

---

## 代码审查修复汇总

部署前已修复以下问题：

| # | 问题 | 严重程度 | 状态 |
|---|------|----------|------|
| 1 | `app.use(cors())` 生产环境开放所有来源 | 🔴 严重 | ✅ 已修复 |
| 2 | Socket.io CORS 同样开放所有来源 | 🔴 严重 | ✅ 已修复 |
| 3 | 启动日志 cron 频率显示错误 | 🟡 中等 | ✅ 已修复 |
| 4 | `/api/health` 不检查 DB 连通性 | 🟡 中等 | ✅ 已修复 |
| 5 | `recentlyPushed` Map 无定期清理，有内存泄漏风险 | 🟡 中等 | ✅ 已修复 |
| 6 | 无 PM2/systemd 进程管理 | 🟡 中等 | ✅ 已添加 |
| 7 | 无 Nginx 反向代理配置 | 🟢 建议 | ✅ 已添加 |
| 8 | 无部署文档 | 🟢 建议 | ✅ 已添加 |

### 未修改但需注意的事项

| 项目 | 说明 |
|------|------|
| **Dockerfile `prisma db push --accept-data-loss`** | 生产慎用，建议改为 `prisma migrate deploy` |
| **DeepSeek API 超时** | `ai.ts` 中 `fetch()` 没有设置 `AbortController` 超时，网络不稳定时可能永久挂起（建议加上 30s 超时） |
| **Python 采集 60s 超时** | `collector.ts` 设置了 60s，香港连大陆网站有时延迟较高，60s 基本够用，但需留意 |
| **Neon DB 延迟** | Neon 实例在 us-east-2，香港到美东延迟 ~200ms，每次 DB 查询有额外开销，建议监控查询耗时 |
| **前端部署** | 当前前端是 SPA（Vite + React），需要有地方托管（Vercel / 同服务器 Nginx / CDN）。Nginx 配置中已预留静态文件托管配置 |
| **NBS 证书问题** | `nbs.py` 中 `verify=False` 是关闭 SSL 验证，因为 NBS 证书链不完整。香港节点访问 NBS 同样需要此设置 |
| **财联社/东财 全量拉取** | 这两个快讯源每次会拉取最新 50 条全量数据，不走关键词筛选，对带宽有轻微消耗 |
