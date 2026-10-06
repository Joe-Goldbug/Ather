// ================================================================
// EVA Engine - Chat Engine (Five Engines + Dialogue Logic)
//
// Five engines decide HOW EVA responds:
//   1. Probe     — challenge contradiction or repeat topic
//   2. Extend    — deepen a topic the user just raised
//   3. Checkin   — EVA's daily first-message initiative
//   4. Weekly    — generate weekly review narrative
//   5. Pattern   — detect script-vector contradiction mid-chat
//
// Decision order (per turn):
//   checkin? → probe? → pattern? → extend? → normal
// ================================================================

import type {
  Memory, ChatRequest, ChatResponse, ConversationTurn,
  DiaryEntry, ChatEngineType, UBV, YouShifted,
  DialogueState, DialoguePhase,
} from '../shared/types.js';
import {
  appendTurn, updateQuickState, extractPersonMentions,
  buildDiaryEntry, buildWeeklySummaryScaffold, getTopicMentionCount,
  extractTimeCapsules, addTimeCapsules, detectTimeCapsule, markTimeCapsuleTriggered,
  recordRefutation,
  updateUBVFromSource, detectYouShifted, updateUBVMood, updateUBVQuickState,
  createUBV,
} from '../memory/memory.js';
import {
  buildChatPrompt, buildProbePrompt, buildExtendPrompt,
  buildCheckinPrompt, buildWeeklyReviewPrompt,
  buildEntityExtractionPrompt, buildPatternDetectionPrompt,
  buildRefutationPrompt, buildTimeCapsulePrompt,
} from './prompts.js';
import type { Locale } from './prompts.js';
import { detectContradictions } from '../assessment/script-engine.js';

// Deterministic turn ID — no global mutable state (safe for serverless/SSR)
const nextTurnId = (role: string) => {
  const cryptoObj = (globalThis as any).crypto;
  const uuid = cryptoObj?.randomUUID?.() ?? `${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
  return `turn_${Date.now()}_${uuid}_${role}`;
};

// ---------------------------------------------------------------
// UBV Inference — derive dimension updates from chat messages
// Called after every user turn to update the Unified Belief Vector
// ---------------------------------------------------------------

/**
 * Extract UBV dimension updates from user message text.
 * Uses heuristic rules (no LLM call needed — runs synchronously).
 * Returns an array of { dimension, value } to be applied via updateUBVFromSource.
 */
function inferUBVUpdates(
  user_message: string,
  active_topics: string[],
): Array<{ dimension: string; value: number }> {
  const updates: Array<{ dimension: string; value: number }> = [];
  const text = user_message;
  const lower = user_message.toLowerCase();

  // linguisticExtraversion: longer messages + more first-person pronouns → higher
  const wordCount = text.length;
  const iCount = (text.match(/我|自己|我的|咱们|俺/gi) ?? []).length;
  if (wordCount > 100 || iCount >= 3) {
    updates.push({ dimension: 'linguisticExtraversion', value: 65 });
  } else if (wordCount < 30) {
    updates.push({ dimension: 'linguisticExtraversion', value: 35 });
  }

  // shameSensitivity: avoidance markers
  if (/无所谓|没什么|不重要|算了|不想说|别问了|没意义/i.test(text)) {
    updates.push({ dimension: 'shameSensitivity', value: 70 });
  }

  // helpSeekingPattern: direct asking vs. self-reliance (mutually exclusive)
  if (/我自己能搞定|不需要别人|不需要建议|我自己想/i.test(text)) {
    updates.push({ dimension: 'helpSeekingPattern', value: 30 });
  } else if (/怎么办|你觉得|我该怎么办|帮我|给点建议/i.test(text)) {
    updates.push({ dimension: 'helpSeekingPattern', value: 70 });
  }

  // stressResponse: rumination markers
  if (/一直|反复|又|还是|怎么又|又来了|我也没办法/i.test(text)) {
    updates.push({ dimension: 'stressResponse', value: 30 }); // rumination = low
  }

  // narrativeCoherence: connected narrative vs. fragmented
  if (/因为...所以|后来|然后|结果|所以就|于是/i.test(text) && text.length > 50) {
    updates.push({ dimension: 'narrativeCoherence', value: 65 });
  } else if (text.length < 20 && active_topics.length > 0) {
    updates.push({ dimension: 'narrativeCoherence', value: 35 });
  }

  // growthOrientation: forward-looking language
  if (/以后|将来|下次|以后会|下次会|想改变|想试试|想学|希望/i.test(text)) {
    updates.push({ dimension: 'growthOrientation', value: 70 });
  }

  // conflictResponse: confrontation vs. avoidance
  if (/直接说|我会直接|我会说|我不会忍|我不怕冲突/i.test(text)) {
    updates.push({ dimension: 'conflictResponse', value: 75 });
  } else if (/算了|不想争|懒得说|随便|忍了/i.test(text)) {
    updates.push({ dimension: 'conflictResponse', value: 25 });
  }

  return updates;
}

/** Ensure memory has a UBV (lazy init) */
function ensureUBV(memory: Memory): UBV {
  if (memory.ubv) return memory.ubv;
  return createUBV(memory.meta.script_completed);
}

// ---------------------------------------------------------------
// Engine 1: Probe
// Triggers when:
//   (a) contradiction between script vector and current behaviour
//   (b) same topic mentioned ≥ 3 times (user keeps circling back)
// ---------------------------------------------------------------

function shouldProbe(
  memory: Memory,
  user_message: string,
  _locale: string = 'zh-CN',
): { trigger: boolean; hint: string } {
  const v = memory.personality_vector;
  if (!v) return { trigger: false, hint: '' };

  // (a) Contradiction rules from script-data
  const matched = detectContradictions(v);
  if (matched.length > 0) {
    // Only fire probe once every 6 turns to avoid being annoying
    const last_probe_idx = memory.conversation_history
      .slice()
      .reverse()
      .findIndex((t) => t.engine_triggered === 'probe');
    const turns_since = last_probe_idx === -1
      ? 999
      : last_probe_idx; // findIndex on reversed = turns since last probe

    if (turns_since >= 6) {
      const probe = matched[0].rule.probe;
      const hint = (probe as Record<string, string>)[_locale] ?? probe['zh-CN'] ?? '';
      return { trigger: true, hint };
    }
  }

  // (b) Repeat topic mention ≥ 3
  const HOT_TOPICS = [
    '边界', '信任', '冲突', '分手', '失去', '失败', '自我价值',
    '不值得', '被忽视', '控制', '压力', '后悔',
  ];
  for (const topic of HOT_TOPICS) {
    if (user_message.includes(topic)) {
      const count = getTopicMentionCount(memory, topic) + 1; // +1 for current
      if (count >= 3) {
        return {
          trigger: true,
          hint: `你说你${topic === '压力' ? '有压力' : `提到"${topic}"`}已经${count}次了。这不是巧合，这是你一直在绕的东西。你想正面面对它吗？`,
        };
      }
    }
  }

  return { trigger: false, hint: '' };
}

// ---------------------------------------------------------------
// Engine 2: Extend
// Triggers when user message is short/closing a topic
// EVA picks the most-mentioned active topic and extends it
// ---------------------------------------------------------------

function shouldExtend(
  memory: Memory,
  user_message: string,
): { trigger: boolean; topic: string } {
  const SHORT_MESSAGE_THRESHOLD = 20; // chars
  const qs = memory.quick_state;

  // Only extend on short messages (user seems done talking)
  if (user_message.length > SHORT_MESSAGE_THRESHOLD) {
    return { trigger: false, topic: '' };
  }

  // Don't extend on first 3 turns (too early)
  if (memory.meta.total_turns < 3) {
    return { trigger: false, topic: '' };
  }

  // Pick the most-mentioned non-trivial active topic
  const topic = qs.active_topics[0];
  if (!topic) return { trigger: false, topic: '' };

  // Don't extend same topic twice in a row
  const last_two = memory.conversation_history.slice(-2);
  const already_extended = last_two.some(
    (t) => t.engine_triggered === 'extend' && t.topic_tags?.includes(topic),
  );
  if (already_extended) return { trigger: false, topic: '' };

  return { trigger: true, topic };
}

// ---------------------------------------------------------------
// Engine 3: Check-in
// Triggers when user sends their FIRST message of the day
// (caller should determine this by checking last_active date)
// ---------------------------------------------------------------

export function isFirstMessageOfDay(memory: Memory): boolean {
  const last = memory.quick_state.last_active;
  if (!last) return true;
  const last_date = new Date(last).toDateString();
  const today = new Date().toDateString();
  return last_date !== today;
}

// ---------------------------------------------------------------
// Engine 4: Weekly review
// Triggers on Sunday (or caller-triggered manually)
// ---------------------------------------------------------------

export function shouldGenerateWeeklyReview(memory: Memory): boolean {
  if (memory.weekly_summaries.length === 0) {
    return memory.diary_entries.length >= 3;
  }
  const last_summary = memory.weekly_summaries[memory.weekly_summaries.length - 1];
  const ms_since = Date.now() - last_summary.generated_at;
  return ms_since >= 6 * 24 * 60 * 60 * 1000; // 6 days
}

// ---------------------------------------------------------------
// Engine 5: Pattern detection
// Detects mid-chat contradiction (vector vs current statement)
// Fires at most once every 8 turns
// ---------------------------------------------------------------

function shouldDetectPattern(memory: Memory): boolean {
  if (!memory.personality_vector) return false;
  const last_pattern_turn = memory.conversation_history
    .slice()
    .reverse()
    .findIndex((t) => t.engine_triggered === 'pattern');
  return last_pattern_turn === -1 || last_pattern_turn >= 8;
}

// ---------------------------------------------------------------
// Dialogue Orchestrator — Phase 3 state machine
// Manages the measurement dialogue lifecycle.
// Call advanceDialogueState() after each turn to update state.
// ---------------------------------------------------------------

const EVIDENCE_THRESHOLD = 3;    // evidence count before considering "enough"
const MAX_TURNS_PER_PHASE = 4;  // max turns in probing/insufficient before force-close

export const DIALOGUE_STATE_KEY = '_dialogue_state';

/**
 * Advance the dialogue state after a user turn.
 * Returns the updated state — caller persists it in Memory.meta or session.
 */
export function advanceDialogueState(
  prev: DialogueState,
  options: {
    evidence_gained?: boolean;   // did this turn add UBV evidence?
    user_topic_change?: boolean; // did user change topic significantly?
    user_fatigue?: boolean;      // short answers, low engagement
    micro_test_triggered?: boolean;
  },
): DialogueState {
  const next = { ...prev };
  next.total_turns += 1;
  next.turn_in_phase += 1;

  // Accumulate evidence from this turn (capped at max_turns to avoid overflow)
  if (options.evidence_gained) {
    next.evidence_count = Math.min(next.evidence_count + 1, next.max_turns);
  }

  // Track micro-test
  if (options.micro_test_triggered) {
    next.micro_test_pending = true;
    next.phase = 'needs_micro';
    next.turn_in_phase = 0;
    return next;
  }

  // If pending micro-test resolved, return to probing
  if (next.micro_test_pending && options.evidence_gained) {
    next.micro_test_pending = false;
    next.phase = prev.phase === 'needs_micro' ? 'probing' : prev.phase;
    next.turn_in_phase = 0;
  }

  // Fatigue-based early close
  if (options.user_fatigue && next.turn_in_phase >= 2 && next.evidence_count >= 1) {
    return { ...next, phase: 'closed', turn_in_phase: 0 };
  }

  // Evidence-based phase transitions
  if (next.phase === 'probing') {
    if (next.evidence_count >= EVIDENCE_THRESHOLD) {
      return { ...next, phase: 'enough', turn_in_phase: 0 };
    }
    if (next.turn_in_phase >= MAX_TURNS_PER_PHASE) {
      return { ...next, phase: 'insufficient', turn_in_phase: 0 };
    }
  } else if (next.phase === 'insufficient') {
    if (next.evidence_count >= EVIDENCE_THRESHOLD) {
      return { ...next, phase: 'enough', turn_in_phase: 0 };
    }
    if (next.turn_in_phase >= MAX_TURNS_PER_PHASE) {
      return { ...next, phase: 'closed', turn_in_phase: 0 };
    }
  } else if (next.phase === 'enough') {
    // Stay in enough until close decision is made
    if (next.turn_in_phase >= 2) {
      return { ...next, phase: 'closed', turn_in_phase: 0 };
    }
  }

  // Hard cap: max turns reached → force close
  if (next.total_turns >= next.max_turns) {
    return { ...next, phase: 'closed', turn_in_phase: 0 };
  }

  return next;
}

/**
 * Get a human-readable status of the current dialogue session.
 */
export function getDialogueStatus(state: DialogueState): string {
  switch (state.phase) {
    case 'probing':   return `测量中（证据 ${state.evidence_count}/${EVIDENCE_THRESHOLD}，第 ${state.turn_in_phase + 1} 轮）`;
    case 'insufficient': return `证据不足（第 ${state.turn_in_phase + 1} 轮，继续）`;
    case 'enough':    return `证据充分，准备收口`;
    case 'needs_micro': return `触发微测试，等待回应`;
    case 'closed':    return `对话已关闭（${state.total_turns} 轮）`;
  }
}

/**
 * Determine whether to generate a report based on dialogue state.
 * Returns true only when phase is 'closed'.
 */
export function shouldGenerateReport(state: DialogueState): boolean {
  return state.phase === 'closed';
}

// ---------------------------------------------------------------
// Entity extraction helper (LLM call, best-effort)
// ---------------------------------------------------------------

async function tryExtractEntities(
  user_message: string,
  memory: Memory,
  llm_caller: ChatRequest['llm_caller'],
): Promise<{ persons: Memory['entities']['persons']; value_conflicts: string[] }> {
  try {
    const { system, messages } = buildEntityExtractionPrompt(user_message);
    const raw = await llm_caller({ system, messages, max_tokens: 300, temperature: 0 });
    const parsed = JSON.parse(raw);

    // Merge extracted persons into existing
    const existing = memory.entities.persons;
    const merged = extractPersonMentions(user_message, existing);
    // Attach LLM-extracted persons too
    if (Array.isArray(parsed.persons)) {
      for (const p of parsed.persons) {
        const dup = merged.find((m) => m.name === p.name || m.relation === p.relation);
        if (!dup && p.name) {
          merged.push({
            id: `person_${Date.now()}_${p.name}`,
            name: p.name,
            relation: p.relation ?? '未知',
            mention_count: 1,
            sentiment: p.sentiment ?? 0,
            last_mentioned: Date.now(),
            tags: [],
          });
        } else if (dup) {
          dup.mention_count += 1;
          dup.last_mentioned = Date.now();
          if (typeof p.sentiment === 'number') dup.sentiment = p.sentiment;
        }
      }
    }

    const value_conflicts = Array.isArray(parsed.value_conflicts)
      ? [...memory.entities.value_conflicts, ...parsed.value_conflicts]
      : memory.entities.value_conflicts;

    return { persons: merged, value_conflicts: [...new Set(value_conflicts)] };
  } catch {
    // Entity extraction is best-effort; fall back to rule-based
    return {
      persons: extractPersonMentions(user_message, memory.entities.persons),
      value_conflicts: memory.entities.value_conflicts,
    };
  }
}

// ---------------------------------------------------------------
// Engine 6: Refutation — surface personality inference with evidence
// Triggers when: probe/pattern fires AND pnn_vector exists
// AND last refutation was ≥ 8 turns ago
// Returns: dimension, claim, evidence[] — caller builds prompt
// ---------------------------------------------------------------

function shouldSurfaceRefutation(
  memory: Memory,
): { trigger: boolean; dimension: string; claim: string; evidence: string[] } {
  const pnn = memory.pnn_vector;
  if (!pnn) return { trigger: false, dimension: '', claim: '', evidence: [] };

  // Cool-down: at most once every 8 turns
  const last_refute_idx = memory.conversation_history
    .slice()
    .reverse()
    .findIndex((t) => t.engine_triggered === 'refutation');
  if (last_refute_idx !== -1 && last_refute_idx < 8) {
    return { trigger: false, dimension: '', claim: '', evidence: [] };
  }

  // Pick the dimension with the longest evidence-gathering streak and lowest confidence
  // (prioritise dimensions that need calibration)
  const candidates: Array<{ dimension: string; score: number }> = [];
  for (const [key, raw] of Object.entries(pnn)) {
    const d = raw as { value: unknown; confidence: number; evidence_count: number };
    if (d.confidence < 0.75 && d.evidence_count >= 2) {
      candidates.push({ dimension: key, score: d.evidence_count / (d.confidence + 0.1) });
    }
  }

  if (candidates.length === 0) return { trigger: false, dimension: '', claim: '', evidence: [] };

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const dim = pnn[best.dimension as keyof typeof pnn] as { value: unknown; confidence: number };

  // Build a natural-language claim
  const CLAIM_TEMPLATES: Record<string, (v: unknown) => string> = {
    conflict_style:        (v) => `你在冲突中倾向于"${v}"——不是因为你没意见，而是行动成本比意见本身更高`,
    attachment_pattern:    (v) => `你的依恋模式接近"${v}"——你需要确认，但很少主动索取确认`,
    trust_threshold:       (v) => `你的信任阈值在 ${(Number(v) * 100).toFixed(0)}%——你信任，但有条件`,
    shame_sensitivity:     (v) => `你对羞耻感的敏感度偏高（${(Number(v) * 100).toFixed(0)}%）——被否定的感觉对你的影响比你承认的更大`,
    cognitive_rigidity:    (v) => `你的认知弹性中等——你能接受新信息，但改变信念需要的证据比一般人多`,
    self_disclosure_depth: (v) => `你的自我披露深度偏低（${(Number(v) * 100).toFixed(0)}%）——你分享事实，但很少分享意义`,
    growth_orientation:    (v) => `你的成长导向分数是 ${(Number(v) * 100).toFixed(0)}%——你想改变，但改变的节奏比你期待的慢`,
  };

  const template = CLAIM_TEMPLATES[best.dimension];
  if (!template) return { trigger: false, dimension: '', claim: '', evidence: [] };

  const claim = template(dim.value);

  // Collect evidence from recent chat and patterns
  const evidence: string[] = [];
  const recent_diary = memory.diary_entries.slice(-3);
  for (const d of recent_diary) {
    evidence.push(...d.patterns.slice(0, 2));
  }
  const recent_user_msgs = memory.conversation_history
    .filter((t) => t.role === 'user')
    .slice(-6)
    .map((t) => `"${t.content.slice(0, 50)}${t.content.length > 50 ? '…' : ''}"`)
    .slice(0, 2);
  evidence.push(...recent_user_msgs);

  return {
    trigger: true,
    dimension: best.dimension,
    claim,
    evidence: evidence.slice(0, 4),
  };
}

// ---------------------------------------------------------------
// Engine 7: Time Capsule — surface past contradicting quote
// Delegates detection to memory module
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// Refutation response parser
// Detects if prior turn was a refutation question and user just answered it.
// Patterns: "准" / "不准" / "部分准" / "对" / "不对" / "差不多" etc.
// ---------------------------------------------------------------

const REFUTATION_AGREE_PATTERNS    = /^(准|对|是|没错|说得准|完全准|确实|就是这样|嗯对|算准)/;
const REFUTATION_DISAGREE_PATTERNS = /^(不准|不对|不是|错了|不太准|不全是|完全不准|不一样)/;
const REFUTATION_PARTIAL_PATTERNS  = /^(部分|差不多|有点|一半|还好|说得不全|有些对|有些不|算是|大概)/;

function parseRefutationResponse(
  user_message: string,
): import('../shared/types').RefutationResponse | null {
  const msg = user_message.trim();
  if (REFUTATION_AGREE_PATTERNS.test(msg))    return 'agree';
  if (REFUTATION_DISAGREE_PATTERNS.test(msg)) return 'disagree';
  if (REFUTATION_PARTIAL_PATTERNS.test(msg))  return 'partial';
  return null;
}

/**
 * If the previous EVA turn was a refutation question, parse user's current
 * message as a refutation response and update memory accordingly.
 */
function tryHandleRefutationResponse(
  memory: Memory,
  user_message: string,
): Memory {
  // Find last EVA turn
  const history = memory.conversation_history;
  const last_ather = [...history].reverse().find((t) => t.role === 'eva');
  if (!last_ather || last_ather.engine_triggered !== 'refutation') return memory;

  // Parse user's response
  const response = parseRefutationResponse(user_message);
  if (!response) return memory; // unclear response, skip

  // Find the refutation entry that was just presented
  // (the most recent un-responded-to one — we match by timestamp proximity)
  const log = memory.refutation_log;
  const matching = [...log].reverse().find(
    (r) => r.timestamp >= last_ather.timestamp - 5000 && r.user_response === 'agree',
    // Note: we stored the entry when Engine 6 fired — we need to update it now
  );

  // Actually: Engine 6 doesn't store a refutation entry when it fires (it only shows claim).
  // We need to store the response NOW. Dimension comes from last_ather's topic_tags[0].
  const dimension = last_ather.topic_tags?.[0] ?? '';
  if (!dimension) return memory;

  // Extract user nuance (anything after the rating keyword, e.g. "部分准，但不全是因为...")
  const nuance_match = user_message.match(/[，,。.]\s*(.{5,})/);
  const nuance = nuance_match ? nuance_match[1] : undefined;

  return recordRefutation(
    memory,
    dimension,
    '(see refutation log)',
    response,
    nuance,
  );
}

// ---------------------------------------------------------------
// Main: processChat
// Call this once per user message.
// Returns EVA's response + updated memory.
// ---------------------------------------------------------------

export async function processChat(req: ChatRequest): Promise<ChatResponse> {
  const { user_message, memory, llm_caller } = req;
  const locale: Locale = (req.locale ?? 'zh-CN') as Locale;
  let updated = { ...memory };

  // ── Step 1: Update quick state ──────────────────────────────
  const new_quick_state = updateQuickState(updated.quick_state, user_message);
  updated = { ...updated, quick_state: new_quick_state };

  // ── Step 1b: Close refutation loop ──────────────────────────
  // If last EVA turn was a refutation question, parse user's answer
  updated = tryHandleRefutationResponse(updated, user_message);

  // ── Step 2: Append user turn (provisional) ──────────────────
  const user_turn: ConversationTurn = {
    id: nextTurnId('user'),
    role: 'user',
    content: user_message,
    timestamp: Date.now(),
    topic_tags: new_quick_state.active_topics.slice(0, 3),
  };
  updated = appendTurn(updated, user_turn);

  // ── Step 3: Entity extraction (async, best-effort) ──────────
  const { persons, value_conflicts } = await tryExtractEntities(
    user_message, updated, llm_caller,
  );
  updated = {
    ...updated,
    entities: { ...updated.entities, persons, value_conflicts },
  };

  // ── Step 3b: Extract and store time capsules (Mechanism B) ──
  const new_capsules = extractTimeCapsules(updated, user_message);
  if (new_capsules.length > 0) {
    updated = addTimeCapsules(updated, new_capsules);
  }

  // ── Step 4: Select engine ───────────────────────────────────
  let engine_used: ChatEngineType | null = null;
  let refutation_dimension = '';  // carries dimension name for EVA turn tagging
  let llm_params: { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> };

  // Engine 3: Check-in (first message of day)
  if (isFirstMessageOfDay(memory)) {
    engine_used = 'checkin';
    llm_params = buildCheckinPrompt(updated, locale);
  }
  // Engine 7: Time Capsule (surface past contradicting quote)
  else {
    const capsule = detectTimeCapsule(updated, user_message);
    if (capsule) {
      engine_used = 'timecapsule';
      llm_params = buildTimeCapsulePrompt(updated, user_message, capsule, locale);
      updated = markTimeCapsuleTriggered(updated, capsule.id);
    }
    // Engine 1: Probe (contradiction / repeat topic)
    else {
      const probe = shouldProbe(updated, user_message);
      if (probe.trigger) {
        // Engine 6: Refutation — surface an evidence-backed personality claim
        const refutation = shouldSurfaceRefutation(updated);
        if (refutation.trigger) {
          engine_used = 'refutation';
          refutation_dimension = refutation.dimension; // tag for EVA turn
          llm_params = buildRefutationPrompt(
            updated, user_message, refutation.dimension, refutation.claim, refutation.evidence, locale,
          );
        } else {
          engine_used = 'probe';
          llm_params = buildProbePrompt(updated, user_message, probe.hint, locale);
        }
      }
      // Engine 5: Pattern detection (mid-chat vector contradiction)
      else if (shouldDetectPattern(updated)) {
        engine_used = 'pattern';
        llm_params = buildPatternDetectionPrompt(updated, user_message, locale);
      }
      // Engine 2: Extend (short closing message → deepen)
      else {
        const extend = shouldExtend(updated, user_message);
        if (extend.trigger) {
          engine_used = 'extend';
          llm_params = buildExtendPrompt(updated, user_message, extend.topic, locale);
        }
        // Default: normal chat
        else {
          llm_params = buildChatPrompt(updated, user_message, locale);
        }
      }
    }
  }

  // ── Step 5: LLM call ────────────────────────────────────────
  const eva_message = await llm_caller({
    system: llm_params.system,
    messages: llm_params.messages,
    max_tokens: 300,
    temperature: 0.75,
  });

  // ── Step 6: Append EVA turn ───────────────────────────────
  const eva_turn: ConversationTurn = {
    id: nextTurnId('eva'),
    role: 'eva',
    content: eva_message,
    timestamp: Date.now(),
    engine_triggered: engine_used ?? undefined,
    // Store refutation dimension so next user turn can close the loop
    topic_tags: refutation_dimension ? [refutation_dimension] : undefined,
  };
  updated = appendTurn(updated, eva_turn);

  // ── Step 7: Build diary entry (append to today's) ───────────
  const today_str = new Date().toISOString().slice(0, 10);
  const existing_today = updated.diary_entries.find((d) => d.date === today_str);

  let diary_update: DiaryEntry | undefined;

  if (!existing_today) {
    // Create new diary entry for today
    const new_entry = buildDiaryEntry(
      updated.conversation_history,
      updated.quick_state,
      updated.entities.persons,
    );
    updated = {
      ...updated,
      diary_entries: [...updated.diary_entries, new_entry],
    };
    diary_update = new_entry;
  } else {
    // Merge today's events into existing entry (simple append of new emotion/pattern)
    const new_events = buildDiaryEntry(
      updated.conversation_history.slice(-4),
      updated.quick_state,
      updated.entities.persons,
    );
    const merged: DiaryEntry = {
      ...existing_today,
      events: [...existing_today.events, ...new_events.events].slice(0, 20),
      emotions: new_events.emotions.length > 0
        ? new_events.emotions
        : existing_today.emotions,
      patterns: [...new Set([...existing_today.patterns, ...new_events.patterns])],
      raw_user_messages: [
        ...existing_today.raw_user_messages,
        user_message,
      ].slice(-30),
    };
    updated = {
      ...updated,
      diary_entries: updated.diary_entries.map((d) =>
        d.date === today_str ? merged : d,
      ),
    };
diary_update = merged;
  }

  // ── Step 8: Update UBV from chat evidence ───────────────────
  // Apply inferred dimension updates from this turn
  const ubv = ensureUBV(updated);
  const ubv_updates = inferUBVUpdates(user_message, new_quick_state.active_topics);
  let updatedUBV = ubv;
  for (const { dimension, value } of ubv_updates) {
    updatedUBV = updateUBVFromSource(updatedUBV, dimension, value, 'chat');
  }
  // Sync quickState into UBV
  updatedUBV = updateUBVQuickState(
    updatedUBV,
    new_quick_state.active_topics,
    new_quick_state.mention_counts,
  );
  // Update mood if detected
  if (new_quick_state.recent_mood) {
    updatedUBV = updateUBVMood(updatedUBV, new_quick_state.recent_mood, new_quick_state.mood_intensity);
  }
  updatedUBV = {
    ...updatedUBV,
    meta: { ...updatedUBV.meta, total_turns: updatedUBV.meta.total_turns + 1, last_active: Date.now() },
  };

  // ── Step 9: YouShifted detection (RCI > 1.96) ───────────────
  // Cooldown: at least 20 turns between triggers (prevents spam)
  const lastYS = memory.meta.last_youshifted_turn ?? 0;
  const turnsSinceYS = updatedUBV.meta.total_turns - lastYS;
  let you_shifted: YouShifted | undefined;
  // Only fire after ≥7 turns AND cooldown elapsed AND baseline exists
  if (updatedUBV.meta.total_turns >= 7 && turnsSinceYS >= 20 && updated.baseline_ubv) {
    const shifted = detectYouShifted(
      updatedUBV,
      updated.baseline_ubv,
      req.locale ?? 'zh-CN',
      req.recent_corrections ?? [],
    );
    if (shifted) {
      you_shifted = shifted;
    }
  }

  updated = { ...updated, ubv: updatedUBV };
  if (you_shifted) {
    updated = { ...updated, meta: { ...updated.meta, last_youshifted_turn: updatedUBV.meta.total_turns } };
  }

  // ── Step 10: Dialogue state advance (Phase 3 state machine) ───
  // Reconstruct previous dialogue state from meta or create fresh
  const prev_state: DialogueState = (updated.meta as { dialogue_state?: DialogueState }).dialogue_state
    ?? {
      phase: 'probing',
      evidence_count: 0,
      closed_dimensions: [],
      turn_in_phase: 0,
      total_turns: memory.meta.total_turns,
      max_turns: 8,
      micro_test_pending: false,
      last_probe_hint: '',
    };
  const evidence_gained = ubv_updates.length > 0 && ubv_updates.some(u => Math.abs(u.value - 50) > 5);
  const updated_state = advanceDialogueState(prev_state, { evidence_gained });
  const meta_with_state = { ...updated.meta, dialogue_state: updated_state };

  return {
    eva_message,
    engine_used,
    updated_memory: { ...updated, meta: meta_with_state },
    you_shifted,
    updated_state,
  };
}

// ---------------------------------------------------------------
// Engine 4: Generate weekly review (call separately, not per-turn)
// ---------------------------------------------------------------

export async function generateWeeklyReview(
  memory: Memory,
  llm_caller: ChatRequest['llm_caller'],
): Promise<Memory> {
  const scaffold = buildWeeklySummaryScaffold(memory.diary_entries);
  const { system, messages } = buildWeeklyReviewPrompt(memory, scaffold);

  const eva_message = await llm_caller({
    system,
    messages,
    max_tokens: 250,
    temperature: 0.7,
  });

  const full_summary = { ...scaffold, eva_message };
  return {
    ...memory,
    weekly_summaries: [...memory.weekly_summaries, full_summary],
  };
}

// ---------------------------------------------------------------
// Checkin: Generate EVA's first-message-of-day proactively
// (for push notification or app open trigger)
// ---------------------------------------------------------------

export async function generateCheckin(
  memory: Memory,
  llm_caller: ChatRequest['llm_caller'],
  locale: Locale = 'zh-CN',
): Promise<string> {
  const { system, messages } = buildCheckinPrompt(memory, locale);
  return llm_caller({ system, messages, max_tokens: 150, temperature: 0.8 });
}
