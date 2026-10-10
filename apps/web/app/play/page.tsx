'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/hooks/useSession';
import {
  guestAssessmentApi,
  themeAssessmentApi,
  type GuestAnswer,
  type GuestChapterRecord,
  type GuestOpening,
} from '@/lib/api';
import {
  clearGuestData,
  clearGuestFeedback,
  loadClaimToken,
  loadGuestFeedbackByObservation,
  loadGuestSession,
  saveClaimToken,
  saveGuestFeedbackByObservation,
  saveGuestSession,
} from '@/lib/guest-assessment';

const MIN_CHOICE_FEEDBACK_MS = 700;

async function keepChoiceFeedbackVisible(startedAt: number) {
  const remainingMs = MIN_CHOICE_FEEDBACK_MS - (Date.now() - startedAt);
  if (remainingMs > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, remainingMs));
  }
}

function completionBody(opening: GuestOpening, answers: GuestAnswer[]) {
  return {
    guest_run_id: opening.guest_run_id,
    version: opening.episode_version,
    adult_confirmed: true as const,
    answers,
  };
}

function claimedRecord(result: {
  theme_title: string;
  headline: string;
  summary: string;
  strength: string;
  watchout: string;
  counterevidence: string;
  boundary: string;
  guest_report?: GuestChapterRecord;
}): GuestChapterRecord {
  if (result.guest_report) return result.guest_report;
  return {
    episode_id: 'rain-before-stop',
    episode_version: 'v1',
    episode_title: result.theme_title,
    evidence_kind: 'simulation',
    science_status: 'candidate_only',
    source_independence_group: 'simulation:rain-before-stop:v1',
    summary: result.headline,
    pattern: result.summary,
    benefits: result.strength,
    costs: result.watchout,
    exceptions: result.counterevidence,
    unknowns: result.boundary,
    story_replay: '',
    observations: [{
      id: 'guest:overall',
      title: '这次模拟中的主要做法',
      text: result.summary,
      evidence_node_ids: [],
      evidence: [],
      reflection_question: '这份观察符合现实中的你吗？',
    }],
  };
}

export default function PlayPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useSession();
  const initialized = useRef(false);
  const [opening, setOpening] = useState<GuestOpening | null>(null);
  const [answers, setAnswers] = useState<GuestAnswer[]>([]);
  const [result, setResult] = useState<GuestChapterRecord | null>(null);
  const [lastConsequence, setLastConsequence] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pendingChoiceId, setPendingChoiceId] = useState<GuestAnswer['choice_id'] | null>(null);
  const [feedbackByObservation, setFeedbackByObservation] = useState<Record<string, { action: 'confirm' | 'partial' | 'dispute'; note: string }>>({});

  useEffect(() => {
    if (authLoading || initialized.current) return;
    initialized.current = true;

    async function restore() {
      const savedFeedback = loadGuestFeedbackByObservation();
      setFeedbackByObservation(savedFeedback);

      const token = loadClaimToken();
      if (user && token) {
        try {
          const claimed = await claim(token, savedFeedback);
          setResult(claimedRecord(claimed.result));
          setSaved(true);
          clearGuestData();
          clearGuestFeedback();
          router.replace('/profile');
          setLoading(false);
          return;
        } catch {
          setError('保存暂时失败。你的本地记录仍在，可以稍后重试。');
        }
      }

      const session = loadGuestSession();
      if (!session) {
        setLoading(false);
        return;
      }
      setOpening(session.opening);
      setAnswers(session.answers);
      setLastConsequence(session.pending_consequence);
      if (session.answers.length === session.opening.nodes.length) {
        await completeOpening(session.opening, session.answers);
      }
      setLoading(false);
    }

    void restore();
  }, [authLoading, router, user]);

  function updateFeedback(observationId: string, action: 'confirm' | 'partial' | 'dispute', note: string) {
    const next = { ...feedbackByObservation, [observationId]: { action, note } };
    setFeedbackByObservation(next);
    saveGuestFeedbackByObservation(next);
  }

  async function startOpening() {
    const startedAt = Date.now();
    setSubmitting(true);
    setError('');
    try {
      const data = await guestAssessmentApi.getOpening();
      await keepChoiceFeedbackVisible(startedAt);
      setOpening(data);
      setAnswers([]);
      setFeedbackByObservation({});
      clearGuestFeedback();
      saveGuestSession({ adult_confirmed: true, opening: data, answers: [], pending_consequence: null });
    } catch {
      await keepChoiceFeedbackVisible(startedAt);
      setError('无法加载故事，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  async function claim(token: string, feedback = feedbackByObservation) {
    const claimed = await guestAssessmentApi.claim({ claim_token: token });
    const runId = opening?.guest_run_id ?? loadGuestSession()?.opening.guest_run_id ?? 'restored';
    for (const [observationId, item] of Object.entries(feedback)) {
      await themeAssessmentApi.respond(claimed.round_id, {
        operation_id: `guest-feedback:${runId}:${observationId}`,
        action: item.action === 'dispute' ? 'refute' : item.action,
        explanation: item.note || undefined,
        observation_question_id: observationId === 'guest:overall' ? undefined : observationId,
      });
    }
    setResult(claimedRecord(claimed.result));
    setSaved(true);
    clearGuestData();
    clearGuestFeedback();
    return claimed;
  }

  async function completeOpening(chapter: GuestOpening, completedAnswers: GuestAnswer[]) {
    setSubmitting(true);
    setError('');
    try {
      const completed = await guestAssessmentApi.complete(completionBody(chapter, completedAnswers));
      setResult(completed.result);
      saveClaimToken(completed.claim_token);
      if (user) {
        await claim(completed.claim_token);
        router.replace('/profile');
      }
    } catch {
      setError('结算或保存暂时失败。你的选择仍保存在这个浏览器中。');
    } finally {
      setSubmitting(false);
    }
  }

  async function choose(nodeId: string, choiceId: GuestAnswer['choice_id'], consequence: string) {
    if (!opening || submitting || opening.nodes[answers.length]?.id !== nodeId) return;
    const startedAt = Date.now();
    const nextAnswers = [...answers, { node_id: nodeId, choice_id: choiceId }];
    setSubmitting(true);
    setPendingChoiceId(choiceId);
    setError('');
    try {
      saveGuestSession({
        adult_confirmed: true,
        opening,
        answers: nextAnswers,
        pending_consequence: consequence,
      });
      await keepChoiceFeedbackVisible(startedAt);
      setAnswers(nextAnswers);
      setLastConsequence(consequence);
      if (nextAnswers.length === opening.nodes.length) {
        await completeOpening(opening, nextAnswers);
      } else {
        setSubmitting(false);
      }
    } catch {
      setError('记录这个选择时出现问题，请重试。');
      setSubmitting(false);
    } finally {
      setPendingChoiceId(null);
    }
  }

  if (authLoading || loading) {
    return <main className="report-loading"><p>加载中…</p></main>;
  }

  if (!opening && !result) {
    return (
      <main className="container play-intro-page">
        <section className="play-intro">
          <p className="play-intro-chapter">第一章 · 雨停之前</p>
          <h1 className="play-intro-title">直接进入一个共同任务</h1>
          <p className="play-intro-desc">
            约 4 至 6 分钟。没有正确答案，也不会给你贴人格标签。
          </p>
          <div className="play-intro-actions">
            <button
              type="button"
              className="hero-cta play-intro-btn"
              disabled={submitting}
              aria-busy={submitting}
              onClick={startOpening}
            >
              {submitting && <span className="action-loading-spinner" aria-hidden="true" />}
              {submitting ? '正在准备…' : '进去情景'}
            </button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  if (result) {
    return (
      <main className="report-container theme-assessment-page">
        <header className="report-header">
          <p className="report-date">测验结果 · {result.episode_title}</p>
          <h1>{result.summary}</h1>
          <p className="report-description">{result.pattern}</p>
        </header>
        <section className="report-section">
          <h2>这次的你，怎样面对事情</h2>

          {result.observations.map((observation) => {
            const feedback = feedbackByObservation[observation.id];
            return <div
            key={observation.id}
            className="report-feedback-box"
            style={{
              marginTop: '1.5rem',
              padding: '1.25rem',
              border: '1px solid var(--border-light, #e5e7eb)',
              borderRadius: '12px',
              background: 'var(--card-bg, #ffffff)',
            }}
          >
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{observation.title}</h3>
            <p className="report-detail" style={{ marginBottom: '0.75rem', lineHeight: 1.6 }}>
              {observation.text}
            </p>
            <div
              className="feedback-btn-group"
              style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}
            >
              <button
                type="button"
                className="btn-secondary"
                aria-pressed={feedback?.action === 'confirm'}
                style={{
                  minHeight: '44px',
                  padding: '0.5rem 1rem',
                  fontWeight: feedback?.action === 'confirm' ? 600 : 400,
                  borderColor: feedback?.action === 'confirm' ? 'var(--accent-color, #171717)' : undefined,
                  backgroundColor: feedback?.action === 'confirm' ? 'var(--accent-light, #f5f5f5)' : undefined,
                }}
                onClick={() => updateFeedback(observation.id, 'confirm', feedback?.note ?? '')}
              >
                {feedback?.action === 'confirm' ? '✓ 像这次的我' : '像这次的我'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                aria-pressed={feedback?.action === 'partial'}
                style={{
                  minHeight: '44px',
                  padding: '0.5rem 1rem',
                  fontWeight: feedback?.action === 'partial' ? 600 : 400,
                  borderColor: feedback?.action === 'partial' ? 'var(--accent-color, #171717)' : undefined,
                  backgroundColor: feedback?.action === 'partial' ? 'var(--accent-light, #f5f5f5)' : undefined,
                }}
                onClick={() => updateFeedback(observation.id, 'partial', feedback?.note ?? '')}
              >
                {feedback?.action === 'partial' ? '✓ 有一部分像' : '有一部分像'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                aria-pressed={feedback?.action === 'dispute'}
                style={{
                  minHeight: '44px',
                  padding: '0.5rem 1rem',
                  fontWeight: feedback?.action === 'dispute' ? 600 : 400,
                  borderColor: feedback?.action === 'dispute' ? 'var(--accent-color, #171717)' : undefined,
                  backgroundColor: feedback?.action === 'dispute' ? 'var(--accent-light, #f5f5f5)' : undefined,
                }}
                onClick={() => updateFeedback(observation.id, 'dispute', feedback?.note ?? '')}
              >
                {feedback?.action === 'dispute' ? '✓ 这里说得不对' : '这里说得不对'}
              </button>
            </div>
            <p className="report-detail" style={{ marginBottom: '0.5rem' }}>{observation.reflection_question}</p>
            {observation.evidence.length > 0 && (
              <details className="report-detail" style={{ marginBottom: '0.75rem' }}>
                <summary>查看这条观察依据的情境选择</summary>
                <ul>
                  {observation.evidence.map((item) => <li key={item.node_id}>“{item.node_title}”：{item.choice_text}</li>)}
                </ul>
              </details>
            )}
            {feedback && (
              <div style={{ marginTop: '8px' }}>
                <p className="report-detail" style={{ color: feedback.action === 'dispute' ? '#dc2626' : 'inherit' }}>
                  {feedback.action === 'confirm' && '已记下：这条像你这次的反应。'}
                  {feedback.action === 'partial' && '已记下：这条只说中了你的一部分。'}
                  {feedback.action === 'dispute' && '已记下：这条需要重新理解，登录保存后会保留你的异议。'}
                </p>
                <div style={{ marginTop: '6px' }}>
                  <input
                    type="text"
                    aria-label="补充真实原因或不同看法"
                    value={feedback.note}
                    maxLength={500}
                    onChange={(e) => updateFeedback(observation.id, feedback.action, e.target.value)}
                    placeholder="选填：补充你这样处理的真实原因或不同看法…"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '1rem',
                      lineHeight: 1.5,
                      borderRadius: '6px',
                      border: '1px solid var(--border-light, #d1d5db)',
                      background: 'transparent',
                      color: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            )}
          </div>;
          })}
          {result.story_replay && (
            <details className="report-detail" style={{ marginTop: '1.5rem' }}>
              <summary>回看我在这段故事里的全部选择</summary>
              <p>{result.story_replay}</p>
            </details>
          )}
          <p className="report-detail" style={{ marginTop: '1rem' }}>{result.unknowns}</p>
        </section>
        <section className="report-section">
          {saved ? (
            <>
              <h2>本章记录已保存</h2>
              <Link href="/profile" className="btn-primary">进入个人主页</Link>
            </>
          ) : user ? (
            <>
              <h2>保存你的记录</h2>
              <button
                type="button"
                className="btn-primary"
                disabled={submitting || !loadClaimToken()}
                onClick={() => {
                  const token = loadClaimToken();
                  if (!token) return;
                  setSubmitting(true);
                  setError('');
                  void claim(token)
                    .catch(() => setError('保存暂时失败。你的本地记录仍在，可以稍后重试。'))
                    .finally(() => setSubmitting(false));
                }}
              >
                {submitting ? '正在保存…' : '重试保存'}
              </button>
            </>
          ) : (
            <>
              <h2>保存你的记录</h2>
              <p>登录后将本章测试结果关联至个人档案，并进入个人主页。</p>
              <Link href="/login?returnTo=%2Fplay" className="btn-primary">注册或登录并保存</Link>
            </>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  if (opening && answers.length === opening.nodes.length) {
    return (
      <main className="report-container theme-assessment-page">
        <section className="report-section">
          {submitting ? <p>正在整理本章…</p> : (
            <button type="button" className="btn-primary" onClick={() => void completeOpening(opening, answers)}>
              重试结算
            </button>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  const currentNode = opening!.nodes[answers.length];
  if (!currentNode) return null;

  return (
    <main className="report-container theme-assessment-page">
      <header className="report-header">
        <p className="report-date">第 {answers.length + 1} 个决策点 · 共 {opening!.nodes.length} 个</p>
        {lastConsequence && <p className="report-detail" role="status">上一步的影响：{lastConsequence}</p>}
        <h1>{currentNode.title}</h1>
        <p className="report-description">{currentNode.context}</p>
      </header>
      <section className="report-section">
        {submitting && pendingChoiceId && (
          <p className="action-loading" role="status" aria-live="polite">
            <span className="action-loading-spinner" aria-hidden="true" />
            正在记录选择并进入下一题…
          </p>
        )}
        <div className="choices">
          {currentNode.options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={submitting}
              aria-busy={pendingChoiceId === option.id}
              onClick={() => choose(currentNode.id, option.id, option.consequence)}
            >
              <span className="choice-text">
                {pendingChoiceId === option.id ? '正在记录并进入下一题…' : option.text}
              </span>
              {pendingChoiceId === option.id && <span className="action-loading-spinner" aria-hidden="true" />}
            </button>
          ))}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
