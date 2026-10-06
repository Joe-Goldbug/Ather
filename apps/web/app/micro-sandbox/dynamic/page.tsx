// apps/web/app/micro-sandbox/dynamic/page.tsx
//
// Dynamic-script flow page — wires the API client + hook to the three
// view components (InquiryView, ScriptPlayView, ScriptResultView).
//
// State machine summary:
//   idle      → textbox for initial scenario
//   inquiring → InquiryView
//   ready     → "generate" CTA
//   generating → progress UI with cancellation
//   playing   → ScriptPlayView
//   finished  → ScriptResultView
//   failed    → error UI

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from '../../providers-impl';
import { useSession } from '@/hooks/useSession';
import { useDynamicScriptSession } from '@/hooks/useDynamicScriptSession';
import { InquiryView } from '@/components/dynamic-script/inquiry-view';
import { ScriptPlayView } from '@/components/dynamic-script/script-play-view';
import { ScriptResultView } from '@/components/dynamic-script/script-result-view';
import type { Locale } from '@/lib/api-dynamic-script';

export default function DynamicScriptPage() {
  const { locale, t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: sessionLoading } = useSession();
  const session = useDynamicScriptSession();

  const [initialDraft, setInitialDraft] = useState('');
  const [startError, setStartError] = useState<string | null>(null);
  const [startSubmitting, setStartSubmitting] = useState(false);

  // Auto-resume a persisted in-progress session
  useEffect(() => {
    if (session.state.phase === 'idle' && !sessionLoading && user) {
      void session.refreshStatus();
    }
  }, [user, sessionLoading, session]);

  // Login guard
  useEffect(() => {
    if (sessionLoading) return;
    if (!user) router.replace('/login?returnTo=%2Fmicro-sandbox%2Fdynamic');
  }, [user, sessionLoading, router]);

  async function handleStart() {
    const text = initialDraft.trim();
    if (!text) return;
    setStartError(null);
    setStartSubmitting(true);
    try {
      await session.start(text, { locale: locale as Locale });
    } catch (err) {
      setStartError(err instanceof Error ? err.message : t('micro_sandbox.error_body'));
    } finally {
      setStartSubmitting(false);
    }
  }

  async function handleAbort() {
    try {
      setStartError(null);
      await session.abort('user_cancelled');
      router.push('/micro-sandbox');
    } catch (err) {
      setStartError(err instanceof Error && err.message === 'generation_cancel_not_confirmed'
        ? t('dynamic.cancel_not_confirmed')
        : err instanceof Error ? err.message : t('micro_sandbox.error_body'));
    }
  }

  // Loading
  if (sessionLoading) {
    return (
      <main className="report-loading" aria-busy="true">
        <p>{t('common.loading')}</p>
      </main>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <main className="report-error">
        <h1>{t('micro_sandbox.login_required_title')}</h1>
        <p>{t('micro_sandbox.login_required_body')}</p>
        <Link href="/login?returnTo=%2Fmicro-sandbox%2Fdynamic" className="btn-primary">
          {t('micro_sandbox.btn_login')}
        </Link>
      </main>
    );
  }

  // Reset the entry point when leaving via tab switch
  const returnToFixed = searchParams.get('return') !== 'dynamic';

  // ── Idle / Starting: present input (disabled while starting) ──
  if (session.state.phase === 'idle' || session.state.phase === 'starting') {
    const isStarting = session.state.phase === 'starting';
    return (
      <main className="report-container">
        <header className="report-header">
          <p className="report-date">{t('dynamic.intro_title')}</p>
          <h1>{t('dynamic.start_title')}</h1>
          <p className="report-summary">{t('dynamic.start_subtitle')}</p>
        </header>

        <section className="report-section">
          <textarea
            value={initialDraft}
            onChange={(e) => setInitialDraft(e.target.value)}
            placeholder={t('dynamic.start_placeholder')}
            rows={6}
            aria-label={t('dynamic.start_placeholder')}
            disabled={isStarting || startSubmitting}
            maxLength={2000}
          />
          <div className="inquiry-form__actions">
            <button
              type="button"
              className="btn-primary"
              onClick={handleStart}
              disabled={isStarting || startSubmitting || initialDraft.trim().length < 5}
              aria-busy={isStarting || startSubmitting}
            >
              {(isStarting || startSubmitting) && <span className="action-loading-spinner" aria-hidden="true" />}
              {isStarting || startSubmitting
                ? t('dynamic.start_in_progress')
                : t('dynamic.btn_start')}
            </button>
            <Link href="/micro-sandbox" className="btn-tertiary">
              {t('dynamic.btn_back_fixed')}
            </Link>
          </div>
          {(startError || session.state.error) && (
            <p className="report-error__body" role="alert">
              {startError || session.state.error}
            </p>
          )}
        </section>
      </main>
    );
  }

  // ── Inquiring: question + answer form ──
  if (session.state.phase === 'inquiring') {
    return (
      <InquiryView
        sessionId={session.state.sessionId ?? ''}
        currentQuestion={session.state.currentQuestion}
        progress={session.state.progress}
        estimatedTurnsRemaining={session.state.estimatedTurnsRemaining}
        submitting={session.state.answerSubmitting}
        error={session.state.error}
        onSubmit={(text) => session.answer(text)}
        onAbort={handleAbort}
        labels={{
          intro: t('dynamic.inquiry_intro'),
          submit: t('dynamic.btn_submit_answer'),
          submitLoading: t('dynamic.btn_submit_answer_loading'),
          placeholder: t('dynamic.inquiry_placeholder'),
          abort: t('dynamic.btn_abort'),
          turnsRemaining: (n) => t('dynamic.turns_remaining', { n }),
          errorBody: t('micro_sandbox.error_body'),
          progress: {
            scenario: t('dynamic.progress_scenario'),
            emotion: t('dynamic.progress_emotion'),
            background: t('dynamic.progress_background'),
            relationship: t('dynamic.progress_relationship'),
          },
        }}
      />
    );
  }

  // ── Ready: extracted vars + "generate" CTA ──
  if (session.state.phase === 'ready') {
    return (
      <main className="report-container">
        <header className="report-header">
          <p className="report-date">{t('dynamic.ready_intro')}</p>
          <h1>{t('dynamic.ready_title')}</h1>
          <p className="report-summary">{t('dynamic.ready_summary')}</p>
        </header>

        {session.state.extractedVariables && (
          <section className="report-section">
            <pre className="extracted-vars" aria-label="extracted-variables">
              {JSON.stringify(session.state.extractedVariables, null, 2)}
            </pre>
          </section>
        )}

        <div className="report-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => void session.complete()}
            disabled={session.state.completeSubmitting}
            aria-busy={session.state.completeSubmitting}
          >
            {session.state.completeSubmitting && <span className="action-loading-spinner" aria-hidden="true" />}
            {t(session.state.completeSubmitting ? 'dynamic.btn_generate_loading' : 'dynamic.btn_generate')}
          </button>
          <button type="button" className="btn-tertiary" onClick={handleAbort}>
            {t('dynamic.btn_abort')}
          </button>
        </div>
        {session.state.error && <p role="alert">{session.state.error}</p>}
      </main>
    );
  }

  // ── Generating: progress + cancel ──
  if (session.state.phase === 'generating') {
    const pct = session.state.generationProgress;
    return (
      <main className="report-container" aria-busy="true">
        <header className="report-header">
          <p className="report-date">{t('dynamic.generating_title')}</p>
          <h1>{t('dynamic.generating_subtitle')}</h1>
        </header>
        <section className="report-section">
          <div
            className="progress-cell__bar"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-cell__fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="generation-step" role="status">{session.state.generationStep}</p>
          <button type="button" className="btn-tertiary" onClick={handleAbort}>
            {t('dynamic.btn_cancel_generation')}
          </button>
          {startError && <p role="alert">{startError}</p>}
        </section>
      </main>
    );
  }

  // ── Playing: scene-by-scene ──
  if (session.state.phase === 'playing' && session.state.script) {
    return (
      <>
      <ScriptPlayView
        script={session.state.script}
        onComplete={(path) => {
          void session.finish(path.map(({ sceneId, choiceId }) => ({ scene_id: sceneId, choice_id: choiceId })));
        }}
        labels={{
          scene: (n) => t('dynamic.scene_label', { n }),
          chooseHint: t('dynamic.choose_hint'),
          progressLabel: (current, total) => t('dynamic.scene_progress', { current, total }),
          submitChoice: t('dynamic.btn_continue'),
          finish: t('dynamic.btn_finish'),
        }}
      />
      {session.state.finishSubmitting && (
        <p className="report-summary" role="status" aria-live="polite">{t('assessment.saving_result')}</p>
      )}
      {session.state.error && (
        <section className="report-section">
          <p role="alert">{session.state.error}</p>
          <button type="button" className="btn-primary" disabled={session.state.finishSubmitting}
            onClick={() => void session.finish(session.state.playedPath)}>
            {t('assessment.retry_save')}
          </button>
        </section>
      )}
      </>
    );
  }

  // ── Finished: narrative + comparison + CTAs ──
  if (session.state.phase === 'finished' && session.state.script) {
    return (
      <ScriptResultView
        script={session.state.script}
        labels={{
          title: t('dynamic.result_title'),
          narrativeLabel: t('dynamic.narrative_label'),
          comparisonLabel: t('dynamic.comparison_label'),
          revisedBadge: t('dynamic.revised_badge'),
          profileCta: t('micro_sandbox.btn_profile'),
          anotherCta: t('dynamic.btn_another'),
          homeCta: t('error.link_home'),
        }}
      />
    );
  }

  // ── Failed ──
  if (session.state.phase === 'failed') {
    return (
      <main className="report-error">
        <h1>{t('micro_sandbox.error_title')}</h1>
        <p>{session.state.error || t('micro_sandbox.error_body')}</p>
        <div className="report-actions">
          <button type="button" className="btn-primary" onClick={() => session.reset()}>
            {t('micro_sandbox.btn_retry')}
          </button>
          {returnToFixed && (
            <Link href="/micro-sandbox" className="btn-secondary">
              {t('dynamic.btn_back_fixed')}
            </Link>
          )}
        </div>
      </main>
    );
  }

  return null;
}
