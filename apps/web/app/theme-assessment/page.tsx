'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  themeAssessmentApi,
  telemetryApi,
  type ThemeCoverageResponse,
  type ThemeLens,
  type ThemeRoundHistoryItem,
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
  const [error, setError] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const [showSupplement, setShowSupplement] = useState(false);
  const [supplementText, setSupplementText] = useState('');
  // 历史轮次：与 coverage 并行拉取，供选择页展示（对齐 Ather-ethan /profile 的历史区块）
  const [rounds, setRounds] = useState<ThemeRoundHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    if (!userId) {
      router.replace('/login?returnTo=%2Ftheme-assessment');
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        // 历史与 coverage 并行拉取；历史失败不影响主流程
        const [coverage, history] = await Promise.all([
          themeAssessmentApi.coverage(),
          themeAssessmentApi.history().catch(() => [] as ThemeRoundHistoryItem[]),
        ]);
        if (cancelled) return;
        setCoverage(coverage);
        setRounds(history);
        const savedRoundId = new URLSearchParams(window.location.search).get('roundId');
        if (savedRoundId) {
          const savedNext = await themeAssessmentApi.next(savedRoundId);
          if (cancelled) return;
          setRoundId(savedRoundId);
          if (savedNext.state === 'question') {
            setNext(savedNext);
          } else {
            const restored = savedNext.state === 'ready'
              ? await themeAssessmentApi.complete(savedRoundId)
              : await themeAssessmentApi.result(savedRoundId);
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
    setSubmitting(true);
    setError('');
    try {
      const started = await themeAssessmentApi.start({ theme, locale });
      setVisibleRoundId(started.round.id);
      setRoundId(started.round.id);
      setNext(started.next);
      setResult(null);
      setFreeText('');
      setFeedbackStatus('');
      setShowSupplement(false);
      setSupplementText('');

      telemetryApi.emitEvent({
        eventId: `evt_${Date.now()}_start`,
        roundId: started.round.id,
        eventName: 'round_started',
        occurredAt: new Date().toISOString(),
        contentVersion: '1.0'
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法开始这一轮测试。');
    } finally {
      setSubmitting(false);
    }
  }

  async function answer(choiceId: 'A' | 'B' | 'C' | 'D') {
    if (!roundId || !next?.item_id || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const opId = operationId();
      const following = await themeAssessmentApi.answer(roundId, next.item_id, {
        operation_id: opId,
        choice_id: choiceId,
        free_text: freeText.trim() || undefined,
      });

      telemetryApi.emitEvent({
        eventId: `evt_${Date.now()}_ans_${next.item_id}`,
        roundId: roundId,
        eventName: 'answer_submitted',
        nodeId: next.item_id,
        choiceId: choiceId,
        occurredAt: new Date().toISOString(),
        contentVersion: '1.0'
      });

      setFreeText('');
      setNext(following);
      if (following.state === 'ready') {
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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存这次选择时出现问题。');
    } finally {
      setSubmitting(false);
    }
  }

  async function respond(
    action: 'confirm' | 'partial' | 'refute' | 'clarify',
    observationQuestionId?: string,  // P0-3：单条 observation 反馈；undefined = 整报告级
    explanation?: string
  ) {
    if (!roundId || submitting) return;
    const normalizedExplanation = explanation?.trim();
    if (action === 'clarify' && !normalizedExplanation) return;
    setSubmitting(true);
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
        setShowSupplement(false);
        setSupplementText('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存反馈失败。');
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionLoading || loading)
    return (
      <main className="report-loading">
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
        <section className="report-section">
          <h2>这轮具体看到了什么</h2>
          {portrait.observations.map((observation) => {
            const observationFeedback = result.observation_feedback?.[observation.evidence_question_id];
            return (
              <article key={observation.evidence_question_id} className="result-dim-card">
                <h3>{observation.focus}</h3>
                <p>{observationFeedback?.action === 'refute'
                  ? `${t('theme_round.observation_refuted_label')}：${observation.text}`
                  : observation.text}</p>
                {observationFeedback && (
                  <p className="report-detail" data-testid={`observation-feedback-${observation.evidence_question_id}`}>
                    {feedbackSummary(observationFeedback.action, true)}
                    {observationFeedback.state === 'needs_follow_up' && ' 这条先作为有争议的记录保留。'}
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
                </div>
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
          <button type="button" className="btn-primary" onClick={() => start()}>
            继续下一轮
          </button>
          <Link href="/profile" className="btn-secondary">
            查看多轮观察总览
          </Link>
        </div>
      </main>
    );
  }

  if (roundId && next?.state === 'question' && next.question) {
    const question = next.question;
    return (
      <main className="report-container theme-assessment-page">
        <header className="report-header">
          <p className="report-date">
            第 {next.decision_index ?? 1} 个决策点 · 本轮 6～8 个 · {question.context_label} ·{' '}
            {question.role === 'core'
              ? '核心情境'
              : question.role === 'counterexample'
                ? '反例追问'
                : '澄清追问'}
          </p>
          {next.selection?.status === 'targeted' && next.selection.target
            && question.question_id === next.selection.selected_question_id && (
            <p className="report-detail" role="status" data-testid="followup-selection-status">
              {next.selection.reason_zh} 本轮实际选中的问题：{question.focus_label}（{question.context_label}）。
              这表示已安排跟进，不代表异议已经解决。
            </p>
          )}
          {next.selection?.status === 'target_unavailable' && (
            <p className="report-detail" role="status" data-testid="followup-selection-unavailable">
              {next.selection.reason_zh} 当前题库没有可匹配的同焦点情境，本轮按普通主题继续；这条反馈仍未解决。
            </p>
          )}
          {next.selection?.status === 'theme_followup' && next.selection.target && (
            <p className="report-detail" role="status" data-testid="theme-followup-status">
              {next.selection.reason_zh} 本轮是主题级跟进，不针对某一条具体观察，也不代表异议已经解决。
            </p>
          )}
          <h1>{question.focus_label}</h1>
          <p className="report-description">{question.prompt}</p>
        </header>
        <section className="report-section">
          <div className="choices">
            {question.options.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={submitting}
                onClick={() => answer(option.id)}
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
        </section>
      </main>
    );
  }

  return (
    <main className="report-container theme-assessment-page">
      <header className="report-header">
        <p className="report-date">连续主题测试</p>
        <h1>这一轮，你想先从哪里了解自己？</h1>
        <p className="report-description">
          每轮至少 6 个具体情境；必要时才增加最多 2 个澄清或反例追问。
        </p>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="report-section">
        <p>{coverage?.recommendation}</p>
        <div className="result-dim-grid">
          {coverage?.themes.map((theme) => (
            <article key={theme.theme_lens} className="result-dim-card">
              <h2>{theme.title}</h2>
              <p>{THEME_DESCRIPTIONS[theme.theme_lens]}</p>
              <p className="report-detail">已完成 {theme.completed_rounds} 轮</p>
              <button type="button" disabled={submitting} onClick={() => start(theme.theme_lens)}>
                从这个主题开始
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* ── 历史轮次 ──────────────────────────────────────────────
          数据源 GET /v1/assessment-rounds（与 Ather-ethan /profile 的
          themeRounds 区块同源同字段）。三个状态分支对齐原项目设计：
          needs_follow_up / whole_result_refuted / recorded。*/}
      {rounds.length > 0 && (
        <section className="report-section">
          <div className="theme-round-history-header">
            <h2>历史轮次</h2>
            <button
              type="button"
              className="theme-round-history-toggle"
              onClick={() => setShowHistory((v) => !v)}
              aria-expanded={showHistory}
            >
              {showHistory ? '收起' : `展开全部 ${rounds.length} 轮`}
            </button>
          </div>

          {(showHistory ? rounds : rounds.slice(0, 3)).map((round) => {
            const inProgress =
              round.status === 'in_progress' || round.status === 'ready_to_complete';
            return (
              <article key={round.id} className="evidence-node theme-round-history-item">
                <div className="evidence-node-meta">
                  <span className="evidence-node-source">{round.theme_title}</span>
                  <span>
                    {round.completed_at
                      ? new Date(round.completed_at).toLocaleDateString(locale)
                      : '进行中'}
                  </span>
                </div>

                {round.feedback_state === 'needs_follow_up' && (
                  <p className="report-detail theme-round-feedback">
                    {t('theme_round.historical_dispute_notice')}
                  </p>
                )}

                <p className="theme-round-headline">
                  {round.whole_result_refuted
                    ? t('theme_round.whole_refuted_heading')
                    : (round.headline ?? '本轮尚未完成。')}
                </p>

                <div
                  role={round.whole_result_refuted ? 'group' : undefined}
                  aria-label={
                    round.whole_result_refuted
                      ? t('theme_round.historical_result_label')
                      : undefined
                  }
                >
                  {round.whole_result_refuted && round.headline && (
                    <p className="report-detail">
                      {t('theme_round.historical_conclusion_label')}：{round.headline}
                    </p>
                  )}
                  {round.boundary && (
                    <p className="report-detail theme-round-boundary">{round.boundary}</p>
                  )}
                </div>

                {round.feedback_state === 'recorded' && (
                  <p className="report-detail theme-round-feedback">
                    {t('theme_round.feedback_recorded')}
                  </p>
                )}
                {round.feedback_state === 'needs_follow_up' && round.latest_feedback_action && (
                  <p className="report-detail theme-round-feedback">
                    {t('theme_round.feedback_follow_up')}
                  </p>
                )}

                {round.headline && (
                  <Link
                    href={`/theme-assessment?roundId=${encodeURIComponent(round.id)}`}
                    className="evidence-node-link"
                  >
                    查看本轮结果和反馈
                  </Link>
                )}
                {inProgress && (
                  <Link
                    href={`/theme-assessment?roundId=${encodeURIComponent(round.id)}`}
                    className="evidence-node-link"
                  >
                    继续未完成主题轮
                  </Link>
                )}
              </article>
            );
          })}

          {showHistory && rounds.length > 3 && (
            <p className="report-detail">仅显示最近 30 轮。</p>
          )}
        </section>
      )}
    </main>
  );
}
