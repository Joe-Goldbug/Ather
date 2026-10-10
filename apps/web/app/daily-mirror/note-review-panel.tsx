'use client';

import { useRef, useState } from 'react';
import { capturesApi, type NoteReview, type CaptureRecord } from '@/lib/api';
import { useLocale } from '../providers-impl';
import { notesCopy } from './notes-copy';

export function NoteReviewPanel({ reviews, sources, onSaved }: {
  reviews: NoteReview[]; sources: CaptureRecord[]; onSaved: (review: NoteReview) => void;
}) {
  const { locale } = useLocale();
  const copy = notesCopy(locale);
  const latest = [...reviews].sort((a, b) => b.revision - a.revision)[0];
  const [response, setResponse] = useState<NoteReview['feedback'][number]['response']>('supplement');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setStatus(''); setError('');
    try { await action(); } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.failed);
    } finally { inFlight.current = false; setBusy(false); }
  }
  const sourceIds = sources.map((source) => source.id);
  async function generate(parentId?: string) {
    await run(async () => {
      const review = sourceIds.length === 1
        ? await capturesApi.review(sourceIds[0], locale, parentId)
        : await capturesApi.compare(sourceIds, locale, parentId);
      onSaved(review);
    });
  }
  const renderContent = (review: NoteReview) => (
    <div className="eva-notes-insight">
      <span className="eva-notes-tag">{copy.version} {review.revision} · {review.feedback.some((item) => item.response === 'wrong') ? copy.disputed : copy.pending}</span>
      {(['reaction', 'impact', 'uncertainty'] as const).map((key) => (
        <section className="eva-notes-reading-section" key={key}>
          <h3>{copy[key]}</h3><p>{review.content[key].text}</p>
          <details><summary>{copy.evidence}</summary>
            {review.content[key].evidence.map((reference, index) => (
              <blockquote key={index}>
                <small>{sources.find((source) => source.id === reference.source_id)?.local_date ?? copy.feedbackLabel}</small>
                <p>{reference.quote}</p>
              </blockquote>
            ))}
          </details>
        </section>
      ))}
      <h3>{review.content.question}</h3>
    </div>
  );
  return (
    <div className="eva-notes-review-panel">
      <p className="eva-notes-muted">{sources.length > 1 ? copy.compareBoundary : copy.consent}</p>
      {!latest ? (
        <button type="button" className="btn-primary" disabled={busy || !sources.length} aria-busy={busy}
          onClick={() => void generate()}>{busy ? copy.busy : sources.length > 1 ? copy.compare : copy.analyze}</button>
      ) : (
        <>
          {renderContent(latest)}
          <fieldset disabled={busy} className="eva-notes-feedback">
            <legend>{copy.feedbackLabel}</legend>
            <div className="eva-notes-actions">
              {(['fits', 'partly', 'wrong', 'supplement'] as const).map((value) => (
                <button type="button" key={value} aria-pressed={response === value} onClick={() => setResponse(value)}>{copy[value]}</button>
              ))}
            </div>
            <label htmlFor={`feedback-${latest.id}`} className="sr-only">{copy.feedbackLabel}</label>
            <textarea id={`feedback-${latest.id}`} rows={3} maxLength={2000} value={note}
              onChange={(event) => setNote(event.target.value)} placeholder={copy.feedbackPlaceholder} />
            <button type="button" className="btn-secondary" disabled={response === 'supplement' && !note.trim()}
              onClick={() => void run(async () => {
                onSaved(await capturesApi.reviewFeedback(latest.source_ids[0], latest.id, response, note));
                setNote(''); setStatus(copy.saved);
              })}>{busy ? copy.busy : copy.retain}</button>
          </fieldset>
          {latest.feedback.length > 0 && (
            <div className="eva-notes-saved-feedback">
              {latest.feedback.map((item, index) => <p key={index}><strong>{copy[item.response]}</strong>{item.note ? ` · ${item.note}` : ''}</p>)}
              <button type="button" className="btn-secondary" disabled={busy || !!note.trim()}
                onClick={() => void generate(latest.id)}>{busy ? copy.busy : copy.revise}</button>
            </div>
          )}
          {reviews.length > 1 && <details className="eva-notes-version-history"><summary>{copy.history}</summary>
            {reviews.filter((item) => item.id !== latest.id).map((item) => <div key={item.id}>
              {renderContent(item)}
              {item.feedback.map((feedback, index) => <p key={index}>{copy[feedback.response]} · {feedback.note}</p>)}
            </div>)}
          </details>}
        </>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
