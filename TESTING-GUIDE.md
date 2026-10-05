# Eva-web3 开发者测试指引

> 启动时间：2026-10-04 17:26
> 状态：**可测试**（闭环 10/10 PASS，三页面 200，RLS 隔离生效）

> 🔧 **遇到报错先看 [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)**
> 常见问题：MetaMask 报错、页面卡在「正在准备」、401/503 对照表、item_id 失效绕过

---

## 一、访问入口

| 用途 | 地址 |
|---|---|
| **登录页** | http://localhost:3000/login |
| **主题轮测评（主功能）** | http://localhost:3000/theme-assessment |
| **访客测评（免登录）** | http://localhost:3000/play |
| 首页 | http://localhost:3000/ |
| API 直连 | http://localhost:3002 |

> ⚠️ **主题轮是需要登录的**。未登录访问会重定向到
> `/login?returnTo=/theme-assessment`，登录后自动跳回。
> 数据要落库并关联 `user_id`，所以必须有会话。

**真正免登录的只有访客测评 `/play`**（`guest-opening` 不写库）。

---

## 二、怎么登录

### 方式 A：一键登录按钮（推荐）

打开 http://localhost:3000/login ，页面上有 **「⚡ 一键登录（跳过邮箱）」** 按钮。

该按钮**仅在 localhost / 127.0.0.1 下显示**（`isLocalhost` 判断），
部署到其他域名不会出现。

### 方式 B：命令行

```bash
curl -c cookies.txt -X POST http://localhost:3002/auth/dev-login \
  -H "Content-Type: application/json" -d '{}'
```

### 方式 C：浏览器控制台

```js
fetch('/api/auth/dev-login', {method:'POST'}).then(r=>r.json()).then(console.log)
// 之后刷新页面即处于登录态
```

⚠️ 直接在地址栏访问 `/auth/dev-login` 会走 GET → 405，必须用 POST。

### 方式 D：邮箱 OTP —— **当前不可用**

`POST /auth/send-code` 返回 403：`The eva.live domain is not verified`。

原因：Resend 后台未验证 `eva.live` 域名。**属账号侧配置，代码无关**。
需要的话去 https://resend.com/domains 验证域名。

### 登录流程自测

```bash
node scripts/verify-login-flow.mjs
```

覆盖：主题轮需登录(401) → /login 可访问 → dev-login 发 cookie → 带 cookie 可访问 → 可建轮 → returnTo 防注入。


---

## 三、可以测什么（正式主链路）

依据 `docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md`，Eva 的正式主链路是：

```
6–8题主题轮 → 当前轮结果 → 确认/反驳/补充 → Profile 轮次历史 → 继续下一轮
```

### 完整测试路径

1. **建轮** — `POST /v1/assessment-rounds`，自动选主题并生成 6–8 题
2. **逐题作答** — `GET .../next` 取题 → `POST .../items/:id/responses` 提交
3. **完成** — `POST .../complete` 生成结果
4. **读结果** — `GET .../result`，返回本轮观察 + 证据 + 边界
5. **反馈** — `POST .../result/responses`，四种动作：
   - `confirm` 确认
   - `partial` 部分符合
   - `refute` 不符合
   - `clarify` 补充（**必须带 `explanation`**）
6. **轮次历史** — `GET /v1/assessment-rounds`

### 一键回归

```bash
cd D:\start-up\Eva-web3
node scripts/e2e-closed-loop.mjs
```

覆盖全部 10 个环节，当前全绿。

---

## 四、API 速查

所有路径直接挂在根下（无全局前缀）。除 `guest-opening` 外都需会话。

### 认证
```
POST /auth/dev-login          免密登录（dev@eva.local）
GET  /auth/me                 当前用户 + 能力位
POST /auth/send-code          发验证码（当前 403）
POST /auth/verify-code        校验验证码
POST /auth/logout             登出
```

### 主题轮（主链路）
```
POST /v1/assessment-rounds                              建轮
GET  /v1/assessment-rounds                              轮次历史
GET  /v1/assessment-rounds/:roundId/next                取下一题
POST /v1/assessment-rounds/:roundId/items/:itemId/responses   作答
POST /v1/assessment-rounds/:roundId/complete            完成并生成结果
GET  /v1/assessment-rounds/:roundId/result              读结果
POST /v1/assessment-rounds/:roundId/result/responses    提交反馈
GET  /v1/assessment-themes/coverage                    主题覆盖度
```

### 访客（免登录）
```
GET  /v1/story/guest-opening        开场白 + 题目
POST /v1/story/guest-opening/complete
POST /v1/story/guest-opening/claim   认领并绑定到账号
```

---

## 五、接口调用要点（踩过的坑）

### 1. 作答字段是 `choice_id`，不是 `option_id`

```json
POST /v1/assessment-rounds/{roundId}/items/{itemId}/responses
{
  "choice_id": "A",          // ← 不是 option_id
  "operation_id": "uuid",    // ← 必填，幂等键
  "free_text": "可选"
}
```

缺 `operation_id` → `operation_id_required`

### 2. 反馈也必须带 `operation_id`

```json
POST /v1/assessment-rounds/{roundId}/result/responses
{
  "action": "confirm",       // confirm | partial | refute | clarify
  "operation_id": "uuid",    // ← 必填
  "explanation": "clarify 时必填",
  "observation_question_id": "可选，不传则整份级反馈"
}
```

缺 `operation_id` → `invalid_response_command`
`clarify` 缺 `explanation` → `clarification_explanation_required`

### 3. `GET .../next` 偶发返回失效的 item_id

症状：提交作答时返回 `question_not_available`。

原因：这是源仓库继承的竞态（原型系统 同样存在）。

**绕过方式**：`POST .../complete` 返回的 409 响应里，`next` 字段携带的 `item_id` 是权威可用的：

```json
{
  "code": "round_requires_next_answer",
  "next": { "item_id": "...", "question": {...}, "state": "question" }
}
```

`scripts/e2e-closed-loop.mjs` 里已实现这个兜底逻辑。

### 4. `complete` 返回 409 不代表出错

`round_requires_next_answer` 是"还有题没答完"的正常反馈，
从 409 的 `next` 字段取下一题继续即可。

---

## 六、当前不可用 / 未迁移

### 6.1 你问的三个功能：**都没有迁移**

| 功能 | 原型系统 有？ | Eva-web3 | 原因 |
|---|---|---|---|
| **chat 对话** | ✅ 527 行 | ❌ **未迁移** | 官方标为「非正式/兼容路径」 |
| **历史记录** | ✅ `/profile`(289行) | ⚠️ **部分** | 见下|
| **纠正 corrections** | ✅ 132 行 | ❌ **未迁移** | 官方标为已退役（`legacy_corrections_retired`） |

### 6.2 「历史记录」的准确情况

原型系统 有两种"历史"，要分开看：

| 历史 | 原型系统 | Eva-web3 |
|---|---|---|
| **测评轮次历史** | `/profile` 页展示 | ✅ **已迁**—— `GET /v1/assessment-rounds`，在 `/theme-assessment` 页可见 |
| **人格画像历史** | `/profile` + portrait/evidence | ❌ 未迁（依赖 portrait，属 P2/P3） |

所以**测评历史能用，画像历史不能**。

### 6.3 其余未迁移项

| 项 | 状态 | 说明 |
|---|---|---|
| 邮箱 OTP 登录 | ❌ 403 | Resend 域名未验证，需账号侧配置 |
| `/chat`、`/report`、`/portrait` | — | 官方定义的非正式路径 |
| `/profile` 页 | — | 依赖 portrait/evidence；轮次历史请用 `/theme-assessment` |
| `POST /diary` | ⚠️ 已退役 | 官方改用 `POST /captures` |
| captures 写入 | ⚠️ 仅建表 | 证据抽取/确认/反驳属 P2 |
| corrections 写入 | ⚠️ 已退役 | 后端返回 Gone，**即使迁移也不可用** |
| 埋点 `product-events` | ⚠️ 静默失败 | 后端未迁，不影响主链路 |

### 6.4 迁移 corrections 需要注意

`corrections.service.ts`(132 行) 的**写路径在 原型系统 已被官方退役**
（`corrections.controller.ts:23` → `legacy_corrections_retired`）。

所以如果你要的是「用户能纠正 AI 的判断」这个能力，**不能直接搬 corrections 模块**，
需要先看 `portrait/observation-response.service.ts`(163 行) —— 那才是当前有效的纠正链路，
但它属于 P3（portrait 范畴）。

建议先明确产品上要哪个：
- 只是「对某条观察标记不同意」→ 可考虑基于 `result/responses` 的 `refute` 扩展
- 完整的「纠正生命周期」→ 得等 portrait 接入

---

## 七、数据与隔离

- **数据库**：Neon（复用 原型系统 实例），数据落在独立 schema `eva_web3`
- **表数量**：14 张，其中 6 张启用 RLS
- **不污染源项目**：原型系统 的 `public` schema 完全未动

### RLS 验证

```bash
node scripts/verify-rls.mjs
```

当前输出：
```
FORCE RLS: 6/6 表已启用
匿名经策略可见: 0 行
匿名无条件可见: 74 行
以 dev@eva.local 身份可见自己的轮次: 9 行
RLS_OK
```

> ⚠️ **注意**：Neon 的 `neondb_owner` 带 `rolbypassrls=true`，PostgreSQL 的 RLS 对表 owner
> 默认不生效。迁移 `004_force_rls.sql` 里的 `FORCE ROW LEVEL SECURITY` 是**安全底线，不可删除**。
> 删掉会导致任何登录用户能读到全表，且不报任何错。

### 连接池自愈（2026-10-04 新增）

早期版本有个严重问题：**Neon 池化连接耗尽后不会自愈**，
所有接口持续 503，必须重启进程。实测一次密集自测就能把连接池打满。

现在 `pool.ts` + `database.ts` 做了双层修复：
- `connect()` 3 次重试 + 指数退避，失败后重建池
- `query()` 同样 3 次重试，仅对连接类错误重试（SQL 错误立即抛出）
- 本地 PgPool 限制 `max: 5` / `idleTimeoutMillis: 30s`

压测验证：

```bash
node scripts/stress-db.mjs
# 结果: ok=60 5xx=0 其他=0
```

---

## 八、服务与日志

| 服务 | 端口 |
|---|---|
| Web（Next 14.2.35） | 3000 |
| API（NestJS 10） | 3002 |
| Redis（BullMQ 依赖） | 6379 |

**日志**：
```
.tmp/logs/api.log
.tmp/logs/web.log
```

**停止服务**（Git Bash 里 `taskkill //PID` 会被路径转换，用 PowerShell）：
```powershell
Stop-Process -Id <api-pid>,<web-pid> -Force
```

---

## 九、重启流程

```bash
cd D:\start-up\Eva-web3

# 1. Redis（若未运行）
./.workbuddy/tmp/redis/redis-server.exe --port 6379 --save "" --appendonly no
#    注：原型系统 的二进制可复用；Eva-web3 内没有自带

# 2. 构建
cd packages/core && bun run build && cd ../..
cd apps/api && npx nest build && cd ../..

# 3. API（3002）
cd apps/api && PORT=3002 node dist/main.js

# 4. Web（3000）
cd apps/web && node ../../node_modules/next/dist/bin/next dev -p 3000
```

⚠️ **Web 必须用 `node` 直接跑 next CLI**，不能用 `bunx next dev`——bun 运行时与 Next 的
worker 通信不兼容，会导致页面卡在编译中。

---

## 十、自测脚本总览

```bash
node scripts/verify-schema.mjs       # 表结构 + RLS 是否齐全
node scripts/verify-rls.mjs          # 数据隔离是否真实生效
node scripts/verify-login-flow.mjs   # 登录链路 7 项
node scripts/e2e-closed-loop.mjs     # 主闭环 10 项
node scripts/stress-db.mjs           # 连接池稳定性压测
node scripts/apply-migrations.mjs    # 应用迁移（幂等）
```

改动代码后建议至少跑 `e2e-closed-loop` + `verify-rls`。

---

## 十一、已知遗留问题（不影响当前测试）

1. `withheld` / `abandoned` 状态在类型里定义但从未被赋值 → 用户做一半无法主动放弃本轮
2. `coverage()` 与实际建轮主题在有反馈时可能不一致 → 前端展示的推荐主题与实际建轮有偏差
3. `/next` 的 item_id 偶发失效（见第五节第 3 条）
4. 反馈只影响**下一次**建轮的选题，不改变画像、不改历史结果

前三项计划在 P1 修复。
