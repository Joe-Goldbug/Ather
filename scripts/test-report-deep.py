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

LOCALES = ["zh-CN", "en", "ja", "es"]

# Expected text from report page after mock data injection
LOCALE_CHECKS = {
    "zh-CN": ["性格报告", "关键洞察", "核心洞察", "信任边界",
              "人格维度", "依恋倾向", "人格标签"],
    "en": ["Personality Report", "Key Insight", "Key insight",
           "Trust Threshold", "Dimensions", "Tags"],
    "ja": ["性格レポート", "主要な洞察", "信頼閾値",
           "性格次元", "性格タグ"],
    "es": ["Informe de Personalidad", "Perspectiva Clave",
           "Límites de Confianza", "Dimensiones de Personalidad"],
}

UNEXPECTED_CN = ["测评完成", "核心洞察：", "查看完整报告", "注册后保存结果", "性格报告"]

def test_report_deep(page, locale):
    errors = []

    # Inject mock report data via sessionStorage before navigating
    page.goto("http://localhost:3000/", wait_until="networkidle")
    mock_data = {"choices": MOCK_CHOICES, "vector": {
        "trust_threshold": 0.5, "boundary_strength": 0.6,
        "conflict_score": 0.7, "attachment_score": 0.4,
        "emotional_regulation": "rational", "stress_score": 0.6,
        "perfectionism_score": 0.7, "growth_mindset_score": 0.5,
        "social_energy_score": 0.3, "confidence": {
            "trust": 0.7, "conflict": 0.8, "attachment": 0.6, "stress": 0.7,
            "selfview": 0.8, "socialenergy": 0.5,
        },
        "attachment_pattern": "secure", "conflict_style": "analytical",
        "stress_response": "rumination", "achievement_drive": "high_standards",
        "selfview_pattern": "growth_minded", "social_energy_style": "selective",
    }, "evidence_log": [{
        "id": "ev-1", "dimensionId": "trustBoundaries",
        "scenarioTitle": "Trust Boundaries", "choiceText": "Option A",
        "expectedSignal": "low",
    }], "narrative": "placeholder", "key_insight": "placeholder",
      "eva_opening": "placeholder",
      "share_card": {"archetype": "Test", "headline": "Test", "description": "Test"}}
    page.evaluate(f"sessionStorage.setItem('eva_script_result', JSON.stringify({json.dumps(mock_data)}));")

    # Navigate to report page
    page.goto("http://localhost:3000/report", wait_until="networkidle")
    page.wait_for_timeout(500)

    # Switch to target locale
    lang_btn = page.locator("button.global-lang__toggle")
    if not lang_btn.is_visible():
        return [f"no lang switcher", False]
    lang_btn.click()
    page.wait_for_timeout(200)
    locale_label = {"zh-CN": "简体中文", "en": "English", "ja": "日本語", "es": "Español"}[locale]
    locale_btn = page.get_by_role("menuitem", name=locale_label)
    if not locale_btn.is_visible():
        return [f"locale button not visible: {locale_label}", False]
    locale_btn.click()
    page.wait_for_timeout(2000)

    html_lang = page.evaluate("document.documentElement.lang")
    if html_lang != locale:
        errors.append(f"html lang={html_lang} != {locale}")

    body_text = page.evaluate("document.body.innerText")

    # Check expected locale-specific text
    for text in LOCALE_CHECKS.get(locale, []):
        if text.lower() not in body_text.lower():
            errors.append(f"missing text '{text}' for {locale}")

    # Check no Chinese text in non-CH locales
    if locale != "zh-CN":
        for text in UNEXPECTED_CN:
            if text in body_text:
                errors.append(f"found unexpected CN text '{text}' for {locale}")

    return errors

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    print("Testing /report deep language switching (with mock report data)")
    print("="*60)
    results = []
    for locale in LOCALES:
        ctx = browser.new_context()
        page = ctx.new_page()
        try:
            errors = test_report_deep(page, locale)
            if errors:
                for err in errors:
                    print(f"  [FAIL] {locale} - {err}")
                results.append(False)
            else:
                print(f"  [PASS] {locale} — html_lang OK, expected text found, no CN leaks")
                results.append(True)
        except Exception as e:
            print(f"  [ERR] {locale} - {e}")
            results.append(False)
        finally:
            page.close()
            ctx.close()
    browser.close()

    all_pass = all(results)
    print(f"\n{'='*60}")
    print(f"ALL PASSED: {all_pass}")
    if not all_pass:
        for loc, r in zip(LOCALES, results):
            print(f"  {'✅' if r else '❌'} {loc}")
