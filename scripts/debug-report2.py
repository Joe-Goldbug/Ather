from playwright.sync_api import sync_playwright
import json

MOCK_CHOICES = [
    {"scenarioId": "trust", "choice": "A", "timestamp": 1717000000000},
    {"scenarioId": "conflict", "choice": "B", "timestamp": 1717000001000},
    {"scenarioId": "attachment", "choice": "C", "timestamp": 1717000002000},
    {"scenarioId": "emotion", "choice": "D", "timestamp": 1717000003000},
    {"scenarioId": "stress", "choice": "A", "timestamp": 1717000004000},
    {"scenarioId": "achievement", "choice": "B", "timestamp": 1717000005000},
    {"scenarioId": "selfview", "choice": "C", "timestamp": 1717000006000},
    {"scenarioId": "socialenergy", "choice": "D", "timestamp": 1717000007000},
]

MOCK_RESULT = {
    "choices": MOCK_CHOICES,
    "vector": {
        "trust_threshold": 0.5, "boundary_strength": 0.6,
        "conflict_score": 0.7, "attachment_score": 0.4,
        "emotional_regulation": 0.8, "stress_score": 0.6,
        "perfectionism_score": 0.7, "growth_mindset_score": 0.5,
        "social_energy_score": 0.3,
        "confidence": {"trust": 0.7, "conflict": 0.8, "attachment": 0.6, "stress": 0.7, "selfview": 0.8, "socialenergy": 0.5},
        "attachment_pattern": "secure", "conflict_style": "analytical",
        "stress_response": "rumination", "achievement_drive": "high_standards",
        "selfview_pattern": "growth_minded", "social_energy_style": "selective",
        "assertiveness_score": 0.5, "harmony_seeking_score": 0.6,
        "verbal_vs_nonverbal": 0.5, "logic_vs_intuition": 0.6,
        "processing_speed_score": 0.7, "reactivity_score": 0.4,
        "time_horizon": "short_term",
    },
    "share_card": {
        "archetype": "DEFENSIVE_WALL",
        "headline": "你筑墙比别人高",
        "description": "在压力下你选择封闭而非敞开心扉",
        "cta": "别再独自承受",
    },
    "key_insight": "你的防御模式比你自己认为的更加明显。",
    "narrative": "你在边界测试中表现出高于平均水平的防御性...",
    "eva_opening": "你好，我看到了一些有趣的模式...",
    "evidence_log": [{"dimensionId": "trustBoundaries", "scenarioTitle": "信任边界", "choiceText": "A", "expectedSignal": "low"}],
    "pattern_tags": ["防御型", "边界型"],
}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context()
    page = ctx.new_page()

    page.goto("http://localhost:3001/", wait_until="networkidle")
    
    # Switch to zh-CN
    lang_btn = page.locator("button.global-lang__toggle")
    lang_btn.click()
    page.wait_for_timeout(200)
    page.get_by_role("menuitem", name="简体中文").click()
    page.wait_for_timeout(1500)

    # Inject data
    page.evaluate(f"sessionStorage.setItem('eva_script_result', JSON.stringify({json.dumps(MOCK_RESULT)}));")

    # Check sessionStorage
    stored = page.evaluate("sessionStorage.getItem('eva_script_result')")
    print(f"sessionStorage has data: {bool(stored)}")

    # Navigate to /report
    page.goto("http://localhost:3001/report", wait_until="networkidle")
    page.wait_for_timeout(3000)

    body = page.evaluate("document.body.innerText")
    print(f"\nBody (first 800 chars):\n{body[:800]}")

    # Check loading state
    loading = page.evaluate("document.querySelector('.report-section')?.innerHTML?.substring(0, 200) || 'no .report-section'")
    print(f"\n.report-section: {loading}")

    # Check global-lang button still exists
    lang_exists = page.locator("button.global-lang__toggle").is_visible()
    print(f"\nLang button visible: {lang_exists}")

    # Try switching to English
    page.locator("button.global-lang__toggle").click()
    page.wait_for_timeout(200)
    en_btn = page.get_by_role("menuitem", name="English")
    print(f"EN button visible: {en_btn.is_visible()}")
    en_btn.click()
    page.wait_for_timeout(3000)

    body2 = page.evaluate("document.body.innerText")
    print(f"\nAfter EN switch (first 800):\n{body2[:800]}")

    page.close()
    ctx.close()
    browser.close()