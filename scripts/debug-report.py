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
    "key_insight": "Test insight text for testing purposes.",
    "narrative": "Test narrative content.",
    "eva_opening": "Test opening message.",
    "evidence_log": [{"dimensionId": "trustBoundaries", "scenarioTitle": "Trust", "choiceText": "A", "expectedSignal": "low"}],
    "pattern_tags": ["信任模式", "边界清晰"],
}

def test_with_data(page, locale):
    errors = []

    page.goto("http://localhost:3000/", wait_until="networkidle")

    # Switch locale first
    lang_btn = page.locator("button.global-lang__toggle")
    lang_btn.click()
    page.wait_for_timeout(200)
    locale_label = {"zh-CN": "简体中文", "en": "English", "ja": "日本語", "es": "Español"}[locale]
    page.get_by_role("menuitem", name=locale_label).click()
    page.wait_for_timeout(1500)

    # Inject mock data into sessionStorage
    page.evaluate(f"sessionStorage.setItem('eva_script_result', JSON.stringify({json.dumps(MOCK_RESULT)}));")
    stored = page.evaluate("sessionStorage.getItem('eva_script_result')")
    if not stored:
        return ["failed to inject data", False]

    # Navigate to report page - this triggers router.refresh which also re-generates via useEffect
    page.goto("http://localhost:3000/report", wait_until="networkidle")
    page.wait_for_timeout(2000)

    html_lang = page.evaluate("document.documentElement.lang")
    body = page.evaluate("document.body.innerText")

    print(f"\n[{locale}] html_lang={html_lang}")
    print(f"[{locale}] body:\n{body}")

    if html_lang != locale:
        errors.append(f"html lang mismatch: {html_lang} != {locale}")

    # Check that share_card content renders
    if "Test Archetype" not in body:
        errors.append(f"share_card archetype not rendered for {locale}")

    # For non-Chinese, check no Chinese UI text
    if locale != "zh-CN":
        unexpected_cn = ["测评完成", "核心洞察", "注册后保存"]
        for text in unexpected_cn:
            if text in body:
                errors.append(f"unexpected CN text '{text}' in {locale}")

    # Check key_insight rendered
    if "Test insight" not in body:
        errors.append(f"key_insight not rendered for {locale}")

    return errors

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    all_results = []
    for loc in ["zh-CN", "en", "ja", "es"]:
        ctx = browser.new_context()
        page = ctx.new_page()
        try:
            errors = test_with_data(page, loc)
            if errors:
                for err in errors:
                    print(f"  [FAIL] {err}")
                all_results.append(False)
            else:
                print(f"  [PASS] {loc}")
                all_results.append(True)
        except Exception as e:
            print(f"  [ERR] {loc}: {e}")
            all_results.append(False)
        finally:
            page.close()
            ctx.close()

    browser.close()
    print(f"\nAll passed: {all(all_results)}")
    if not all(all_results):
        for loc, r in zip(["zh-CN", "en", "ja", "es"], all_results):
            print(f"  {'✅' if r else '❌'} {loc}")