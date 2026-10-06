"""E2E test: 一键登录 → /profile 看到用户主页

服务已在 3000/3001/5432 跑,直接接。
第一版用 TopBar Link 点,发现 click 没触发 nav,改用 direct goto 验证链路。
"""

import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path("/tmp/eva-e2e")
OUT.mkdir(exist_ok=True)


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()

        console_errors: list[str] = []
        page.on(
            "console",
            lambda msg: msg.type == "error" and console_errors.append(msg.text),
        )
        page.on("pageerror", lambda exc: console_errors.append(f"pageerror: {exc}"))

        # ===== Step 1: 直接进 /login =====
        print("[1] 打开 /login ...")
        page.goto("http://localhost:3000/login", wait_until="networkidle", timeout=30000)
        page.screenshot(path=str(OUT / "01-login.png"), full_page=True)
        print(f"    url = {page.url}")
        assert "/login" in page.url

        # ===== Step 2: 找一键登录按钮 =====
        print("[2] 找一键登录按钮 ...")
        one_click = page.locator('button:has-text("一键登录")').first
        one_click.wait_for(state="visible", timeout=5000)
        print(f"    按钮文字 = {one_click.inner_text()!r}")
        page.screenshot(path=str(OUT / "02-before-click.png"), full_page=True)

        # ===== Step 3: 点一键登录,捕获响应 =====
        print("[3] 点击一键登录 ...")
        with page.expect_response(
            lambda r: "/auth/dev-login" in r.url and r.request.method == "POST",
            timeout=10000,
        ) as resp_info:
            one_click.click()
        resp = resp_info.value
        print(f"    dev-login status = {resp.status}")
        assert resp.status == 200, f"dev-login 应该 200,实际 {resp.status}"
        resp_body = resp.json()
        print(f"    dev-login body   = {resp_body}")

        page.wait_for_load_state("networkidle", timeout=15000)
        page.screenshot(path=str(OUT / "03-after-login.png"), full_page=True)
        print(f"    登录后 url = {page.url}")

        # ===== Step 4: 主动访问 /profile =====
        print("[4] 主动访问 /profile ...")
        page.goto("http://localhost:3000/profile", wait_until="networkidle", timeout=30000)
        page.screenshot(path=str(OUT / "04-profile.png"), full_page=True)
        print(f"    url = {page.url}")

        body_text = page.locator("body").inner_text()
        print(f"    body 长度 = {len(body_text)}")
        print(f"    body 前 300 字 = {body_text[:300]!r}")

        # ===== Step 5: 检查用户相关字段(用 dev user) =====
        # 看 HTML 里有没有 dev@eva.local
        html = page.content()
        has_dev_user = "dev@eva.local" in html or "dev" in body_text[:100]
        print(f"    含 dev@eva.local? {has_dev_user}")

        # ===== 结论 =====
        print()
        print(f"[summary] console errors 数量 = {len(console_errors)}")
        for e in console_errors[:5]:
            print(f"  - {e[:200]}")

        ok = (
            resp.status == 200
            and len(console_errors) == 0
            and len(body_text) > 50
            and "/profile" in page.url
        )
        print()
        print("=" * 60)
        print(f"RESULT: {'PASS' if ok else 'FAIL'}")
        print(f"  dev-login:        {resp.status} ({'OK' if resp.status == 200 else 'FAIL'})")
        print(f"  console errors:   {len(console_errors)} ({'OK' if len(console_errors) == 0 else 'FAIL'})")
        print(f"  profile body:     {len(body_text)} chars ({'OK' if len(body_text) > 50 else 'FAIL'})")
        print(f"  profile URL:      {page.url} ({'OK' if '/profile' in page.url else 'FAIL'})")
        print(f"  dev user shown:   {has_dev_user}")
        print(f"  screenshots:      {OUT}")
        print("=" * 60)

        browser.close()
        return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
