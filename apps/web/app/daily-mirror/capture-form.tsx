// apps/web/app/daily-mirror/capture-form.tsx — low-friction reality note input.
// Saving, single-record review, and weekly-review permission are intentionally separate.

'use client';

import { useState } from 'react';
import { capturesApi, type CaptureRecord } from '@/lib/api';
import { useLocale } from '../providers-impl';

interface CaptureFormProps {
  onCaptured?: (capture: CaptureRecord) => void;
  onCaptureUpdated?: (capture: CaptureRecord) => void;
}

export function CaptureForm({ onCaptured, onCaptureUpdated }: CaptureFormProps) {
  const { t } = useLocale();
  const [rawText, setRawText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [savingPermission, setSavingPermission] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CaptureRecord | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [refutingId, setRefutingId] = useState<string | null>(null);

  const canSubmit = rawText.trim().length > 0 && !submitting;

  function updateResult(updated: CaptureRecord): void {
    setResult(updated);
    onCaptureUpdated?.(updated);
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError('');
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    try {
      const capture = await capturesApi.create({
        entry_type: 'quick_fragment',
        process_mode: 'save_only',
        modality: 'text',
        raw_text: rawText.trim(),
        local_date: localDate,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setResult(capture);
      setRawText('');
      onCaptured?.(capture);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('diary.submit_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAnalyze(): Promise<void> {
    if (!result || analyzing) return;
    setAnalyzing(true);
    setError('');
    try {
      updateResult(await capturesApi.analyze(result.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('diary.analysis_failed'));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleWeeklyPermission(): Promise<void> {
    if (!result || result.process_mode === 'save_only' || savingPermission) return;
    setSavingPermission(true);
    setError('');
    try {
      const updated = await capturesApi.setWeeklyReviewPermission(result.id, !result.allow_weekly_review);
      updateResult({ ...updated, interpretations: result.interpretations });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('diary.weekly_permission_failed'));
    } finally {
      setSavingPermission(false);
    }
  }

  async function respondToInterpretation(interpretationId: string, response: 'confirm' | 'refute'): Promise<void> {
    if (!result) return;
    const setBusy = response === 'confirm' ? setConfirmingId : setRefutingId;
    setBusy(interpretationId);
    setError('');
    try {
      if (response === 'confirm') {
        await capturesApi.confirmInterpretation(result.id, interpretationId);
      } else {
        await capturesApi.refuteInterpretation(result.id, interpretationId);
      }
      updateResult({
        ...result,
        interpretations: result.interpretations?.map((item) =>
          item.id === interpretationId
            ? { ...item, status: response === 'confirm' ? 'confirmed' : 'refuted' }
            : item,
        ),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('diary.interpretation_response_failed'));
    } finally {
      setBusy(null);
    }
  }

  if (result) {
    const hasInterpretations = (result.interpretations?.length ?? 0) > 0;
    const isAnalyzed = result.process_mode === 'analyze';
    return (
      <section className="capture-result note-result" aria-live="polite">
        <p className="capture-result-success">{t('diary.capture_saved')}</p>
        <p className="note-result-original">{result.raw_text}</p>

        {!isAnalyzed && (
          <div className="note-result-next-step">
            <p>{t('diary.note_saved_prompt')}</p>
            <button type="button" className="btn-secondary" disabled={analyzing} onClick={() => void handleAnalyze()}>
              {analyzing ? t('common.loading') : t('diary.analyze_this_note')}
            </button>
            <p className="note-result-boundary">{t('diary.single_note_analysis_boundary')}</p>
          </div>
        )}

        {isAnalyzed && (
          <div className="capture-result-interpretations">
            <strong>{t('diary.single_note_review_title')}</strong>
            <p>{t('diary.interpretation_scope')}</p>
            {hasInterpretations ? result.interpretations?.map((interpretation) => (
              <div key={interpretation.id} className="interpretation-card">
                <p className="interpretation-text">{interpretation.ai_explanation}</p>
                <span className={`interpretation-status status-${interpretation.status}`}>
                  {interpretation.status === 'pending'
                    ? t('diary.interpretation_pending')
                    : interpretation.status === 'confirmed'
                      ? t('diary.interpretation_confirmed')
                      : t('diary.interpretation_rejected')}
                </span>
                {interpretation.status === 'pending' && (
                  <button
                    type="button"
                    className="btn-confirm-interp"
                    disabled={confirmingId !== null || refutingId !== null}
                    onClick={() => void respondToInterpretation(interpretation.id, 'confirm')}
                  >
                    {confirmingId === interpretation.id ? t('common.loading') : t('common.confirm')}
                  </button>
                )}
                {interpretation.status !== 'refuted' && (
                  <button
                    type="button"
                    disabled={confirmingId !== null || refutingId !== null}
                    onClick={() => void respondToInterpretation(interpretation.id, 'refute')}
                  >
                    {refutingId === interpretation.id ? t('common.loading') : t('diary.interpretation_refute')}
                  </button>
                )}
              </div>
            )) : <p className="note-result-boundary">{t('diary.no_single_note_cues')}</p>}

            <div className="note-weekly-permission">
              <label>
                <input
                  type="checkbox"
                  checked={result.allow_weekly_review}
                  disabled={savingPermission}
                  onChange={() => void handleWeeklyPermission()}
                />
                {t('diary.allow_weekly_review')}
              </label>
              <p>{t('diary.weekly_permission_next_step')}</p>
            </div>
          </div>
        )}

        {error && <p className="capture-error" role="alert">{error}</p>}
        <button type="button" className="text-toggle" onClick={() => setResult(null)}>
          {t('diary.write_another_note')}
        </button>
      </section>
    );
  }

  return (
    <form className="capture-form note-form" onSubmit={handleSubmit} aria-label={t('diary.capture_form_label')}>
      <div className="note-form-intro">
        <h2>{t('diary.note_prompt_title')}</h2>
        <p>{t('diary.note_prompt_hint')}</p>
      </div>
      <details className="note-writing-prompts">
        <summary>{t('diary.note_prompt_details')}</summary>
        <ul>
          <li>{t('diary.note_prompt_event')}</li>
          <li>{t('diary.note_prompt_response')}</li>
          <li>{t('diary.note_prompt_meaning')}</li>
        </ul>
      </details>
      <div className="capture-text-field">
        <label htmlFor="capture-raw-text" className="sr-only">{t('diary.text_label_quick_fragment')}</label>
        <textarea
          id="capture-raw-text"
          rows={6}
          placeholder={t('diary.note_placeholder')}
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          aria-required="true"
        />
      </div>
      {error && <p className="capture-error" role="alert">{error}</p>}
      <button type="submit" className="btn-primary capture-submit" disabled={!canSubmit}>
        {submitting ? t('assessment.submitting') : t('diary.save_note')}
      </button>
      <p className="note-form-privacy">{t('diary.save_only_notice')}</p>
    </form>
  );
}
