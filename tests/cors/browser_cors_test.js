/**
 * =============================================================================
 * CORS 修复验证 - 浏览器端测试脚本
 * =============================================================================
 * 使用方法:
 * 1. 打开浏览器开发者工具 (F12)
 * 2. 切换到 Console 标签
 * 3. 复制粘贴此脚本并运行
 * 4. 查看测试结果
 * =============================================================================
 */

(function() {
    'use strict';

    // 配置
    const CONFIG = {
        // 环境设置: 'local' 或 'production'
        environment: 'local',

        // 测试邮箱
        testEmail: 'browser-test@example.com',

        // 超时设置 (毫秒)
        timeout: 10000
    };

    // 环境 URL 映射
    const ENV_URLS = {
        local: {
            backend: 'http://localhost:3001',
            frontend: 'http://localhost:3000'
        },
        production: {
            backend: 'https://your-backend.example.com',
            frontend: 'https://your-frontend.example.com'
        }
    };

    // 获取当前环境 URL
    const urls = ENV_URLS[CONFIG.environment] || ENV_URLS.local;

    // 样式输出
    const styles = {
        title: 'font-size: 16px; font-weight: bold; color: #3b82f6;',
        success: 'color: #10b981; font-weight: bold;',
        error: 'color: #ef4444; font-weight: bold;',
        warning: 'color: #f59e0b; font-weight: bold;',
        info: 'color: #6b7280;',
        highlight: 'color: #8b5cf6; font-weight: bold;'
    };

    // 测试结果存储
    const results = {
        passed: [],
        failed: [],
        warnings: []
    };

    // 打印标题
    function printTitle(title) {
        console.log(`\n%c${title}`, styles.title);
        console.log('%c' + '='.repeat(50), styles.info);
    }

    // 打印成功
    function printSuccess(message) {
        console.log(`%c✓ ${message}`, styles.success);
        results.passed.push(message);
    }

    // 打印失败
    function printFail(message, error) {
        console.log(`%c✗ ${message}`, styles.error);
        if (error) {
            console.log('%c   Error: ' + error, styles.error);
        }
        results.failed.push({ message, error });
    }

    // 打印警告
    function printWarning(message) {
        console.log(`%c⚠ ${message}`, styles.warning);
        results.warnings.push(message);
    }

    // 打印信息
    function printInfo(label, value) {
        console.log(`%c${label}: %c${value}`, styles.info, styles.highlight);
    }

    // 检查响应头中的 CORS 相关头
    function checkCorsHeaders(response, testName) {
        const headers = {
            allowOrigin: response.headers.get('access-control-allow-origin'),
            allowMethods: response.headers.get('access-control-allow-methods'),
            allowHeaders: response.headers.get('access-control-allow-headers'),
            allowCredentials: response.headers.get('access-control-allow-credentials')
        };

        console.log('\n%c响应头检查:', styles.info);
        printInfo('  Access-Control-Allow-Origin', headers.allowOrigin || '(未设置)');
        printInfo('  Access-Control-Allow-Methods', headers.allowMethods || '(未设置)');
        printInfo('  Access-Control-Allow-Headers', headers.allowHeaders || '(未设置)');
        printInfo('  Access-Control-Allow-Credentials', headers.allowCredentials || '(未设置)');

        if (headers.allowOrigin) {
            printSuccess(`${testName}: Access-Control-Allow-Origin = ${headers.allowOrigin}`);
            return true;
        } else {
            printFail(`${testName}: Access-Control-Allow-Origin 未设置`);
            return false;
        }
    }

    // 测试 1: 简单 GET 请求
    async function testSimpleGet() {
        printTitle('测试 1: 简单 GET 请求');

        try {
            const response = await fetch(`${urls.backend}/auth/me`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            checkCorsHeaders(response, 'GET /auth/me');
            printInfo('状态码', response.status);

        } catch (error) {
            printFail('GET 请求失败', error.message);
        }
    }

    // 测试 2: POST 请求 (带请求体)
    async function testPostWithBody() {
        printTitle('测试 2: POST 请求 (发送验证码)');

        try {
            const response = await fetch(`${urls.backend}/auth/send-code`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: CONFIG.testEmail })
            });

            const corsOk = checkCorsHeaders(response, 'POST /auth/send-code');
            printInfo('状态码', response.status);

            if (corsOk) {
                const data = await response.json();
                printInfo('响应体', JSON.stringify(data, null, 2));

                if (data.success === true) {
                    printSuccess('POST 请求成功，验证码已发送');
                } else if (data.success === false && response.status === 429) {
                    printWarning('触发限流，但这是预期的业务行为');
                } else {
                    printWarning('响应中包含 success: false，但 CORS 工作正常');
                }
            }
        } catch (error) {
            printFail('POST 请求失败', error.message);
        }
    }

    // 测试 3: 复杂 POST 请求 (自定义头)
    async function testPostWithCustomHeaders() {
        printTitle('测试 3: POST 请求 (自定义 Header)');

        try {
            // 使用 X-Custom-Header 来触发预检请求
            const response = await fetch(`${urls.backend}/auth/send-code`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Custom-Header': 'test-value'
                },
                body: JSON.stringify({ email: CONFIG.testEmail })
            });

            checkCorsHeaders(response, 'POST with custom header');
            printInfo('状态码', response.status);

        } catch (error) {
            printFail('带自定义头的 POST 请求失败', error.message);
        }
    }

    // 测试 4: OPTIONS 预检请求 (手动触发)
    async function testOptionsPreflight() {
        printTitle('测试 4: OPTIONS 预检请求');

        try {
            const response = await fetch(`${urls.backend}/auth/send-code`, {
                method: 'OPTIONS',
                headers: {
                    'Access-Control-Request-Method': 'POST',
                    'Access-Control-Request-Headers': 'Content-Type'
                }
            });

            checkCorsHeaders(response, 'OPTIONS Preflight');
            printInfo('状态码', response.status);

            if (response.status === 204 || response.status === 200) {
                printSuccess('OPTIONS 预检请求成功');
            }
        } catch (error) {
            printFail('OPTIONS 请求失败', error.message);
        }
    }

    // 测试 5: 认证请求 (如果可用)
    async function testAuthenticatedRequest() {
        printTitle('测试 5: 认证请求测试');

        // 尝试从 localStorage 获取 token
        const token = localStorage.getItem('auth_token') || localStorage.getItem('token');

        if (!token) {
            printWarning('未找到认证 token，跳过认证请求测试');
            return;
        }

        try {
            const response = await fetch(`${urls.backend}/auth/me`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            checkCorsHeaders(response, 'Authenticated GET /auth/me');
            printInfo('状态码', response.status);

        } catch (error) {
            printFail('认证请求失败', error.message);
        }
    }

    // 测试 6: 错误响应 CORS
    async function testErrorResponseCors() {
        printTitle('测试 6: 错误响应 CORS 测试');

        try {
            // 发送一个会导致 400 错误的请求
            const response = await fetch(`${urls.backend}/auth/send-code`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: 'invalid-email' })
            });

            const corsOk = checkCorsHeaders(response, 'Error Response CORS');
            printInfo('状态码', response.status);

            if (corsOk && (response.status === 400 || response.status === 422)) {
                printSuccess('错误响应中包含正确的 CORS 头');
            }
        } catch (error) {
            printFail('错误响应测试失败', error.message);
        }
    }

    // 生成测试报告
    function printReport() {
        printTitle('CORS 测试报告');

        const total = results.passed.length + results.failed.length;
        const passed = results.passed.length;
        const failed = results.failed.length;
        const warnings = results.warnings.length;

        console.log('');
        printInfo('总测试数', total);
        printInfo('通过', passed);
        printInfo('失败', failed);
        printInfo('警告', warnings);
        console.log('');

        if (failed === 0) {
            console.log('%c========================================', styles.success);
            console.log('%c    所有 CORS 测试通过! ✓', styles.success);
            console.log('%c========================================', styles.success);
        } else {
            console.log('%c========================================', styles.error);
            console.log('%c    部分 CORS 测试失败! ✗', styles.error);
            console.log('%c========================================', styles.error);

            console.log('\n失败的测试:');
            results.failed.forEach((item, index) => {
                console.log(`  ${index + 1}. ${item.message}`);
                if (item.error) {
                    console.log(`     错误: ${item.error}`);
                }
            });
        }

        // 如果存在警告，显示警告
        if (warnings > 0) {
            console.log('\n%c警告信息:', styles.warning);
            results.warnings.forEach((msg, index) => {
                console.log(`  ${index + 1}. ${msg}`);
            });
        }
    }

    // 主测试函数
    async function runAllTests() {
        console.clear();
        console.log('%c╔════════════════════════════════════════╗', styles.title);
        console.log('%c║       CORS 修复验证测试 (浏览器)       ║', styles.title);
        console.log('%c╚════════════════════════════════════════╝', styles.title);

        printInfo('后端', urls.backend);
        printInfo('前端', urls.frontend);
        printInfo('测试邮箱', CONFIG.testEmail);

        // 运行所有测试
        await testSimpleGet();
        await testPostWithBody();
        await testPostWithCustomHeaders();
        await testOptionsPreflight();
        await testAuthenticatedRequest();
        await testErrorResponseCors();

        // 生成报告
        printReport();
    }

    // 运行测试
    runAllTests().catch(error => {
        console.error('测试执行失败:', error);
    });

    // 返回结果供外部使用
    window.CORSTestResults = results;

})();
