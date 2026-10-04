# 常见问题排查

## 1. `Unhandled Runtime Error: Failed to connect to MetaMask`

**现象**：点击顶栏「短测」后报错

```
i: Failed to connect to MetaMask
Call Stack
  Object.connect
  chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/inpage.js (7:84292)
```

### 结论：**不是项目代码的问题，是浏览器扩展冲突**

`nkbihfbeogaeaoehlefnkodbefgpgknn` 是 **MetaMask 官方扩展 ID**。
`chrome-extension://` 开头的堆栈说明错误来自扩展的注入脚本，
**与 Ather-Solana 源码无关**。

### 已核实

| 检查项 | 结果 |
|---|---|
| Ather-Solana 代码里有 `window.ethereum` / wagmi / ethers / web3 | ❌ 完全没有 |
| `play` / `whitepaper` 页提到 wallet | 仅文案与注释（「不把 Web3 叙事提前到核心链路」） |
| `/theme-assessment` 返回 | ✅ 200，HTML 里无 MetaMask/ethereum 字样 |
| 页面外链脚本 | 6 个，**全部本地**，无第三方注入 |

### 根因

MetaMask 扩展会往每个页面注入 `inpage.js`，并劫持 `window.ethereum`。
某些状态下（未解锁 / 后台挂起 / 与其他钱包扩展冲突 / 扩展本身异常），
它自己调 `connect()` 失败就把错误抛成了 **unhandled rejection**，
Next.js dev overlay 恰好把这个未捕获错误显示成整页报错。

### 解决办法（按推荐顺序）

**① 无痕窗口打开**（最快验证是不是扩展问题）

```
chrome://newtab → Ctrl+Shift+N → 访问 http://localhost:3000/theme-assessment
```

无痕模式默认不加载大部分扩展。若正常 → 确认是扩展问题。

**② 临时禁用 MetaMask**

访问 `chrome://extensions` → 找到 MetaMask → 关闭开关 → 刷新页面。

**③ 检查是不是多个钱包扩展打架**

常见冲突组合：MetaMask + Coinbase Wallet + Rabby + OKX Wallet。
只留一个，其余关掉。

**④ 确认 MetaMask 状态正常**

- 扩展图标上若显示感叹号/错误，说明扩展本身异常 → 点开看具体提示
- 锁屏状态（未解锁）比已解锁更容易触发这个报错

### ⚠️ 这不是需要「修复」的缺陷

Ather-Solana 当前**没有接入任何钱包功能**（钱包绑定属P4 阶段）。
即使把 MetaMask 完全卸载，核心链路（登录 → 五主题 → 6 题 → 反馈 → 历史）也不受影响。

---

## 2. 主题轮页面一直显示「正在准备你的主题测试…」

**这是客户端异步加载，不是 bug。** `page.tsx:62,249` 在 `loading` 为true 时
只渲染这句提示，主题卡片要等 `useEffect` 拉完
`GET /v1/assessment-themes/coverage` 才出现。

若长时间不出卡片，打开浏览器控制台（F12）看 Network 面板里
这两个请求是否失败：

```
GET /api/auth/me                        → 应 200
GET /api/v1/assessment-themes/coverage  → 应 200
```

任一失败（尤其 503 `Database is unavailable`）说明是后端连接问题，
不是前端。检查 API 是否在跑：

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/auth/me   # 期望 401
```

---

## 3. 401 / 503 报错对照表

| 状态码 | 含义 | 处理 |
|---|---|---|
| 401 | 未登录或会话失效 | 重新登录（localhost 用「⚡ 一键登录」） |
| 503 `Database is unavailable` | Neon 连接失败 | 重启 API 进程（见下） |
| 409 `round_requires_six_core_questions` | 6 题没答完 | 从响应的 `next` 字段取下一题 |
| 400 `invalid_response_command` | 反馈缺 `operation_id` | 补上该字段 |
| 400 `observation_not_in_result` | 反馈的题不在本轮结果里 | 省略 `observation_question_id` 做整份反馈 |
| 400 `clarification_explanation_required` | `clarify` 缺说明 | 补 `explanation` |

### 重启 API

```powershell
# Git Bash 的 kill 对 node 无效，必须用 PowerShell
Get-NetTCPConnection -LocalPort 3002 -State Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

然后：

```bash
cd D:\start-up\Ather-Solana\apps\api
PORT=3002 node dist/main.js
```

---

## 4. `/next` 偶发返回失效的 item_id

提交作答时返回 `question_not_available`。

**绕过办法**：`POST /v1/assessment-rounds/:id/complete` 返回的 **409** 里，
`next` 字段携带的 `item_id` 才是可用的：

```json
{
  "code": "round_requires_next_answer",
  "next": { "item_id": "...", "question": {...}, "state": "question" }
}
```

`scripts/e2e-closed-loop.mjs` 里已实现这个兜底。

这是从 Ather-ethan 继承的竞态，计划在 P1 修复。
