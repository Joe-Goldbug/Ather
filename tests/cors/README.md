# CORS 修复验证测试说明

## 快速开始

### 方法 1: 使用自动化测试脚本 (推荐)

```bash
# 1. 给脚本添加执行权限
chmod +x tests/cors/cors_test.sh

# 2. 运行测试 (默认 staging 环境)
./tests/cors/cors_test.sh

# 3. 或测试 production 环境
./tests/cors/cors_test.sh production
```

### 方法 2: 手动运行 curl 命令

参考 `curl_commands.md` 中的命令，逐条执行。

### 方法 3: 浏览器端测试

1. 打开前端页面
2. 按 F12 打开开发者工具
3. 复制 `browser_cors_test.js` 内容到 Console
4. 按回车执行

---

## 文件说明

| 文件 | 说明 |
|------|------|
| `cors_test.sh` | 自动化测试脚本 (Bash) |
| `browser_cors_test.js` | 浏览器端 JavaScript 测试脚本 |
| `curl_commands.md` | 详细的 curl 命令手册 |
| `test_report_template.md` | 测试报告模板 |
| `README.md` | 本说明文档 |

---

## 预期结果

当 CORS 配置正确时，你应该看到:

1. **OPTIONS 请求**: 返回 204，包含 `Access-Control-Allow-Origin` 头
2. **POST 请求**: 返回 200，包含 `Access-Control-Allow-Origin` 头
3. **浏览器测试**: 控制台显示 "所有 CORS 测试通过!"

---

## 故障排除

### 问题 1: OPTIONS 返回 403

**可能原因**: CORS 配置未生效

**解决方法**:
1. 检查后端服务中的 `global_cors` 配置
2. 确保包含当前前端 origin
3. 重新部署后端

### 问题 2: POST 请求无响应

**可能原因**: 网络问题或后端服务异常

**解决方法**:
1. 检查后端服务是否正常运行
2. 查看后端日志
3. 验证 API 端点是否正确

### 问题 3: 浏览器显示 CORS 错误

**可能原因**: Origin 不匹配

**解决方法**:
1. 检查浏览器的实际 Origin
2. 确认前端 URL 在 CORS 允许列表中
3. 清除浏览器缓存重试

---

## 安全注意事项

1. 不要在生产环境中使用测试邮箱发送真实邮件
2. 测试完成后清理测试数据
3. 不要将测试结果上传到公开仓库
