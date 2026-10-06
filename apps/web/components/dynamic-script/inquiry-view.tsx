// apps/web/components/dynamic-script/inquiry-view.tsx
//
// Multi-turn Q&A UI for the dynamic-script inquiry phase.
//
// Renders:
//   - The current AI follow-up question with empathy-aware intro
//   - A 4-dimension progress ring (scenario / emotion / background / relationship)
//   - Estimated-turns-remaining chip
//   - Free-text input + submit button
//   - Loading + error + abort affordances
//
// Props carry the full hook state + handlers so this component is
// controlled — easier to test and to lift back up to the page if needed.

'use client';

import { useState } from 'react';
import type { Progress } from '@/lib/api-dynamic-script';

export interface InquiryViewProps {
  sessionId: string;
  currentQuestion: string;
  progress: Progress;
  estimatedTurnsRemaining: number;
  submitting: boolean;
  error: string | null;
  onSubmit: (text: string) => void;
  onAbort: () => void;
  /** UI strings — pass from page-level i18n. */
  labels: {
    intro: string;
    submit: string;
    submitLoading: string;
    placeholder: string;
    abort: string;
    turnsRemaining: (n: number) => string;
    errorBody: string;
    progress: { scenario: string; emotion: string; background: string; relationship: string };
  };
}

const PROGRESS_DIMENSIONS: Array<{ key: keyof Progress; labelKey: 'scenario' | 'emotion' | 'background' | 'relationship' }> = [
  { key: 'scenario', labelKey: 'scenario' },
  { key: 'emotion', labelKey: 'emotion' },
  { key: 'background', labelKey: 'background' },
  { key: 'relationship', labelKey: 'relationship' },
];

export function InquiryView(props: InquiryViewProps) {
  const [draft, setDraft] = useState('');
  const { labels, onSubmit, onAbort, submitting, error } = props;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSubmit(text);
    setDraft('');
  }

  return (
    <main className="report-container" aria-busy={submitting}>
      <header className="report-header">
        <p className="report-date">{labels.intro}</p>
        <h1>{props.currentQuestion}</h1>
      </header>

      <section className="report-section progress-grid" aria-label="inquiry-progress">
        {PROGRESS_DIMENSIONS.map(({ key, labelKey }) => {
          const pct = Math.round((props.progress?.[key] ?? 0) * 100);
          return (
            <div className="progress-cell" key={key}>
              <div className="progress-cell__label">{labels.progress[labelKey]}</div>
              <div
                className="progress-cell__bar"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="progress-cell__fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="progress-cell__pct">{pct}%</div>
            </div>
          );
        })}
      </section>

      <section className="report-section">
        <p className="turns-remaining" role="status">
          {labels.turnsRemaining(props.estimatedTurnsRemaining)}
        </p>
        <form onSubmit={handleSubmit} className="inquiry-form">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={labels.placeholder}
            disabled={submitting}
            rows={4}
            aria-label={labels.placeholder}
          />
          <div className="inquiry-form__actions">
            <button
              type="submit"
              disabled={submitting || draft.trim().length === 0}
              className="btn-primary"
              aria-busy={submitting}
            >
              {submitting && <span className="action-loading-spinner" aria-hidden="true" />}
              {submitting ? labels.submitLoading : labels.submit}
            </button>
            <button type="button" className="btn-tertiary" onClick={onAbort} disabled={submitting}>
              {labels.abort}
            </button>
          </div>
        </form>
        {error && (
          <p className="report-error__body" role="alert">
            {error || labels.errorBody}
          </p>
        )}
      </section>
    </main>
  );
}
