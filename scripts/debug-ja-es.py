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
    "vector": {"trust_threshold":0.5,"boundary_strength":0.6,"conflict_score":0.7,"attachment_score":0.4,"emotional_regulation":0.8,"stress_score":0.6,"perfectionism_score":0.7,"growth_mindset_score":0.5,"social_energy_score":0.3,"confidence":{"trust":0.7,"conflict":0.8,"attachment":0.6,"stress":0.7,"selfview":0.8,"socialenergy":0.5},"attachment_pattern":"secure","conflict_style":"analytical","stress_response":"rumination","achievement_drive":"high_standards","selfview_pattern":"growth_minded","social_energy_style":"selective","assertiveness_score":0.5,"harmony_seeking_score":0.6,"verbal_vs_nonverbal":0.5,"logic_vs_intuition":0.6,"processing_speed_score":0.7,"reactivity_score":0.4,"time_horizon":"short_term"},
    "share_card":{"archetype":"STALE","headline":"STALE","description":"STALE","cta":"STALE"},
    "key_insight":"STALE","narrative":"STALE","eva_opening":"STALE",
    "evidence_log":[],"pattern_tags":[]
}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for locale in ["ja", "es"]:
        ctx = browser.new_context()
        page = ctx.new_page()
        page.goto("http://localhost:3001/", wait_until="networkidle")
        lang_btn = page.locator("button.global-lang__toggle")
        lang_btn.click()
        page.wait_for_timeout(200)
        label = {"ja": "日本語", "es": "Español"}[locale]
        page.get_by_role("menuitem", name=label).click()
        page.wait_for_timeout(1500)
        page.evaluate(f"sessionStorage.setItem('eva_script_result', JSON.stringify({json.dumps(MOCK_RESULT)}));")
        page.goto("http://localhost:3001/report", wait_until="networkidle")
        page.wait_for_timeout(3000)
        body = page.evaluate("document.body.innerText")
        print(f"[{locale}] body (first 600):\n{body[:600]}\n")
        page.close()
        ctx.close()
    browser.close()