#!/bin/bash
# =============================================================================
# Neon PostgreSQL 环境配置验证脚本 (Unix/Linux/macOS)
# =============================================================================
# 用法: ./setup-neon-env.sh [--check] [--verbose] [--help]
#
# 功能:
#   - 检查环境变量是否设置
#   - 验证 DATABASE_URL 格式
#   - 测试数据库连接
#   - 验证数据库权限
#
# 作者: DevOps Agent
# 日期: 2026-04-03
# =============================================================================

set -euo pipefail

# 颜色定义
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# 脚本配置
VERBOSE=false
CHECK_ONLY=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# =============================================================================
# 日志函数
# =============================================================================
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

log_debug() {
    if [[ "$VERBOSE" == true ]]; then
        echo -e "${BLUE}[DEBUG]${NC} $1"
    fi
}

# =============================================================================
# 帮助信息
# =============================================================================
show_help() {
    cat << 'EOF'
Neon PostgreSQL 环境配置验证脚本

用法: ./setup-neon-env.sh [选项]

选项:
    -c, --check       仅检查，不测试连接
    -v, --verbose     显示详细输出
    -h, --help        显示此帮助信息

示例:
    ./setup-neon-env.sh              # 运行完整检查
    ./setup-neon-env.sh --check      # 仅检查环境变量
    ./setup-neon-env.sh --verbose    # 详细模式

环境变量:
    DATABASE_URL      Neon PostgreSQL 连接字符串（必需）
    PGSSLMODE         SSL 模式（可选，默认: require）

退出代码:
    0   所有检查通过
    1   环境变量未设置
    2   DATABASE_URL 格式无效
    3   数据库连接失败
    4   数据库权限不足
EOF
}

# =============================================================================
# 参数解析
# =============================================================================
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -c|--check)
                CHECK_ONLY=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# =============================================================================
# 检查依赖
# =============================================================================
check_dependencies() {
    log_info "检查依赖项..."

    local missing_deps=()

    # 检查 psql
    if ! command -v psql &> /dev/null; then
        missing_deps+=("psql (PostgreSQL client)")
    fi

    # 检查 jq (可选，用于解析)
    if ! command -v jq &> /dev/null; then
        log_warning "jq 未安装，某些功能将受限"
    fi

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "缺少必需的依赖项:"
        for dep in "${missing_deps[@]}"; do
            echo "  - $dep"
        done
        echo ""
        echo "安装命令:"
        echo "  Ubuntu/Debian: sudo apt-get install postgresql-client"
        echo "  macOS:         brew install libpq"
        echo "  CentOS/RHEL:   sudo yum install postgresql"
        exit 1
    fi

    log_success "所有依赖项已安装"
}

# =============================================================================
# 检查环境变量
# =============================================================================
check_env_vars() {
    log_info "检查环境变量..."

    # 检查 DATABASE_URL
    if [[ -z "${DATABASE_URL:-}" ]]; then
        log_error "DATABASE_URL 环境变量未设置"
        echo ""
        echo "设置方法:"
        echo "  export DATABASE_URL=\"postgresql://user:pass@host/db?sslmode=require\""
        echo ""
        echo "或者创建 .env 文件:"
        echo "  echo DATABASE_URL=\"your-connection-string\" > backend/.env"
        return 1
    fi

    log_success "DATABASE_URL 已设置"
    # SECURITY: 不记录 URL 长度或任何元数据

    return 0
}

# =============================================================================
# 解析 DATABASE_URL
# =============================================================================
parse_database_url() {
    local url="$1"

    # URL 格式: postgresql://user:password@host:port/database?sslmode=require

    # 提取协议
    if [[ ! "$url" =~ ^postgresql:// ]]; then
        log_error "DATABASE_URL 必须以 'postgresql://' 开头"
        return 1
    fi

    # 移除协议前缀
    local without_protocol="${url#postgresql://}"

    # 提取凭据部分（用户:密码）
    local credentials=""
    local host_part=""

    if [[ "$without_protocol" =~ @ ]]; then
        credentials="${without_protocol%%@*}"
        host_part="${without_protocol#*@}"
    else
        log_error "DATABASE_URL 格式无效: 缺少 '@' 分隔符"
        return 1
    fi

    # 解析用户名和密码
    local username=""
    local password=""

    if [[ "$credentials" =~ : ]]; then
        username="${credentials%%:*}"
        password="${credentials#*:}"
    else
        username="$credentials"
        log_warning "DATABASE_URL 中没有密码"
    fi

    # 提取主机和数据库
    local host_with_port="${host_part%%/*}"
    local database_with_params="${host_part#*/}"

    # 分离数据库名和参数
    local database="${database_with_params%%\?*}"
    local params=""

    if [[ "$database_with_params" =~ \? ]]; then
        params="${database_with_params#*\?}"
    fi

    # 分离主机和端口
    local host=""
    local port="5432"  # 默认端口

    if [[ "$host_with_port" =~ : ]]; then
        host="${host_with_port%%:*}"
        port="${host_with_port#*:}"
    else
        host="$host_with_port"
    fi

    # 输出解析结果（隐藏敏感信息）
    log_debug "解析结果:"
    log_debug "  用户名: $username"
    # SECURITY: 不显示密码长度或任何密码元数据
    log_debug "  密码: [HIDDEN]"
    # SECURITY: 不显示主机地址
    log_debug "  主机: [HIDDEN]"
    log_debug "  端口: $port"
    log_debug "  数据库: [HIDDEN]"
    log_debug "  参数: $params"

    # 验证字段
    if [[ -z "$username" ]]; then
        log_error "DATABASE_URL 中缺少用户名"
        return 1
    fi

    if [[ -z "$password" ]]; then
        log_warning "DATABASE_URL 中缺少密码"
    fi

    if [[ -z "$host" ]]; then
        log_error "DATABASE_URL 中缺少主机名"
        return 1
    fi

    if [[ -z "$database" ]]; then
        log_error "DATABASE_URL 中缺少数据库名"
        return 1
    fi

    # 验证 SSL 参数
    if [[ ! "$params" =~ sslmode=require ]]; then
        log_warning "建议启用 SSL: 在 URL 中添加 '?sslmode=require'"
    else
        log_success "SSL 模式已启用"
    fi

    # 导出解析的变量
    DB_USERNAME="$username"
    DB_PASSWORD="$password"
    DB_HOST="$host"
    DB_PORT="$port"
    DB_NAME="$database"
    DB_PARAMS="$params"

    return 0
}

# =============================================================================
# 验证 DATABASE_URL 格式
# =============================================================================
validate_database_url() {
    log_info "验证 DATABASE_URL 格式..."

    if ! parse_database_url "$DATABASE_URL"; then
        return 2
    fi

    log_success "DATABASE_URL 格式有效"
    return 0
}

# =============================================================================
# 测试数据库连接
# =============================================================================
test_connection() {
    log_info "测试数据库连接..."

    # 构建连接字符串（隐藏密码和主机）
    local masked_url="postgresql://${DB_USERNAME}:****@****:${DB_PORT}/${DB_NAME}"
    log_debug "连接字符串: $masked_url"

    # 测试连接
    local start_time end_time duration
    start_time=$(date +%s%N)

    if ! psql "$DATABASE_URL" -c "SELECT version();" > /dev/null 2>&1; then
        log_error "数据库连接失败"
        echo ""
        echo "排查建议:"
        echo "  1. 检查网络连接"
        echo "  2. 验证凭据是否正确"
        echo "  3. 确认 Neon 项目状态: https://console.neon.tech"
        echo "  4. 检查防火墙设置"
        return 3
    fi

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))  # 转换为毫秒

    log_success "数据库连接成功 (耗时: ${duration}ms)"

    # 获取数据库版本
    local version
    version=$(psql "$DATABASE_URL" -t -c "SELECT version();" 2>/dev/null | head -1 | xargs)
    log_info "PostgreSQL 版本: $version"

    return 0
}

# =============================================================================
# 验证数据库权限
# =============================================================================
check_permissions() {
    log_info "验证数据库权限..."

    local errors=0

    # 测试 SELECT 权限
    if psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
        log_success "SELECT 权限正常"
    else
        log_error "SELECT 权限不足"
        ((errors++))
    fi

    # 测试 CREATE TABLE 权限
    local test_table="test_permissions_$(date +%s)"
    if psql "$DATABASE_URL" -c "CREATE TABLE IF NOT EXISTS ${test_table} (id INT); DROP TABLE IF EXISTS ${test_table};" > /dev/null 2>&1; then
        log_success "CREATE TABLE 权限正常"
    else
        log_error "CREATE TABLE 权限不足"
        ((errors++))
    fi

    # 获取当前用户
    local current_user
    current_user=$(psql "$DATABASE_URL" -t -c "SELECT current_user;" 2>/dev/null | xargs)
    log_info "当前数据库用户: $current_user"

    if [[ $errors -gt 0 ]]; then
        log_error "$errors 项权限检查失败"
        echo ""
        echo "解决方案:"
        echo "  1. 在 Neon SQL Editor 中执行:"
        echo "     GRANT ALL PRIVILEGES ON SCHEMA public TO $current_user;"
        echo "  2. 或者使用更高权限的用户"
        return 4
    fi

    return 0
}

# =============================================================================
# 检查数据库表
# =============================================================================
check_tables() {
    log_info "检查数据库表..."

    local tables
    tables=$(psql "$DATABASE_URL" -t -c "
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name;
    " 2>/dev/null | xargs)

    if [[ -z "$tables" ]]; then
        log_warning "数据库中没有表"
        echo ""
        echo "建议执行初始化脚本:"
        echo "  psql \"\$DATABASE_URL\" -f backend/db/neon_setup.sql"
    else
        log_success "发现以下表:"
        for table in $tables; do
            echo "  - $table"
        done
    fi
}

# =============================================================================
# 主函数
# =============================================================================
main() {
    echo "============================================================================="
    echo "  Neon PostgreSQL 环境配置验证"
    echo "============================================================================="
    echo ""

    parse_args "$@"

    # 检查依赖
    check_dependencies
    echo ""

    # 检查环境变量
    if ! check_env_vars; then
        exit 1
    fi
    echo ""

    # 验证 URL 格式
    if ! validate_database_url; then
        exit 2
    fi
    echo ""

    # 如果仅检查模式，到此结束
    if [[ "$CHECK_ONLY" == true ]]; then
        log_info "检查模式完成，跳过连接测试"
        exit 0
    fi

    # 测试连接
    if ! test_connection; then
        exit 3
    fi
    echo ""

    # 验证权限
    if ! check_permissions; then
        exit 4
    fi
    echo ""

    # 检查表
    check_tables
    echo ""

    # 完成
    echo "============================================================================="
    log_success "所有检查通过！数据库配置正确"
    echo "============================================================================="

    return 0
}

# 运行主函数
main "$@"
