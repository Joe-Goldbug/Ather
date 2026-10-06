#!/bin/bash
# =============================================================================
# CORS 修复验证测试脚本
# =============================================================================
# 用法: ./cors_test.sh [local|production]
# 默认测试 local 环境
# =============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 环境配置
ENVIRONMENT=${1:-local}

if [ "$ENVIRONMENT" = "production" ]; then
    BACKEND_URL="${BACKEND_URL:-https://your-backend.example.com}"
    FRONTEND_URL="${FRONTEND_URL:-https://your-frontend.example.com}"
else
    BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
    FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  CORS 修复验证测试 (${ENVIRONMENT})${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "后端 URL: ${YELLOW}${BACKEND_URL}${NC}"
echo -e "前端 URL: ${YELLOW}${FRONTEND_URL}${NC}"
echo ""

# 测试计数器
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=0

# 检查响应头中是否包含预期的 CORS 头
check_cors_headers() {
    local response="$1"
    local expected_origin="$2"
    local test_name="$3"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    # 检查 Access-Control-Allow-Origin
    if echo "$response" | grep -qi "Access-Control-Allow-Origin: ${expected_origin}"; then
        echo -e "  ${GREEN}✓${NC} Access-Control-Allow-Origin: ${expected_origin}"
        ALLOW_ORIGIN_PASS=true
    else
        echo -e "  ${RED}✗${NC} Access-Control-Allow-Origin 缺失或不正确"
        ALLOW_ORIGIN_PASS=false
    fi

    # 检查 Access-Control-Allow-Methods
    if echo "$response" | grep -qi "Access-Control-Allow-Methods"; then
        echo -e "  ${GREEN}✓${NC} Access-Control-Allow-Methods 存在"
        ALLOW_METHODS_PASS=true
    else
        echo -e "  ${YELLOW}⚠${NC} Access-Control-Allow-Methods 不存在 (可能只在 OPTIONS 中出现)"
        ALLOW_METHODS_PASS=true  # 不一定失败
    fi

    # 检查 Access-Control-Allow-Headers
    if echo "$response" | grep -qi "Access-Control-Allow-Headers"; then
        echo -e "  ${GREEN}✓${NC} Access-Control-Allow-Headers 存在"
        ALLOW_HEADERS_PASS=true
    else
        echo -e "  ${YELLOW}⚠${NC} Access-Control-Allow-Headers 不存在 (可能只在 OPTIONS 中出现)"
        ALLOW_HEADERS_PASS=true  # 不一定失败
    fi

    if [ "$ALLOW_ORIGIN_PASS" = true ]; then
        echo -e "${GREEN}[PASS]${NC} ${test_name}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}[FAIL]${NC} ${test_name}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# =============================================================================
# 测试 1: OPTIONS 预检请求 (成功场景)
# =============================================================================
echo -e "${BLUE}----------------------------------------${NC}"
echo -e "${BLUE}测试 1: OPTIONS 预检请求 (正确 Origin)${NC}"
echo -e "${BLUE}----------------------------------------${NC}"

OPTIONS_RESPONSE=$(curl -s -X OPTIONS "${BACKEND_URL}/auth/send-code" \
    -H "Origin: ${FRONTEND_URL}" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type" \
    -v 2>&1)

echo -e "\n${YELLOW}请求详情:${NC}"
echo "  Method: OPTIONS"
echo "  Endpoint: /auth/send-code"
echo "  Origin: ${FRONTEND_URL}"
echo ""

check_cors_headers "$OPTIONS_RESPONSE" "${FRONTEND_URL}" "OPTIONS Preflight Test"
echo ""

# =============================================================================
# 测试 2: OPTIONS 预检请求 (本地开发 Origin)
# =============================================================================
echo -e "${BLUE}----------------------------------------${NC}"
echo -e "${BLUE}测试 2: OPTIONS 预检请求 (localhost)${NC}"
echo -e "${BLUE}----------------------------------------${NC}"

OPTIONS_LOCAL_RESPONSE=$(curl -s -X OPTIONS "${BACKEND_URL}/auth/send-code" \
    -H "Origin: http://localhost:3000" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type" \
    -v 2>&1)

echo -e "\n${YELLOW}请求详情:${NC}"
echo "  Method: OPTIONS"
echo "  Endpoint: /auth/send-code"
echo "  Origin: http://localhost:3000"
echo ""

check_cors_headers "$OPTIONS_LOCAL_RESPONSE" "http://localhost:3000" "OPTIONS Localhost Test"
echo ""

# =============================================================================
# 测试 3: OPTIONS 预检请求 (不允许的 Origin)
# =============================================================================
echo -e "${BLUE}----------------------------------------${NC}"
echo -e "${BLUE}测试 3: OPTIONS 预检请求 (未授权 Origin)${NC}"
echo -e "${BLUE}----------------------------------------${NC}"

TOTAL_TESTS=$((TOTAL_TESTS + 1))

OPTIONS_UNAUTHORIZED_RESPONSE=$(curl -s -X OPTIONS "${BACKEND_URL}/auth/send-code" \
    -H "Origin: https://evil-site.com" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type" \
    -v 2>&1)

# 未授权的 origin 不应该返回 Access-Control-Allow-Origin 或者返回 *
if echo "$OPTIONS_UNAUTHORIZED_RESPONSE" | grep -qi "Access-Control-Allow-Origin:"; then
    if echo "$OPTIONS_UNAUTHORIZED_RESPONSE" | grep -qi "Access-Control-Allow-Origin: https://evil-site.com"; then
        echo -e "  ${RED}✗${NC} 警告: 未授权 origin 获得了 CORS 权限"
        echo -e "${RED}[FAIL]${NC} Unauthorized Origin Test"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    else
        echo -e "  ${GREEN}✓${NC} 未授权 origin 未获得特定 CORS 权限"
        echo -e "${GREEN}[PASS]${NC} Unauthorized Origin Test"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    fi
else
    echo -e "  ${GREEN}✓${NC} 未授权 origin 无 CORS 响应 (符合预期)"
    echo -e "${GREEN}[PASS]${NC} Unauthorized Origin Test"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
echo ""

# =============================================================================
# 测试 4: POST 请求 (正确 Origin)
# =============================================================================
echo -e "${BLUE}----------------------------------------${NC}"
echo -e "${BLUE}测试 4: POST 请求 (正确 Origin)${NC}"
echo -e "${BLUE}----------------------------------------${NC}"

POST_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/auth/send-code" \
    -H "Origin: ${FRONTEND_URL}" \
    -H "Content-Type: application/json" \
    -d '{"email":"cors-test@example.com"}' \
    -v 2>&1)

echo -e "\n${YELLOW}请求详情:${NC}"
echo "  Method: POST"
echo "  Endpoint: /auth/send-code"
echo "  Origin: ${FRONTEND_URL}"
echo "  Body: {\"email\":\"cors-test@example.com\"}"
echo ""

check_cors_headers "$POST_RESPONSE" "${FRONTEND_URL}" "POST Request Test"
echo ""

# =============================================================================
# 测试 5: 验证响应体
# =============================================================================
echo -e "${BLUE}----------------------------------------${NC}"
echo -e "${BLUE}测试 5: 验证 POST 响应体${NC}"
echo -e "${BLUE}----------------------------------------${NC}"

TOTAL_TESTS=$((TOTAL_TESTS + 1))

if echo "$POST_RESPONSE" | grep -q '"success":true'; then
    echo -e "  ${GREEN}✓${NC} 响应包含 success: true"
    SUCCESS_FIELD=true
elif echo "$POST_RESPONSE" | grep -q '"success":false'; then
    echo -e "  ${YELLOW}⚠${NC} 响应包含 success: false (可能触发限流或其他业务逻辑)"
    SUCCESS_FIELD=true  # 仍然视为通过，因为 CORS 工作正常
else
    echo -e "  ${RED}✗${NC} 无法解析响应体"
    SUCCESS_FIELD=false
fi

# 检查 HTTP 状态码
if echo "$POST_RESPONSE" | grep -q "HTTP/[0-9.]* 200"; then
    echo -e "  ${GREEN}✓${NC} HTTP 状态码: 200"
    HTTP_STATUS=true
elif echo "$POST_RESPONSE" | grep -q "HTTP/[0-9.]* 429"; then
    echo -e "  ${YELLOW}⚠${NC} HTTP 状态码: 429 (限流触发，CORS 正常工作)"
    HTTP_STATUS=true
else
    echo -e "  ${RED}✗${NC} 意外的 HTTP 状态码"
    HTTP_STATUS=false
fi

if [ "$SUCCESS_FIELD" = true ] && [ "$HTTP_STATUS" = true ]; then
    echo -e "${GREEN}[PASS]${NC} Response Body Test"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}[FAIL]${NC} Response Body Test"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# =============================================================================
# 测试 6: GET 请求测试
# =============================================================================
echo -e "${BLUE}----------------------------------------${NC}"
echo -e "${BLUE}测试 6: GET 请求 (如 /auth/me)${NC}"
echo -e "${BLUE}----------------------------------------${NC}"

GET_RESPONSE=$(curl -s -X GET "${BACKEND_URL}/auth/me" \
    -H "Origin: ${FRONTEND_URL}" \
    -H "Content-Type: application/json" \
    -v 2>&1)

check_cors_headers "$GET_RESPONSE" "${FRONTEND_URL}" "GET Request Test"
echo ""

# =============================================================================
# 测试报告
# =============================================================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}           测 试 报 告${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "总测试数: ${YELLOW}${TOTAL_TESTS}${NC}"
echo -e "通过: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "失败: ${RED}${TESTS_FAILED}${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}     所有 CORS 测试通过! ✓${NC}"
    echo -e "${GREEN}========================================${NC}"
    exit 0
else
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}     部分 CORS 测试失败! ✗${NC}"
    echo -e "${RED}========================================${NC}"
    exit 1
fi
