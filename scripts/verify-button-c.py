"""Verify the '收起方法说明' button visual after TDD fix."""
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path("/tmp/eva-e2e"); OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    page = b.new_page(viewport={"width": 1280, "height": 1400})
    # login first
    page.goto("http://localhost:3000/login", wait_until="networkidle", timeout=30000)
    page.locator('button:has-text("一键登录")').first.click()
    page.wait_for_load_state("networkidle", timeout=10000)
    # profile
    page.goto("http://localhost:3000/profile", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)  # let initial collapse animation settle
    # find the confidence breakdown section
    page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.4)")
    page.wait_for_timeout(500)
    # screenshot the toggle button
    btn = page.locator('button[aria-controls^="confidence-method-"]').first
    btn.wait_for(state="visible", timeout=10000)
    btn.screenshot(path=str(OUT / "button-c-toggle.png"))
    # screenshot whole confidence breakdown
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(300)
    # find the breakdown section by header
    h = page.locator('h3:has-text("这些结论有多靠谱")').first
    if h.count() > 0:
        h.scroll_into_view_if_needed()
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "button-c-context.png"), full_page=False)
    b.close()
print("done")