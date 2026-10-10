# `apps/web`

## 作用

这是 EVA 的 Next.js 14 前端。

当前正式页面：

- `/assessment`：14 题基线测评
- `/profile`：正式画像主页面
- `/daily-mirror`：现实记录
- `/theme-assessment`：连续主题测试
- `/micro-sandbox`：旧单题测试兼容入口，自动跳转到连续主题测试
- `/weekly-review`：周回顾

当前兼容页面：

- `/chat`：兼容入口，重定向到 `/profile`
- `/report`：兼容入口，重定向到 `/profile`

## 本地运行

```bash
cd apps/web
bun run dev
```

默认地址：

- Web: `http://localhost:3000`

如果 API 本地运行，前端会请求本地 API。

## 构建

```bash
cd apps/web
bun run build
```

## 测试

当前使用 `vitest + jsdom`。

```bash
cd apps/web
bunx vitest run
```

当前覆盖重点：

- 首页入口口径
- 语言切换器
- captures API 结果归一化
- corrections 能力门控
- portrait 关键展示逻辑
- auth hook 状态机

## 当前约束

- 首页只保留一个正式 CTA：去 `/assessment`；完成基础测评后的继续入口是 `/theme-assessment`
- `/chat` 和 `/report` 不是新功能入口，不能再往主导航加回去
- 画像主页面是 `/profile`
- 文案、页面顺序、用户路径以 `docs/CURRENT-PRODUCT-TRUTH-2026-06-29.md` 为准
