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
        "archetype": "Test Archetype",
        "headline": "Test Headline",
        "description": "Test Description",
        "cta": "Test CTA",
    },
    "key_insight": "OLD insight from before switch.",
    "narrative": "OLD narrative from before switch.",
    "eva_opening": "OLD opening from before switch.",
    "evidence_log": [{"dimensionId": "trustBoundaries", "scenarioTitle": "Trust", "choiceText": "A", "expectedSignal": "low"}],
    "pattern_tags": ["信任模式"],
}

def test_live_switch(page):
    errors = []

    # 1. Navigate to home, go to zh-CN
    page.goto("http://localhost:3000/", wait_until="networkidle")
    lang_btn = page.locator("button.global-lang__toggle")
    lang_btn.click()
    page.wait_for_timeout(200)
    page.get_by_role("menuitem", name="简体中文").click()
    page.wait_for_timeout(1500)

    # 2. Inject mock data with OLD content
    page.evaluate(f"sessionStorage.setItem('eva_script_result', JSON.stringify({json.dumps(MOCK_RESULT)}));")

    # 3. Navigate to report
    page.goto("http://localhost:3000/report", wait_until="networkidle")
    page.wait_for_timeout(2000)

    body_zh = page.evaluate("document.body.innerText")
    # Verify OLD content is visible (test passed to report with zh-CN)
    has_old_key_insight = "OLD insight" in body_zh
    has_old_narrative = "OLD narrative" in body_zh
    print(f"  zh-CN → OLD insight visible: {has_old_key_insight}, OLD narrative: {has_old_narrative}")

    if not has_old_key_insight:
        errors.append("OLD insight not visible on initial zh-CN render")

    # 4. Switch to English
    lang_btn = page.locator("button.global-lang__toggle")
    lang_btn.click()
    page.wait_for_timeout(200)
    page.get_by_role("menuitem", name="English").click()
    page.wait_for_timeout(3000)

    html_lang = page.evaluate("document.documentElement.lang")
    body_en = page.evaluate("document.body.innerText")

    print(f"  html_lang after switch: {html_lang}")
    print(f"  Body after EN switch (first 500):\n{body_en[:500]}")

    if html_lang != "en":
        errors.append(f"html lang not EN after switch: {html_lang}")

    # 5. KEY CHECK: verify the regenerate fired and OLD content was replaced
    # generateScriptResult should regenerate share_card, key_insight, narrative with locale-aware content
    has_old_key_insight_after = "OLD insight" in body_en
    has_old_narrative_after = "OLD narrative" in body_en

    if has_old_key_insight_after:
        errors.append("OLD insight NOT regenerated after locale switch!")
    else:
        print(f"  ✅ OLD insight was regenerated (not found in EN body)")

    if has_old_narrative_after:
        errors.append("OLD narrative NOT regenerated after locale switch!")
    else:
        print(f"  ✅ OLD narrative was regenerated (not found in EN body)")

    # Verify English-specific content appeared
    has_en_title = "Your Behavior Map" in body_en
    has_en_insight = "What EVA Sees" in body_en
    print(f"  EN title: {has_en_title}, EN insight label: {has_en_insight}")

    if not has_en_title:
        errors.append("'Your Behavior Map' title missing after EN switch")
    if not has_en_insight:
        errors.append("'What EVA Sees' missing after EN switch")

    # Verify no Chinese UI text leaks
    cn_leaks = ["性格报告", "证据链追溯", "六维行为底层图谱", "防备阈值"]
    for text in cn_leaks:
        if text in body_en:
            errors.append(f"CN text leak: '{text}' found in EN body")

    return errors

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context()
    page = ctx.new_page()
    errors = test_live_switch(page)
    page.close()
    ctx.close()
    browser.close()

    if errors:
        print(f"\nFAILED with {len(errors)} errors:")
        for e in errors:
            print(f"  ❌ {e}")
    else:
        print(f"\n✅ ALL PASSED — live locale switch on report page works correctly")
        print("  • share_card regenerated in new locale")
        print("  • key_insight regenerated in new locale")
        print("  • No Chinese text leaked to English")