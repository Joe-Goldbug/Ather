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
    "share_card": {"archetype": "STALE", "headline": "STALE", "description": "STALE", "cta": "STALE"},
    "key_insight": "STALE INSIGHT",
    "narrative": "STALE NARRATIVE",
    "eva_opening": "STALE OPENING",
    "evidence_log": [],
    "pattern_tags": [],
}

CHECKS = {
    "zh-CN": ["边界守门人", "你守护的，比你说出来的多得多", "高度自我保护", "EVA 看到了什么", "证据链追溯"],
    "en": ["Boundary Gatekeeper", "You guard more than you reveal", "Highly self-protective", "What EVA Sees", "Evidence Trace"],
    "ja": ["バウンダリーゲートキーパー", "あなたは明かすよりも守る", "境界が明確で", "アザーが見ているもの", "証拠追跡"],
    "es": ["Guardián de Límites", "proteges más de lo que revelas", "Altamente autoprotector", "Lo que EVA Ve", "Rastreo de Evidencia"],
}

def test_full_flow(page, locale):
    errors = []

    # Navigate and switch to target locale
    page.goto("http://localhost:3001/", wait_until="networkidle")
    lang_btn = page.locator("button.global-lang__toggle")
    lang_btn.click()
    page.wait_for_timeout(200)
    label = {"zh-CN": "简体中文", "en": "English", "ja": "日本語", "es": "Español"}[locale]
    page.get_by_role("menuitem", name=label).click()
    page.wait_for_timeout(1500)

    # Inject OLD stale data
    page.evaluate(f"sessionStorage.setItem('eva_script_result', JSON.stringify({json.dumps(MOCK_RESULT)}));")

    # Go to report page
    page.goto("http://localhost:3001/report", wait_until="networkidle")
    page.wait_for_timeout(3000)

    body = page.evaluate("document.body.innerText")
    html_lang = page.evaluate("document.documentElement.lang")

    if html_lang != locale:
        errors.append(f"html lang={html_lang} != {locale}")

    # Check expected locale-specific content
    for text in CHECKS.get(locale, []):
        if text.lower() not in body.lower():
            errors.append(f"[{locale}] missing '{text}'")

    # Check NO stale content
    if "STALE" in body:
        errors.append(f"[{locale}] STALE content not regenerated")

    # Check NO Chinese leaks in non-Chinese locales
    if locale != "zh-CN":
        cn_leaks = ["边界守门人", "你守护的", "证据链追溯", "核心洞察", "性格报告", "六维行为"]
        for text in cn_leaks:
            if text in body:
                errors.append(f"[{locale}] CN leak: '{text}'")

    return errors

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    all_errors = []
    results = {}

    print("=" * 60)
    print("FULL FLOW: inject OLD data → load /report → verify per locale")
    print("=" * 60)

    for locale in ["zh-CN", "en", "ja", "es"]:
        ctx = browser.new_context()
        page = ctx.new_page()
        try:
            errors = test_full_flow(page, locale)
            if errors:
                for e in errors:
                    print(f"  [FAIL] {e}")
                results[locale] = False
            else:
                results[locale] = True
                print(f"  [PASS] {locale}")
        except Exception as e:
            print(f"  [ERR] {locale}: {e}")
            results[locale] = False
        finally:
            page.close()
            ctx.close()

    # Now test live switch on already loaded page
    print(f"\n{'=' * 60}")
    print("LIVE SWITCH: zh-CN → EN → JA → ES on same page")
    ctx = browser.new_context()
    page = ctx.new_page()

    page.goto("http://localhost:3001/", wait_until="networkidle")
    lang_btn = page.locator("button.global-lang__toggle")
    lang_btn.click()
    page.wait_for_timeout(200)
    page.get_by_role("menuitem", name="简体中文").click()
    page.wait_for_timeout(1500)
    page.evaluate(f"sessionStorage.setItem('eva_script_result', JSON.stringify({json.dumps(MOCK_RESULT)}));")
    page.goto("http://localhost:3001/report", wait_until="networkidle")
    page.wait_for_timeout(3000)

    live_results = []
    for locale in ["en", "ja", "es"]:
        lang_btn = page.locator("button.global-lang__toggle")
        lang_btn.click()
        page.wait_for_timeout(200)
        label = {"en": "English", "ja": "日本語", "es": "Español"}[locale]
        page.get_by_role("menuitem", name=label).click()
        page.wait_for_timeout(3000)

        body = page.evaluate("document.body.innerText")
        errors = []
        for text in CHECKS.get(locale, []):
            if text.lower() not in body.lower():
                errors.append(f"[{locale}] missing '{text}'")
        if "STALE" in body:
            errors.append(f"[{locale}] STALE not regenerated")
        cn_leaks = ["边界守门人", "你守护的", "证据链追溯"]
        for text in cn_leaks:
            if text in body:
                errors.append(f"[{locale}] CN leak: '{text}'")

        if errors:
            for e in errors:
                print(f"  [FAIL] {e}")
            live_results.append(False)
        else:
            print(f"  [PASS] live switch → {locale}")
            live_results.append(True)

    page.close()
    ctx.close()
    browser.close()

    results["live_switch"] = all(live_results)

    print(f"\n{'=' * 60}")
    all_pass = all(results.values())
    print(f"ALL PASSED: {all_pass}")
    if not all_pass:
        for k, v in results.items():
            print(f"  {'✅' if v else '❌'} {k}")