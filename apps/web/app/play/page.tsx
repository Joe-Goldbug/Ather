'use client';

// Anonymous assessment page.
//
// Ported from the original /play page. All session and claim behaviour
// has been removed: the run lives entirely in sessionStorage, and the result is
// shown in place. Wallet binding will re-enter at the `saved` branch later.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  guestAssessmentApi,
  type GuestAnswer,
  type GuestOpening,
} from '@/lib/api';
import { loadGuestSession, saveGuestSession } from '@/lib/guest-assessment';

function completionBody(opening: GuestOpening, answers: GuestAnswer[]) {
  return {
    guest_run_id: opening.guest_run_id,
    version: opening.episode_version,
    adult_confirmed: true as const,
    answers,
  };
}

export default function PlayPage() {
  const initialized = useRef(false);
  const [opening, setOpening] = useState<GuestOpening | null>(null);
  const [answers, setAnswers] = useState<GuestAnswer[]>([]);
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof guestAssessmentApi.complete>
  >['result'] | null>(null);
  const [pendingConsequence, setPendingConsequence] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Resume an in-progress run from sessionStorage.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    async function restore() {
      const session = loadGuestSession();
      if (!session) {
        setLoading(false);
        return;
      }
      setOpening(session.opening);
      setAnswers(session.answers);
      setPendingConsequence(session.pending_consequence);

      // All questions already answered — recompute the result.
      if (
        session.answers.length === session.opening.nodes.length &&
        !session.pending_consequence
      ) {
        try {
          const completed = await guestAssessmentApi.complete(
            completionBody(session.opening, session.answers),
          );
          setResult(completed.result);
        } catch {
          setError('恢复本章记录失败。你的选择仍保存在这个浏览器中。');
        }
      }
      setLoading(false);
    }

    void restore();
  }, []);

  async function startOpening() {
    setSubmitting(true);
    setError('');
    try {
      const data = await guestAssessmentApi.getOpening();
      setOpening(data);
      setAnswers([]);
      saveGuestSession({
        adult_confirmed: true,
        opening: data,
        answers: [],
        pending_consequence: null,
      });
    } catch {
      setError('无法加载故事，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  function choose(nodeId: string, choiceId: GuestAnswer['choice_id'], consequence: string) {
    if (!opening || submitting) return;
    const nextAnswers = [...answers, { node_id: nodeId, choice_id: choiceId }];
    setAnswers(nextAnswers);
    setPendingConsequence(consequence);
    saveGuestSession({
      adult_confirmed: true,
      opening,
      answers: nextAnswers,
      pending_consequence: consequence,
    });
  }

  async function continueAfterConsequence() {
    if (!opening || !pendingConsequence || submitting) return;
    setPendingConsequence(null);
    saveGuestSession({ adult_confirmed: true, opening, answers, pending_consequence: null });
    if (answers.length !== opening.nodes.length) return;

    setSubmitting(true);
    setError('');
    try {
      const completed = await guestAssessmentApi.complete(completionBody(opening, answers));
      setResult(completed.result);
    } catch {
      setError('结算暂时失败。你的选择仍保存在这个浏览器中。');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
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
          <p>首版仅面向已满 18 岁的成年人。</p>
          <button type="button" className="btn-primary" disabled={submitting} onClick={startOpening}>
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
          <h2>本章已完成</h2>
          <p>你的选择保存在这个浏览器里。清除浏览器数据会一并清除这份记录。</p>
          <button
            type="button"
            className="btn-primary"
            disabled={submitting}
            onClick={() => {
              setResult(null);
              setOpening(null);
              setAnswers([]);
              setPendingConsequence(null);
              window.sessionStorage.clear();
            }}
          >
            再玩一次
          </button>
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  if (pendingConsequence) {
    return (
      <main className="report-container theme-assessment-page">
        <header className="report-header">
          <p className="report-date">你的选择产生了变化</p>
          <h1>{pendingConsequence}</h1>
        </header>
        <section className="report-section">
          <button
            type="button"
            className="btn-primary"
            disabled={submitting}
            onClick={() => void continueAfterConsequence()}
          >
            {submitting ? '正在整理本章…' : answers.length === opening!.nodes.length ? '查看本章记录' : '继续'}
          </button>
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
        <h1>{currentNode.title}</h1>
        <p className="report-description">{currentNode.context}</p>
      </header>
      <section className="report-section">
        <div className="choices">
          {currentNode.options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={submitting}
              onClick={() => choose(currentNode.id, option.id, option.consequence)}
            >
              <span className="choice-text">{option.text}</span>
            </button>
          ))}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
