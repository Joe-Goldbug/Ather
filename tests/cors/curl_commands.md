# CORS 修复验证测试 - 独立 curl 命令集

## 环境变量设置

```bash
# 根据环境选择
# Staging 环境
export BACKEND_URL="http://localhost:3001"
export FRONTEND_URL="http://localhost:3000"

# 或 Production 环境
# export BACKEND_URL="https://your-backend.example.com"
# export FRONTEND_URL="https://your-frontend.example.com"
```

## 测试 1: OPTIONS 预检请求 (正确 Origin)

**测试目的**: 验证预检请求返回正确的 CORS 头

```bash
curl -X OPTIONS "${BACKEND_URL}/auth/send-code" \
  -H "Origin: ${FRONTEND_URL}" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v
```

**预期响应**:
- HTTP Status: 204 No Content 或 200 OK
- Header: `Access-Control-Allow-Origin: ${FRONTEND_URL}` 或 `*`
- Header: `Access-Control-Allow-Methods: POST` (或包含 POST)
- Header: `Access-Control-Allow-Headers: Content-Type` (或包含 Content-Type)

---

## 测试 2: OPTIONS 预检请求 (本地开发)

**测试目的**: 验证 localhost 也被允许

```bash
curl -X OPTIONS "${BACKEND_URL}/auth/send-code" \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v
```

**预期响应**:
- HTTP Status: 204 或 200
- Header: `Access-Control-Allow-Origin: http://localhost:3000`

---

## 测试 3: OPTIONS 预检请求 (未授权 Origin)

**测试目的**: 验证未授权 origin 被拒绝或返回空 CORS 头

```bash
curl -X OPTIONS "${BACKEND_URL}/auth/send-code" \
  -H "Origin: https://evil-site.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v
```

**预期响应**:
- 无 `Access-Control-Allow-Origin` 头，或值为空
- 或者返回 `Access-Control-Allow-Origin: *` (取决于具体 CORS 配置)

---

## 测试 4: POST 请求 (正确 Origin)

**测试目的**: 验证实际 POST 请求能正常工作

```bash
curl -X POST "${BACKEND_URL}/auth/send-code" \
  -H "Origin: ${FRONTEND_URL}" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}' \
  -v
```

**预期响应**:
- HTTP Status: 200 OK (或 429 如果触发限流)
- Header: `Access-Control-Allow-Origin: ${FRONTEND_URL}`
- Body: `{"success":true,...}` (或 `{"success":false,...}` 如果触发限流)

---

## 测试 5: POST 请求 (localhost)

**测试目的**: 验证本地开发环境可以调用 API

```bash
curl -X POST "${BACKEND_URL}/auth/send-code" \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"email":"localhost-test@example.com"}' \
  -v
```

**预期响应**:
- HTTP Status: 200 或 429
- Header: `Access-Control-Allow-Origin: http://localhost:3000`

---

## 测试 6: GET 请求测试

**测试目的**: 验证 GET 请求也支持 CORS

```bash
curl -X GET "${BACKEND_URL}/auth/me" \
  -H "Origin: ${FRONTEND_URL}" \
  -H "Content-Type: application/json" \
  -v
```

**预期响应**:
- HTTP Status: 401 (未认证) 或 200 (如果已认证)
- Header: `Access-Control-Allow-Origin: ${FRONTEND_URL}`

---

## 测试 7: 带自定义 Header 的请求

**测试目的**: 验证自定义 Header 被允许

```bash
curl -X POST "${BACKEND_URL}/auth/send-code" \
  -H "Origin: ${FRONTEND_URL}" \
  -H "Content-Type: application/json" \
  -H "X-Custom-Header: test-value" \
  -d '{"email":"custom-header-test@example.com"}' \
  -v
```

**预期响应**:
- HTTP Status: 200 或 429
- Header: `Access-Control-Allow-Origin: ${FRONTEND_URL}`

---

## 测试 8: 无 Origin 头的请求

**测试目的**: 验证无 Origin 时的行为

```bash
curl -X POST "${BACKEND_URL}/auth/send-code" \
  -H "Content-Type: application/json" \
  -d '{"email":"no-origin-test@example.com"}' \
  -v
```

**预期响应**:
- HTTP Status: 200
- 无 `Access-Control-Allow-Origin` 头 (或根据配置)

---

## 快速验证脚本

一键运行所有测试 (保存为 `quick_test.sh`):

```bash
#!/bin/bash
set -e

BACKEND_URL="http://localhost:3001"
FRONTEND_URL="http://localhost:3000"

echo "=== CORS 快速验证 ==="

echo "1. Testing OPTIONS preflight..."
curl -s -X OPTIONS "${BACKEND_URL}/auth/send-code" \
  -H "Origin: ${FRONTEND_URL}" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -D - | grep -i "Access-Control-Allow"

echo ""
echo "2. Testing POST request..."
curl -s -X POST "${BACKEND_URL}/auth/send-code" \
  -H "Origin: ${FRONTEND_URL}" \
  -H "Content-Type: application/json" \
  -d '{"email":"quick-test@example.com"}' \
  -D - | head -20

echo ""
echo "=== 验证完成 ==="
```
