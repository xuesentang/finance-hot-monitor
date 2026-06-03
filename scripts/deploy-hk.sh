#!/bin/bash
# ============================================================
# 金融热点监控 — 腾讯云 Lighthouse 香港节点一键部署
# 使用：chmod +x deploy-hk.sh && ./deploy-hk.sh
# ============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN} 金融热点监控 — 生产环境初始化${NC}"
echo -e "${GREEN}=========================================${NC}"

PROJECT_ROOT="/opt/finance-monitor"

# ---- 1. 系统依赖 ----
echo ""
echo -e "${YELLOW}[1/7] 安装系统依赖...${NC}"
sudo apt-get update -qq
sudo apt-get install -y -qq \
    curl git nginx build-essential \
    python3.11 python3.11-venv python3-pip

# ---- 2. Node.js 20 ----
echo ""
echo -e "${YELLOW}[2/7] 配置 Node.js 20...${NC}"
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y -qq nodejs
fi
echo "  Node.js $(node -v), npm $(npm -v)"

# ---- 3. PM2 ----
echo ""
echo -e "${YELLOW}[3/7] 安装 PM2...${NC}"
npm install -g pm2

# ---- 4. 创建目录 & 克隆 ----
echo ""
echo -e "${YELLOW}[4/7] 准备项目目录...${NC}"
sudo mkdir -p "$PROJECT_ROOT"
sudo chown "$USER:$USER" "$PROJECT_ROOT"

if [ ! -d "$PROJECT_ROOT/.git" ]; then
    echo "  请手动将代码拷贝到 $PROJECT_ROOT 或执行 git clone"
    echo "  git clone <repo-url> $PROJECT_ROOT"
    exit 1
fi

cd "$PROJECT_ROOT"
mkdir -p logs data

# ---- 5. Python 虚拟环境（必须建在项目根目录，collector.ts 相对路径查找）----
echo ""
echo -e "${YELLOW}[5/7] 创建 Python 虚拟环境...${NC}"
if [ ! -d "$PROJECT_ROOT/fhot-venv" ]; then
    python3.11 -m venv ./fhot-venv
fi
./fhot-venv/bin/pip install --no-cache-dir \
    requests>=2.34.0 \
    urllib3>=2.7.0
echo "  ✅ $(./fhot-venv/bin/python --version)"

# ---- 6. Node 依赖 + 编译 ----
echo ""
echo -e "${YELLOW}[6/7] 安装依赖 & 编译 TypeScript...${NC}"
cd "$PROJECT_ROOT/server"

# 安装全部依赖（含 devDependencies 用于 tsc 编译）
npm ci

# 生成 Prisma Client + 同步数据库 schema
echo "  同步数据库 schema..."
npx prisma generate
npx prisma db push   # 生产慎用 --accept-data-loss，手动确认 schema 变更

# 编译 TypeScript
npx tsc
echo "  ✅ TypeScript 编译完成 → server/dist/"

# ---- 7. PM2 启动 ----
echo ""
echo -e "${YELLOW}[7/7] 启动 PM2 服务...${NC}"
cd "$PROJECT_ROOT"

# 停止旧进程（如存在）
pm2 delete finance-hot-monitor 2>/dev/null || true

pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u "$(whoami)" --hp "$HOME" 2>/dev/null || true

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN} ✅ 部署完成！验证步骤：${NC}"
echo ""
echo "  1. pm2 status              # 查看进程状态"
echo "  2. curl http://localhost:3001/api/health  # 健康检查"
echo "  3. pm2 logs finance-hot-monitor --lines 20  # 查看日志"
echo ""
echo -e "${GREEN}=========================================${NC}"
