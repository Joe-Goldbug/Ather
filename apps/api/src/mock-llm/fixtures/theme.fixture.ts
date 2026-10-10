/**
 * Mock fixtures for theme-assessment AI integration.
 * Used when LLM_BASE_URL points at the local mock-llm controller,
 * so the dynamic-question and insight pipelines can be exercised
 * without a real provider.
 */

/** Builds a {"prompts":[{focus_key,prompt,options[]}]} payload from the request's focus_keys. */
export function buildThemeQuestionsJson(user: string): string {
  let focusKeys: string[] = [];
  try {
    const parsed = JSON.parse(user) as { focus_keys?: unknown };
    if (Array.isArray(parsed.focus_keys)) {
      focusKeys = parsed.focus_keys.filter((key): key is string => typeof key === 'string');
    }
  } catch {
    focusKeys = [];
  }
  const prompts = focusKeys.map((focus_key, index) => ({
    focus_key,
    prompt: `[mock] 情境${index + 1}：你遇到一件与「${focus_key}」有关的日常小事，需要决定接下来怎么做。`,
    options: [
      '[mock] 主动靠近，把这件事说清楚。',
      '[mock] 先守住边界，不急着表态。',
      '[mock] 先弄清发生了什么再回应。',
      '[mock] 先暂停一下，给自己留空间。',
    ],
  }));
  return JSON.stringify({ prompts });
}

/** Builds a {"paragraphs":[{text,evidence_question_ids}]} payload citing real evidence ids. */
export function buildThemeInsightJson(user: string): string {
  let evidenceIds: string[] = [];
  try {
    const parsed = JSON.parse(user) as {
      current_result?: { evidence?: Array<{ question_id?: unknown }> };
    };
    const evidence = parsed.current_result?.evidence;
    if (Array.isArray(evidence)) {
      evidenceIds = evidence
        .map((entry) => entry.question_id)
        .filter((id): id is string => typeof id === 'string');
    }
  } catch {
    evidenceIds = [];
  }
  const paragraphs = evidenceIds.slice(0, 3).map((id, index) => ({
    text: `[mock] 第${index + 1}条洞察：你在不同情境里的回应并不完全一致，这一轮可以留意自己的节奏。`,
    evidence_question_ids: [id],
  }));
  return JSON.stringify({ paragraphs });
}
