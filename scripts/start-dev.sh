#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# EVA 本地开发启动脚本
# ─────────────────────────────────────────────────────────────────────────────
# 一条命令同时启动 API + Web，并自动处理：
#   - 清理可能占用的端口（3000, 3001）
#   - 自动跑 build:core（packages/core dist 缺失时）
#   - 后台启动 api + web，日志写到 /tmp/eva-{api,web}.log
#   - 健康检查（API 健康后输出"✅ Ready"）
#
# 用法：
#   ./scripts/start-dev.sh              # 启动 API + Web
#   ./scripts/start-dev.sh --with-mock  # 启用 LOCAL_MOCK_LLM（无需真实 LLM）
#   ./scripts/start-dev.sh --stop       # 停止所有 eva dev 进程
#   ./scripts/start-dev.sh --logs       # 查看实时日志
# ─────────────────────────────────────────────────────────────────────────────

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_PORT="${API_PORT:-3001}"
WEB_PORT="${WEB_PORT:-3000}"

stop_all() {
  echo "🛑 停止所有 EVA dev 进程..."
  pkill -f "nest start" 2>/dev/null || true
  pkill -f "next dev" 2>/dev/null || true
  sleep 1
  echo "✅ 已停止"
  exit 0
}

show_logs() {
  echo "📺 实时日志（Ctrl+C 退出）"
  tail -f /tmp/eva-api.log /tmp/eva-web.log 2>/dev/null
  exit 0
}

with_mock=""
if [ "${1:-}" = "--stop" ]; then stop_all; fi
if [ "${1:-}" = "--logs" ]; then show_logs; fi
if [ "${1:-}" = "--with-mock" ] || [ "${2:-}" = "--with-mock" ]; then
  with_mock="1"
fi

# ── 1. 清理占用端口的进程 ────────────────────────────────────────────────────
echo "🧹 清理 3000/3001 端口的旧进程..."
for port in "$WEB_PORT" "$API_PORT"; do
  PIDS=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "  port $port: 杀掉 PID=$PIDS"
    kill -9 $PIDS 2>/dev/null || true
  fi
done
sleep 1

# ── 2. 确保 core dist 已生成（api 依赖 @eva/core）─────────────────────
if [ ! -d "packages/core/dist" ]; then
  echo "📦 生成 packages/core/dist..."
  bun run build:core
fi

# ── 2.5 启动本地 PostgreSQL（如未运行） ──────────────────────────────────────
echo "🐘 检查 PostgreSQL (5432)..."
if ! pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
  echo "  PostgreSQL 未启动，尝试自动启动..."
  if command -v pg_ctl > /dev/null && [ -d "/opt/homebrew/var/postgresql@16" ]; then
    pg_ctl -D /opt/homebrew/var/postgresql@16 start 2>&1 | tail -3
    sleep 2
  elif command -v brew > /dev/null && brew list postgresql@16 > /dev/null 2>&1; then
    brew services start postgresql@16 2>&1 | tail -3
    sleep 2
  fi
fi

if pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
  echo "  ✅ PostgreSQL OK"
  # 自动补齐数据库（如 eva_test 不存在）
  if ! psql -h localhost -U "$(whoami)" -l 2>/dev/null | grep -q eva_test; then
    echo "  📦 创建 eva_test 数据库..."
    createdb -h localhost -U "$(whoami)" eva_test 2>&1 | tail -3 || true
  fi
  # The ledger runner owns ordering, checksums, and the transaction that also
  # records application. Do not bypass it with raw psql -f loops.
  if [ -d "packages/database/src/migrations" ]; then
    echo "  📦 应用受账本保护的数据库迁移..."
    DATABASE_URL="postgresql://$(whoami)@localhost:5432/eva_test" \
      node scripts/apply-db-migrations.mjs
  fi
else
  echo "  ⚠️  PostgreSQL 仍未启动（如使用 Neon 云 DB 可忽略此警告）"
fi

# ── 3. 启动 API ────────────────────────────────────────────────────────────
echo "🔧 启动 API (port $API_PORT)..."
if [ -n "$with_mock" ]; then
  echo "  with EVA_LOCAL_MOCK_LLM=1"
  (cd apps/api && EVA_LOCAL_MOCK_LLM=1 PORT=$API_PORT bun run dev) \
    > /tmp/eva-api.log 2>&1 &
else
  (cd apps/api && PORT=$API_PORT bun run dev) \
    > /tmp/eva-api.log 2>&1 &
fi
API_PID=$!
echo "  API_PID=$API_PID"

# ── 4. 启动 Web ────────────────────────────────────────────────────────────
echo "🌐 启动 Web (port $WEB_PORT)..."
(cd apps/web && bunx next dev -p $WEB_PORT) \
  > /tmp/eva-web.log 2>&1 &
WEB_PID=$!
echo "  WEB_PID=$WEB_PID"

# ── 5. 健康检查 ────────────────────────────────────────────────────────────
echo "⏳ 等待 API 健康..."
for i in 1 2 3 4 5 6 7 8 9 10 12 14 16 18 20; do
  sleep 1
  API_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$API_PORT/auth/me" 2>/dev/null || echo "000")
  WEB_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$WEB_PORT/" 2>/dev/null || echo "000")
  if [ "$API_CODE" != "000" ] && [ "$WEB_CODE" != "000" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ Ready!"
    echo "   Web:    http://localhost:$WEB_PORT"
    echo "   API:    http://localhost:$API_PORT"
    echo "   Login:  http://localhost:$WEB_PORT/login"
    echo "   Profile:http://localhost:$WEB_PORT/profile"
    echo ""
    echo "   日志:   tail -f /tmp/eva-api.log /tmp/eva-web.log"
    echo "   停止:   ./scripts/start-dev.sh --stop"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
  fi
  echo "  [$i] api=$API_CODE web=$WEB_CODE"
done

echo ""
echo "❌ 启动失败，查看日志："
echo "   tail -f /tmp/eva-api.log"
echo "   tail -f /tmp/eva-web.log"
exit 1
