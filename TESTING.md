# 测试指引 · Ather-Solana

服务已启动，可直接测试。

## 访问地址

| 页面 | 地址 | 说明 |
|---|---|---|
| 首页 | http://localhost:3500 | 品牌展示 + 一个测评入口按钮 |
| 测评 | http://localhost:3500/play | 六道决策点，答完出结果 |
| 白皮书 | http://localhost:3500/whitepaper | 支持全文搜索、目录跳转、四语言（从右上角入口进） |
| API | http://localhost:3001/v1/story/guest-opening | 只读接口，可直接 curl |

Web 监听 `0.0.0.0:3500`，同一局域网的其他设备也能访问（把 `localhost` 换成本机内网 IP）。

## 建议测试路径

1. **首页** → 居中的手绘边框按钮「开始了解自己」
2. **成年确认** → 点「我已满 18 岁，开始玩」
3. **六道题** → 每题点一个选项，会先显示该选项的「后果」，再点「继续」进入下一题
4. **结果页** → 应看到：章节标题、行为模式总结、三个洞察块（保护了什么 / 可能付出的代价 / 例外与矛盾）、边界说明、免责声明
5. 点「再玩一次」可重开
6. **白皮书** → 点右上角「White Paper」，搜索框输入任意词（如「人格」）应高亮所有匹配位置；左侧目录可点击跳转
7. 右上角语言图标可切换中 / 英 / 日 / 西 四种语言

## 值得留意的几个点

- **选项顺序每次都不同**。这是防背答案机制：每次开局按 `sha256(run_id:node:option)` 重排，但同一局内刷新不会变。同一道题连开两局，选项顺序应该不一样。

- **结果文案因选择而异**。六题都选同一类做法，和分散选择，出来的「行为模式」表述不同——后者会显示「你在不同情境中采用了不同的应对方式」。

- **无登录、无注册**。全程不绑定任何身份，刷新页面会从 sessionStorage 恢复进度，清除浏览器数据会丢失记录。

- **结果页不显示 undefined**。如果看到 undefined，说明是旧版本进程在跑（见下方端口说明）。

## 端口说明

本机 3000 端口被原项目 `ather-cyberpunk-self-discovery` 占用，所以新项目用了：

- **3001** — API
- **3300** — Web

如需换端口：

```bash
# API
cd D:\start-up\Ather-Solana
PORT=3002 node apps/api/dist/main.js

# Web
cd apps/web
NEXT_PUBLIC_API_URL=http://127.0.0.1:3002 npx next start -p 3400
```

注意：Web 的 `NEXT_PUBLIC_API_URL` 必须指向 API 实际端口，否则 SSR 阶段请求会失败。

## 自己跑自动化测试

服务保持运行的情况下：

```bash
cd D:\start-up\Ather-Solana
CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" npm run test:e2e
```

会驱动真实 Chrome 走完整闭环，输出 12 项断言结果。

## 日志位置

启动日志写在临时目录：

- API：`/tmp/api-run.log`
- Web：`/tmp/web-run.log`

## 已知限制

- 结果只存浏览器 sessionStorage，不跨设备、不跨浏览器
- 生产环境需设 `GUEST_CLAIM_SECRET`（用于签发 claim token），开发环境不设也能跑
- 只有一个章节（雨停之前）
- 暂未接入钱包（按计划后续再做）
