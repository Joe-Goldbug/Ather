'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  themeAssessmentApi,
  telemetryApi,
  type ThemeCoverageResponse,
  type ThemeQuestion,
  type ThemeLens,
  type ThemeRoundNext,
  type ThemeRoundResultResponse,
} from '@/lib/api';
import { useLocale } from '../providers-impl';
import { useSession } from '@/hooks/useSession';

const THEME_DESCRIPTIONS: Record<ThemeLens, string> = {
  emotion: '看你如何被触发、表达、消化和恢复。',
  relationship: '看你如何靠近、信任、设边界和修复关系。',
  social: '看你如何参与群体、保护能量与处理拒绝。',
  workplace: '看你如何面对反馈、分歧、协作和压力。',
  self_evaluation: '看你如何要求自己、看待失败与面对不确定。',
};

const MIN_ACTION_FEEDBACK_MS = 700;

async function keepActionFeedbackVisible(startedAt: number) {
  const remainingMs = MIN_ACTION_FEEDBACK_MS - (Date.now() - startedAt);
  if (remainingMs > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, remainingMs));
  }
}

function operationId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `theme-round-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function feedbackSummary(action: 'confirm' | 'partial' | 'refute' | 'clarify', targeted = false) {
  const scope = targeted ? '这条观察' : '这轮观察';
  switch (action) {
    case 'confirm':
      return `你认为${scope}大致符合。`;
    case 'partial':
      return `你认为${scope}只符合部分情境。`;
    case 'refute':
      return `你认为${scope}不符合。`;
    case 'clarify':
      return '你补充了更多真实情境。';
  }
}

function setVisibleRoundId(roundId: string | null) {
  const url = new URL(window.location.href);
  if (roundId) url.searchParams.set('roundId', roundId);
  else url.searchParams.delete('roundId');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export default function ThemeAssessmentPage() {
  const { locale, t } = useLocale();
  const { user, loading: sessionLoading } = useSession();
  const userId = user?.id;
  const router = useRouter();
  const [coverage, setCoverage] = useState<ThemeCoverageResponse | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [next, setNext] = useState<ThemeRoundNext | null>(null);
  const [result, setResult] = useState<ThemeRoundResultResponse | null>(null);
  const [freeText, setFreeText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pendingTheme, setPendingTheme] = useState<ThemeLens | 'default' | null>(null);
  const [pendingChoiceId, setPendingChoiceId] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [pendingFeedbackTarget, setPendingFeedbackTarget] = useState<string | 'whole' | null>(null);
  const [error, setError] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const [showSupplement, setShowSupplement] = useState(false);
  const [supplementText, setSupplementText] = useState('');
  const [activeObservationClarifyId, setActiveObservationClarifyId] = useState<string | null>(null);
  const [observationClarifyText, setObservationClarifyText] = useState('');
  // 显式答题导航：选项只选中、点"下一题"才提交；支持上一题回看与改答案
  const [selectedChoice, setSelectedChoice] = useState<'A' | 'B' | 'C' | 'D' | null>(null);
  const [presented, setPresented] = useState<Array<{ item_id: string; question: ThemeQuestion }>>([]);
  const [savedAnswers, setSavedAnswers] = useState<Record<string, { choice_id: 'A' | 'B' | 'C' | 'D'; free_text?: string }>>({});
  const [viewIndex, setViewIndex] = useState(0);
  const [readyToGenerate, setReadyToGenerate] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    if (!userId) {
      router.replace('/login?returnTo=%2Ftheme-assessment');
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const coverage = await themeAssessmentApi.coverage();
        if (cancelled) return;
        if (!coverage || !Array.isArray(coverage.themes)) {
          throw new Error('主题测试服务返回的数据不完整，请确认 Web 正连接 EVA API。');
        }
        setCoverage(coverage);
        const savedRoundId = new URLSearchParams(window.location.search).get('roundId');
        if (savedRoundId) {
          const savedNext = await themeAssessmentApi.next(savedRoundId);
          if (cancelled) return;
          setRoundId(savedRoundId);
          if (savedNext.state === 'question') {
            setNext(savedNext);
            setPresented(
              savedNext.item_id && savedNext.question
                ? [{ item_id: savedNext.item_id, question: savedNext.question }]
                : []
            );
            setViewIndex(0);
          } else if (savedNext.state === 'ready') {
            // 恢复到"待生成洞察"状态：不自动 complete，由用户手动触发
            setReadyToGenerate(true);
          } else {
            const restored = await themeAssessmentApi.result(savedRoundId);
            if (cancelled) return;
            setResult(restored);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '暂时无法读取主题测试。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [router, sessionLoading, userId]);

  async function start(theme?: ThemeLens) {
    const startedAt = Date.now();
    setSubmitting(true);
    setPendingTheme(theme ?? 'default');
    setError('');
    try {
      const started = await themeAssessmentApi.start({ theme, locale });
      await keepActionFeedbackVisible(startedAt);
      setVisibleRoundId(started.round.id);
      setRoundId(started.round.id);
      setNext(started.next);
      setResult(null);
      setFreeText('');
      setFeedbackStatus('');
      setShowSupplement(false);
      setSupplementText('');
      setSelectedChoice(null);
      setSavedAnswers({});
      setViewIndex(0);
      setReadyToGenerate(false);
      setPresented(
        started.next.state === 'question' && started.next.item_id && started.next.question
          ? [{ item_id: started.next.item_id, question: started.next.question }]
          : []
      );

      telemetryApi.emitEvent({
        eventId: `evt_${Date.now()}_start`,
        roundId: started.round.id,
        eventName: 'round_started',
        occurredAt: new Date().toISOString(),
        contentVersion: '1.0'
      });
    } catch (err) {
      await keepActionFeedbackVisible(startedAt);
      setError(err instanceof Error ? err.message : '无法开始这一轮测试。');
    } finally {
      setPendingTheme(null);
      setSubmitting(false);
    }
  }

  function prefillFromSaved(index: number) {
    const entry = presented[index];
    const saved = entry ? savedAnswers[entry.item_id] : undefined;
    setSelectedChoice(saved?.choice_id ?? null);
    setFreeText(saved?.free_text ?? '');
  }

  function goPrev() {
    if (submitting || viewIndex <= 0) return;
    setViewIndex(viewIndex - 1);
    prefillFromSaved(viewIndex - 1);
    setError('');
  }

  async function goNext() {
    if (!roundId || submitting || !selectedChoice) return;
    const current = presented[viewIndex];
    if (!current) return;
    const choiceId = selectedChoice;
    const saved = savedAnswers[current.item_id];
    const trimmedText = freeText.trim();
    const unchanged =
      saved && saved.choice_id === choiceId && (saved.free_text ?? '') === trimmedText;

    // 已作答且未改动：在回看模式中向前翻页，不重复提交
    if (unchanged) {
      if (viewIndex < presented.length - 1) {
        setViewIndex(viewIndex + 1);
        prefillFromSaved(viewIndex + 1);
      } else {
        setReadyToGenerate(true);
      }
      return;
    }

    const startedAt = Date.now();
    setSubmitting(true);
    setPendingChoiceId(choiceId);
    setError('');
    try {
      const opId = operationId();
      const following = await themeAssessmentApi.answer(roundId, current.item_id, {
        operation_id: opId,
        choice_id: choiceId,
        free_text: trimmedText || undefined,
      });

      telemetryApi.emitEvent({
        eventId: `evt_${Date.now()}_ans_${current.item_id}`,
        roundId: roundId,
        eventName: 'answer_submitted',
        nodeId: current.item_id,
        choiceId: choiceId,
        occurredAt: new Date().toISOString(),
        contentVersion: '1.0'
      });

      await keepActionFeedbackVisible(startedAt);

      // 改核心题答案会使后续追问题与旧报告作废：截断其后的回看缓存
      const hadSaved = Boolean(saved);
      setSavedAnswers((prev) => ({
        ...prev,
        [current.item_id]: { choice_id: choiceId, free_text: trimmedText || undefined },
      }));
      setFreeText('');
      setSelectedChoice(null);

      if (following.state === 'ready') {
        setReadyToGenerate(true);
        setVisibleRoundId(roundId);
      } else if (following.state === 'question' && following.item_id && following.question) {
        const entry = { item_id: following.item_id, question: following.question };
        const base = hadSaved ? presented.slice(0, viewIndex + 1) : presented;
        const updated = base.some((p) => p.item_id === entry.item_id) ? base : [...base, entry];
        setPresented(updated);
        setNext(following);
        const idx = updated.findIndex((p) => p.item_id === entry.item_id);
        setViewIndex(idx >= 0 ? idx : updated.length - 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存这次选择时出现问题。');
    } finally {
      await keepActionFeedbackVisible(startedAt);
      setPendingChoiceId(null);
      setSubmitting(false);
    }
  }

  async function generateInsightReport() {
    if (!roundId || submitting) return;
    const startedAt = Date.now();
    setSubmitting(true);
    setError('');
    try {
      const completedResult = await themeAssessmentApi.complete(roundId);
      setVisibleRoundId(roundId);
      setResult(completedResult);
      telemetryApi.emitEvent({
        eventId: `evt_${Date.now()}_view`,
        roundId: roundId,
        eventName: 'result_viewed',
        occurredAt: new Date().toISOString(),
        contentVersion: '1.0'
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成结果报告时出现问题。');
    } finally {
      await keepActionFeedbackVisible(startedAt);
      setSubmitting(false);
    }
  }

  function backToReview() {
    setReadyToGenerate(false);
    const lastIndex = Math.max(presented.length - 1, 0);
    setViewIndex(lastIndex);
    prefillFromSaved(lastIndex);
  }

  async function respond(
    action: 'confirm' | 'partial' | 'refute' | 'clarify',
    observationQuestionId?: string,  // P0-3：单条 observation 反馈；undefined = 整报告级
    explanation?: string
  ) {
    if (!roundId || submitting) return;
    const normalizedExplanation = explanation?.trim();
    if (action === 'clarify' && !normalizedExplanation) return;
    const startedAt = Date.now();
    setSubmitting(true);
    setPendingFeedbackTarget(observationQuestionId ?? 'whole');
    setPendingTheme(null);
    setPendingChoiceId(null);
    setError('');
    try {
      const response = await themeAssessmentApi.respond(roundId, {
        operation_id: operationId(),
        action,
        explanation: normalizedExplanation,
        observation_question_id: observationQuestionId,
      });

      setResult((current) => current
        ? {
            ...current,
            feedback_state: response.feedback_state,
            whole_result_refuted: observationQuestionId
              ? current.whole_result_refuted
              : response.action === 'refute',
            latest_feedback: {
              response_id: response.response_id,
              action: response.action,
              explanation: response.explanation,
              observation_question_id: response.observation_question_id,
              state: response.state,
              created_at: response.created_at,
            },
            observation_feedback: observationQuestionId
              ? {
                  ...current.observation_feedback,
                  [observationQuestionId]: {
                    response_id: response.response_id,
                    action: response.action,
                    explanation: response.explanation,
                    observation_question_id: response.observation_question_id,
                    state: response.state,
                    created_at: response.created_at,
                  },
                }
              : current.observation_feedback,
          }
        : current);
      const feedbackTarget = observationQuestionId ? '这条观察' : '这份结果';
      setFeedbackStatus(
        action === 'clarify'
          ? '补充内容已保存，谢谢你把真实情况说得更清楚。'
          : action === 'confirm'
            ? `已记录：${feedbackTarget}大致符合你的真实情况。`
            : action === 'partial'
              ? `已记录：${feedbackTarget}只符合一部分。`
              : `已记录：${feedbackTarget}不太符合你的真实情况。`
      );
      setCoverage(null);
      void themeAssessmentApi.coverage().then(setCoverage).catch(() => setCoverage(null));
      if (action === 'clarify') {
        if (observationQuestionId) {
          setActiveObservationClarifyId(null);
          setObservationClarifyText('');
        } else {
          setShowSupplement(false);
          setSupplementText('');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存反馈失败。');
    } finally {
      await keepActionFeedbackVisible(startedAt);
      setPendingFeedbackTarget(null);
      setSubmitting(false);
    }
  }

  if (sessionLoading || loading)
    return (
      <main className="report-loading" role="status" aria-live="polite">
        <span className="action-loading-spinner" aria-hidden="true" />
        <p>正在准备你的主题测试…</p>
      </main>
    );
  if (!user) return null;

  if (result) {
    const portrait = result.result;
    return (
      <main className="report-container theme-assessment-page">
        <header className="report-header">
          <p className="report-date">{portrait.theme_title}</p>
          {result.feedback_state === 'needs_follow_up' && (
            <p className="report-detail">{t('theme_round.historical_dispute_notice')}</p>
          )}
          <h1>{result.whole_result_refuted ? t('theme_round.whole_refuted_heading') : portrait.headline}</h1>
        </header>
        <div role={result.whole_result_refuted ? 'group' : undefined}
          aria-label={result.whole_result_refuted ? t('theme_round.historical_result_label') : undefined}>
        {result.whole_result_refuted && (
          <p className="report-detail">{t('theme_round.historical_result_label')}</p>
        )}
        {result.whole_result_refuted && (
          <p className="report-detail">{t('theme_round.historical_conclusion_label')}：{portrait.headline}</p>
        )}
        <p className="report-description">{portrait.summary}</p>
        {portrait.guest_report && (
          <section className="report-section">
            <h2>这段故事里发生了什么</h2>
            <p>{portrait.guest_report.story_replay}</p>
            <div className="report-insight"><h3 className="insight-label">应对方式的主要作用</h3><p>{portrait.guest_report.benefits}</p></div>
            <div className="report-insight"><h3 className="insight-label">可能付出的潜在代价</h3><p>{portrait.guest_report.costs}</p></div>
            <div className="report-insight"><h3 className="insight-label">不同情境下的变化与例外</h3><p>{portrait.guest_report.exceptions}</p></div>
          </section>
        )}
        <section className="report-section">
          <h2>这轮具体看到了什么</h2>
          {portrait.observations.map((observation) => {
            const observationFeedback = result.observation_feedback?.[observation.evidence_question_id];
            const guestObservation = portrait.guest_report?.observations.find(
              (item) => item.id === observation.evidence_question_id
            );
            return (
              <article
                key={observation.evidence_question_id}
                className={`result-dim-card ${observationFeedback?.action === 'refute' ? 'result-dim-card--refuted' : ''}`}
              >
                <h3>{observation.focus}</h3>
                {observationFeedback?.action === 'refute' && (
                  <div
                    className="dispute-badge"
                    style={{
                      display: 'inline-block',
                      fontSize: '0.8rem',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: '#dc2626',
                      marginBottom: '8px',
                      fontWeight: 500,
                    }}
                  >
                    已提出异议 · 不作为无争议结论使用
                  </div>
                )}
                <p>{observationFeedback?.action === 'refute'
                  ? `${t('theme_round.observation_refuted_label')}：${observation.text}`
                  : observation.text}</p>
                {guestObservation?.evidence.length ? (
                  <details className="report-detail" style={{ marginTop: '8px' }}>
                    <summary>查看这条观察依据的情境选择</summary>
                    <ul>
                      {guestObservation.evidence.map((item) => (
                        <li key={item.node_id}>“{item.node_title}”：{item.choice_text}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {observationFeedback && (
                  <p className="report-detail" data-testid={`observation-feedback-${observation.evidence_question_id}`}>
                    {feedbackSummary(observationFeedback.action, true)}
                    {observationFeedback.state === 'needs_follow_up' && ' 这条先作为有争议的记录保留。'}
                  </p>
                )}
                {observationFeedback?.explanation && (
                  <p className="report-detail" style={{ fontStyle: 'italic', marginTop: '4px' }}>
                    你的说明：“{observationFeedback.explanation}”
                  </p>
                )}
                <div className="report-actions report-actions--per-observation">
                  <button type="button" disabled={submitting} onClick={() => respond('confirm', observation.evidence_question_id)}>
                    这条符合
                  </button>
                  <button type="button" disabled={submitting} onClick={() => respond('partial', observation.evidence_question_id)}>
                    部分符合
                  </button>
                  <button type="button" disabled={submitting} onClick={() => respond('refute', observation.evidence_question_id)}>
                    不太符合
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setActiveObservationClarifyId(
                        activeObservationClarifyId === observation.evidence_question_id ? null : observation.evidence_question_id
                      );
                      setObservationClarifyText('');
                    }}
                  >
                    补充说明
                  </button>
                </div>
                {activeObservationClarifyId === observation.evidence_question_id && (
                  <div className="supplement-input-area" style={{ marginTop: '12px' }}>
                    <label className="supplement-input-label" htmlFor={`supplement-${observation.evidence_question_id}`}>
                      补充这条观察的背景理由
                    </label>
                    <textarea
                      id={`supplement-${observation.evidence_question_id}`}
                      className="supplement-textarea"
                      value={observationClarifyText}
                      onChange={(event) => setObservationClarifyText(event.target.value)}
                      maxLength={1000}
                      rows={3}
                      disabled={submitting}
                      placeholder="例如：当时是因为对方不熟，不是没有精力；或在特定情境下才会这样。"
                    />
                    <div className="report-actions">
                      <button
                        type="button"
                        disabled={submitting || !observationClarifyText.trim()}
                        onClick={() => respond('clarify', observation.evidence_question_id, observationClarifyText)}
                      >
                        {submitting && pendingFeedbackTarget === observation.evidence_question_id && (
                          <span className="action-loading-spinner" aria-hidden="true" />
                        )}
                        {submitting && pendingFeedbackTarget === observation.evidence_question_id ? '正在提交…' : '提交说明'}
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          setActiveObservationClarifyId(null);
                          setObservationClarifyText('');
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
                {submitting && pendingFeedbackTarget === observation.evidence_question_id && (
                  <p className="action-loading" role="status" aria-live="polite">
                    <span className="action-loading-spinner" aria-hidden="true" />
                    正在保存这条观察的反馈…
                  </p>
                )}
              </article>
            );
          })}
        </section>
        <section className="report-section">
          <div className="report-insight">
            <h2 className="insight-label">这轮的优势</h2>
            <p>{portrait.strength}</p>
          </div>
          <div className="report-insight">
            <h2 className="insight-label">值得留意的代价</h2>
            <p>{portrait.watchout}</p>
          </div>
          <div className="report-insight">
            <h2 className="insight-label">情境差异</h2>
            <p>{portrait.counterevidence}</p>
          </div>
          <p className="report-detail">{portrait.boundary}</p>
        </section>
        {portrait.ai_insight && (
          <section className="report-section ai-insight-section">
            <div className="ai-insight-header">
              <h2 className="insight-label">AI 洞察参考</h2>
              <span className="ai-insight-badge">AI 生成</span>
            </div>
            {portrait.ai_insight.paragraphs.map((paragraph, index) => {
              const linkedObservations = paragraph.evidence_question_ids
                .map((qid) => portrait.observations.find((obs) => obs.evidence_question_id === qid))
                .filter(Boolean);
              return (
                <div key={index} className="ai-insight-paragraph">
                  <p>{paragraph.text}</p>
                  {linkedObservations.length > 0 && (
                    <p className="ai-insight-evidence">
                      证据：
                      {linkedObservations.map((obs, i) => (
                        <span key={i}>{i > 0 && '、'}{obs!.focus}</span>
                      ))}
                    </p>
                  )}
                </div>
              );
            })}
            <p className="ai-insight-disclaimer">{portrait.ai_insight.disclaimer}</p>
          </section>
        )}
        </div>
        <section className="report-section">
          <h2>这和你真实吗？</h2>
          <div className="report-actions">
            <button type="button" disabled={submitting} onClick={() => respond('confirm')}>
              大致符合
            </button>
            <button type="button" disabled={submitting} onClick={() => respond('partial')}>
              部分符合
            </button>
            <button type="button" disabled={submitting} onClick={() => respond('refute')}>
              不太符合
            </button>
            <button
              type="button"
              disabled={submitting}
              aria-expanded={showSupplement}
              onClick={() => {
                setShowSupplement(true);
                setFeedbackStatus('');
                setError('');
              }}
            >
              我想补充
            </button>
          </div>
          {submitting && pendingFeedbackTarget === 'whole' && (
            <p className="action-loading" role="status" aria-live="polite">
              <span className="action-loading-spinner" aria-hidden="true" />
              正在保存反馈…
            </p>
          )}
          {showSupplement && (
            <div className="supplement-input-area">
              <label className="supplement-input-label" htmlFor="theme-result-supplement">
                补充你的真实情况
              </label>
              <textarea
                id="theme-result-supplement"
                className="supplement-textarea"
                value={supplementText}
                onChange={(event) => setSupplementText(event.target.value)}
                maxLength={1000}
                rows={4}
                disabled={submitting}
                placeholder="例如：哪些地方不符合？真实情况是什么？有没有只在特定关系或压力下才会这样？"
              />
              <div className="report-actions">
                <button
                  type="button"
                  disabled={submitting || !supplementText.trim()}
                  onClick={() => respond('clarify', undefined, supplementText)}
                >
                  {submitting && <span className="action-loading-spinner" aria-hidden="true" />}
                  {submitting ? '正在提交…' : '提交补充'}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setShowSupplement(false);
                    setSupplementText('');
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}
          {(feedbackStatus || result.latest_feedback) && (
            <p role="status" className="feedback-restored">
              {feedbackStatus || (
                <>
                  {result.latest_feedback && feedbackSummary(result.latest_feedback.action, Boolean(result.latest_feedback.observation_question_id))}
                  {result.latest_feedback?.explanation && ` ${result.latest_feedback.explanation}`}
                </>
              )}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
        {(feedbackStatus || result.latest_feedback) && coverage?.recommendation && (
          <p className="report-detail" data-testid="next-round-recommendation">
            下一轮建议：{coverage.themes.find((theme) => theme.theme_lens === coverage.recommended_theme)?.title ?? '继续核对'}。
            {coverage.recommendation}
            {coverage.recommendation_target && (
              <> 当前优先跟进：{portrait.observations.find(
                (observation) => observation.evidence_question_id === coverage.recommendation_target?.observation_question_id,
              )?.focus ?? (coverage.recommendation_target.observation_question_id ? '其他轮次的具体观察' : '整体反馈')}。开始时会再次确认反馈是否仍有效。</>
            )}
          </p>
        )}
        <div className="report-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={submitting}
            aria-busy={submitting && pendingTheme === 'default'}
            onClick={() => start()}
          >
            {submitting && pendingTheme === 'default' && <span className="action-loading-spinner" aria-hidden="true" />}
            {submitting && pendingTheme === 'default' ? '正在准备下一轮…' : '继续下一轮'}
          </button>
          <Link href="/profile" className="btn-secondary">
            查看多轮观察总览
          </Link>
        </div>
      </main>
    );
  }

  if (roundId && !readyToGenerate && !result && presented.length > 0 && presented[viewIndex]) {
    const current = presented[viewIndex]!;
    const question = current.question;
    const saved = savedAnswers[current.item_id];
    // 实时未答题优先展示 API 的序号（刷新恢复后 viewIndex 会重置）
    const displayIndex =
      next?.state === 'question' && next.item_id === current.item_id && next.decision_index
        ? next.decision_index
        : viewIndex + 1;
    return (
      <main className="report-container theme-assessment-page">
        <header className="report-header">
          <p className="report-date">
            第 {displayIndex} 个决策点 · 本轮 6～8 个 · {question.context_label} ·{' '}
            {question.role === 'core'
              ? '核心情境'
              : question.role === 'counterexample'
                ? '反例追问'
                : '澄清追问'}
            {saved ? ' · 已作答，可修改后重新提交' : ''}
          </p>
          {next?.selection?.status === 'targeted' && next.selection.target
            && question.question_id === next.selection.selected_question_id && (
            <p className="report-detail" role="status" data-testid="followup-selection-status">
              {next.selection.reason_zh} 本轮实际选中的问题：{question.focus_label}（{question.context_label}）。
              这表示已安排跟进，不代表异议已经解决。
            </p>
          )}
          {next?.selection?.status === 'target_unavailable' && (
            <p className="report-detail" role="status" data-testid="followup-selection-unavailable">
              {next.selection.reason_zh} 当前题库没有可匹配的同焦点情境，本轮按普通主题继续；这条反馈仍未解决。
            </p>
          )}
          {next?.selection?.status === 'theme_followup' && next.selection.target && (
            <p className="report-detail" role="status" data-testid="theme-followup-status">
              {next.selection.reason_zh} 本轮是主题级跟进，不针对某一条具体观察，也不代表异议已经解决。
            </p>
          )}
          <h1>{question.focus_label}</h1>
          <p className="report-description">{question.prompt}</p>
        </header>
        <section className="report-section">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="choices">
            {question.options.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={submitting}
                aria-pressed={selectedChoice === option.id}
                className={selectedChoice === option.id ? 'choice-selected' : undefined}
                onClick={() => setSelectedChoice(option.id)}
              >
                <strong className="choice-key">{option.id}.</strong>
                <span className="choice-text">{option.text}</span>
              </button>
            ))}
          </div>
          <label className="report-detail" htmlFor="theme-round-context">
            如果愿意，可以说说你为什么会这样选，或当时发生了什么。细节越具体，接下来的问题就越贴近你的真实情况。
          </label>
          <textarea
            id="theme-round-context"
            value={freeText}
            onChange={(event) => setFreeText(event.target.value)}
            maxLength={500}
            placeholder="可选：这件事发生在什么关系、什么时间或什么压力下？"
          />
          <div className="question-nav">
            <button
              type="button"
              className="btn-secondary"
              disabled={submitting || viewIndex === 0}
              onClick={goPrev}
            >
              上一题
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={submitting || !selectedChoice}
              aria-busy={submitting}
              onClick={goNext}
            >
              {submitting && pendingChoiceId ? (
                <>
                  <span className="action-loading-spinner" aria-hidden="true" />
                  正在保存这一题的回答…
                </>
              ) : (
                '下一题'
              )}
            </button>
          </div>
          {submitting && !pendingChoiceId && (
            <p className="action-loading" role="status" aria-live="polite">
              <span className="action-loading-spinner" aria-hidden="true" />
              正在生成结果报告…
            </p>
          )}
        </section>
      </main>
    );
  }

  if (roundId && readyToGenerate && !result) {
    return (
      <main className="report-container theme-assessment-page">
        <header className="report-header">
          <p className="report-date">本轮作答完成</p>
          <h1>准备生成这一轮的观察报告</h1>
          <p className="report-description" data-testid="ready-summary">
            你已完成 {Object.keys(savedAnswers).length} 个决策点。生成洞察需要几秒钟；
            报告里的每条观察都能回看情境依据，也支持纠错。
          </p>
        </header>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="report-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={submitting}
            aria-busy={submitting}
            data-testid="generate-insight"
            onClick={generateInsightReport}
          >
            {submitting ? (
              <>
                <span className="action-loading-spinner" aria-hidden="true" />
                正在生成结果报告…
              </>
            ) : (
              '生成洞察报告'
            )}
          </button>
          <button type="button" className="btn-secondary" disabled={submitting} onClick={backToReview}>
            返回检查答案
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="report-container theme-assessment-page">
      <header className="report-header">
        <p className="report-date">连续主题测试</p>
        <h1>这一轮，你想先从哪里了解自己？</h1>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="report-section">
        {coverage?.recommendation && <p className="report-detail theme-recommendation-note">{coverage.recommendation}</p>}
        <div className="result-dim-grid theme-selection-grid">
          {coverage?.themes.map((theme) => (
            <article key={theme.theme_lens} className="result-dim-card theme-selection-card">
              <div className="theme-card-main">
                <h2>{theme.title}</h2>
                <p>{THEME_DESCRIPTIONS[theme.theme_lens]}</p>
              </div>
              <div className="theme-card-footer">
                <span className="report-detail theme-card-rounds">已完成 {theme.completed_rounds} 轮</span>
                <button
                  type="button"
                  disabled={submitting}
                  aria-busy={submitting && pendingTheme === theme.theme_lens}
                  onClick={() => start(theme.theme_lens)}
                >
                  {submitting && pendingTheme === theme.theme_lens && <span className="action-loading-spinner" aria-hidden="true" />}
                  {submitting && pendingTheme === theme.theme_lens ? '正在准备题目…' : '从这个主题开始'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
