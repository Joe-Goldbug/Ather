'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/hooks/useSession';
import {
  guestAssessmentApi,
  type GuestAnswer,
  type GuestChapterRecord,
  type GuestOpening,
} from '@/lib/api';
import {
  clearGuestData,
  loadClaimToken,
  loadGuestSession,
  saveClaimToken,
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
}): GuestChapterRecord {
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
  };
}

export default function PlayPage() {
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

  useEffect(() => {
    if (authLoading || initialized.current) return;
    initialized.current = true;

    async function restore() {
      const token = loadClaimToken();
      if (user && token) {
        try {
          const claimed = await guestAssessmentApi.claim({ claim_token: token });
          setResult(claimedRecord(claimed.result));
          setSaved(true);
          clearGuestData();
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
  }, [authLoading, user]);

  async function startOpening() {
    const startedAt = Date.now();
    setSubmitting(true);
    setError('');
    try {
      const data = await guestAssessmentApi.getOpening();
      await keepChoiceFeedbackVisible(startedAt);
      setOpening(data);
      setAnswers([]);
      saveGuestSession({ adult_confirmed: true, opening: data, answers: [], pending_consequence: null });
    } catch {
      await keepChoiceFeedbackVisible(startedAt);
      setError('无法加载故事，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  async function claim(token: string) {
    const claimed = await guestAssessmentApi.claim({ claim_token: token });
    setResult(claimedRecord(claimed.result));
    setSaved(true);
    clearGuestData();
  }

  async function completeOpening(chapter: GuestOpening, completedAnswers: GuestAnswer[]) {
    setSubmitting(true);
    setError('');
    try {
      const completed = await guestAssessmentApi.complete(completionBody(chapter, completedAnswers));
      setResult(completed.result);
      saveClaimToken(completed.claim_token);
      if (user) await claim(completed.claim_token);
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
      <main className="report-container theme-assessment-page">
        <header className="report-header">
          <p className="report-date">第一章 · 雨停之前</p>
          <h1>直接进入一个共同任务</h1>
          <p className="report-description">约 4 至 6 分钟。没有正确答案，也不会给你贴人格标签。</p>
        </header>
        <section className="report-section">
          <h2>开始前确认</h2>
          <p>首版长期记录功能仅面向已满 18 岁的成年人。</p>
          <button
            type="button"
            className="btn-primary"
            disabled={submitting}
            aria-busy={submitting}
            onClick={startOpening}
          >
            {submitting && <span className="action-loading-spinner" aria-hidden="true" />}
            {submitting ? '正在准备…' : '我已满 18 岁，开始玩'}
          </button>
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  if (result) {
    return (
      <main className="report-container theme-assessment-page">
        <header className="report-header">
          <p className="report-date">{result.episode_title}</p>
          <h1>{result.summary}</h1>
          <p className="report-description">{result.pattern}</p>
        </header>
        <section className="report-section">
          <div className="report-insight"><h2 className="insight-label">保护了什么</h2><p>{result.benefits}</p></div>
          <div className="report-insight"><h2 className="insight-label">可能付出的代价</h2><p>{result.costs}</p></div>
          <div className="report-insight"><h2 className="insight-label">例外与矛盾</h2><p>{result.exceptions}</p></div>
          <p className="report-detail">{result.unknowns}</p>
          <p className="report-detail">这是模拟情境中的候选观察，不是诊断，也不是对你的永久定义。</p>
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
