// apps/web/app/daily-mirror/capture-form.tsx — Capture input form (Task 26)
// Three entry types, three processing modes, multi-modal input.
// Requirements: 5.1, 5.2, 5.3, 5.4, 5.5

'use client';

import { useState } from 'react';
import {
  capturesApi,
  type CaptureEntryType,
  type CaptureProcessMode,
  type CaptureModality,
  type CaptureRecord,
} from '@/lib/api';
import { useLocale } from '../providers-impl';

// ── Constants ────────────────────────────────────────────────────────────────

const ENTRY_TYPES: { id: CaptureEntryType }[] = [
  { id: 'quick_fragment' },
  { id: 'emotion_log' },
  { id: 'decision_log' },
];

const PROCESS_MODES: { id: CaptureProcessMode }[] = [
  { id: 'save_only' },
  { id: 'organize' },
  { id: 'analyze' },
];

const MODALITIES: { id: CaptureModality; available: boolean }[] = [
  { id: 'text', available: true },
  { id: 'voice_transcript', available: false },
  { id: 'image', available: false },
];

const MOOD_LABEL_KEYS = [
  'diary.mood_happy',
  'diary.mood_calm',
  'diary.mood_anxious',
  'diary.mood_down',
  'diary.mood_angry',
  'diary.mood_excited',
  'diary.mood_tired',
  'diary.mood_confused',
] as const;

// ── Component ────────────────────────────────────────────────────────────────

interface CaptureFormProps {
  onCaptured?: (capture: CaptureRecord) => void;
  onCaptureUpdated?: (capture: CaptureRecord) => void;
}

export function CaptureForm({ onCaptured, onCaptureUpdated }: CaptureFormProps) {
  const { t } = useLocale();
  // Form state
  const [entryType, setEntryType] = useState<CaptureEntryType>('quick_fragment');
  const [processMode, setProcessMode] = useState<CaptureProcessMode>('save_only');
  const [modality, setModality] = useState<CaptureModality>('text');
  const [rawText, setRawText] = useState('');
  const [moodLabel, setMoodLabel] = useState('');
  const [moodIntensity, setMoodIntensity] = useState(3);
  const [allowWeeklyReview, setAllowWeeklyReview] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CaptureRecord | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmErrorId, setConfirmErrorId] = useState<string | null>(null);
  const [refutingId, setRefutingId] = useState<string | null>(null);
  const [refuteErrorId, setRefuteErrorId] = useState<string | null>(null);

  const canSubmit = rawText.trim().length > 0 && !submitting;

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError('');
    setResult(null);
    setConfirmErrorId(null);
    setRefuteErrorId(null);

    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    try {
      const capture = await capturesApi.create({
        entry_type: entryType,
        process_mode: processMode,
        modality,
        raw_text: rawText.trim(),
        ...(entryType === 'emotion_log' && moodLabel ? { mood_label: moodLabel, mood_intensity: moodIntensity } : {}),
        local_date: localDate,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        allow_weekly_review: processMode !== 'save_only' && allowWeeklyReview,
      });

      setResult(capture);
      setRawText('');
      setMoodLabel('');
      setMoodIntensity(3);
      setAllowWeeklyReview(false);
      onCaptured?.(capture);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('diary.submit_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefuteInterpretation(captureId: string, interpretationId: string): Promise<void> {
    setRefutingId(interpretationId);
    setRefuteErrorId(null);
    try {
      await capturesApi.refuteInterpretation(captureId, interpretationId);
      if (result?.id === captureId) {
        const updated = {
          ...result,
          interpretations: result.interpretations?.map((item) =>
            item.id === interpretationId ? { ...item, status: 'refuted' as const } : item,
          ),
        };
        setResult(updated);
        onCaptureUpdated?.(updated);
      }
    } catch {
      setRefuteErrorId(interpretationId);
    } finally {
      setRefutingId(null);
    }
  }

  async function handleConfirmInterpretation(captureId: string, interpretationId: string): Promise<void> {
    setConfirmingId(interpretationId);
    setConfirmErrorId(null);
    try {
      await capturesApi.confirmInterpretation(captureId, interpretationId);
      if (result?.id === captureId) {
        const updated = {
          ...result,
          interpretations: result.interpretations?.map((item) =>
            item.id === interpretationId ? { ...item, status: 'confirmed' as const } : item,
          ),
        };
        setResult(updated);
        onCaptureUpdated?.(updated);
      }
    } catch {
      setConfirmErrorId(interpretationId);
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <form className="capture-form" onSubmit={handleSubmit} aria-label={t('diary.capture_form_label')}>
      {/* Entry Type Tabs */}
      <fieldset className="capture-entry-types" aria-label={t('diary.entry_type_label')}>
        <legend className="sr-only">{t('diary.entry_type_legend')}</legend>
        <div className="capture-tabs" role="tablist">
          {ENTRY_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              role="tab"
              aria-selected={entryType === type.id}
              className={`capture-tab ${entryType === type.id ? 'active' : ''}`}
              onClick={() => setEntryType(type.id)}
            >
              {type.id === 'quick_fragment'
                ? t('diary.entry_type_quick_fragment')
                : type.id === 'emotion_log'
                  ? t('diary.entry_type_emotion_log')
                  : t('diary.entry_type_decision_log')}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Processing Mode */}
      <fieldset className="capture-modes" aria-label={t('diary.process_mode_label')}>
        <legend className="capture-section-label">{t('diary.process_mode_label')}</legend>
        <div className="capture-mode-options">
          {PROCESS_MODES.map((mode) => (
            <label
              key={mode.id}
              className={`capture-mode-option ${processMode === mode.id ? 'active' : ''}`}
            >
              <input
                type="radio"
                name="process_mode"
                value={mode.id}
                checked={processMode === mode.id}
                onChange={() => setProcessMode(mode.id)}
                className="sr-only"
              />
              <span className="capture-mode-label">
                {mode.id === 'save_only'
                  ? t('diary.process_mode_save_only')
                  : mode.id === 'organize'
                    ? t('diary.process_mode_organize')
                    : t('diary.process_mode_analyze')}
              </span>
              <span className="capture-mode-desc">
                {mode.id === 'save_only'
                  ? t('diary.process_mode_save_only_desc')
                  : mode.id === 'organize'
                    ? t('diary.process_mode_organize_desc')
                    : t('diary.process_mode_analyze_desc')}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="capture-weekly-permission">
        <input
          type="checkbox"
          checked={processMode !== 'save_only' && allowWeeklyReview}
          disabled={processMode === 'save_only'}
          onChange={(event) => setAllowWeeklyReview(event.target.checked)}
        />
        {t('diary.allow_weekly_review')}
      </label>

      {/* Modality Selector */}
      <fieldset className="capture-modality" aria-label={t('diary.modality_label')}>
        <legend className="capture-section-label">{t('diary.modality_label')}</legend>
        <div className="capture-modality-options">
          {MODALITIES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`capture-modality-btn ${modality === m.id ? 'active' : ''} ${!m.available ? 'disabled' : ''}`}
              onClick={() => m.available && setModality(m.id)}
              disabled={!m.available}
              aria-label={m.available
                ? (m.id === 'text'
                  ? t('diary.modality_text')
                  : m.id === 'voice_transcript'
                    ? t('diary.modality_voice')
                    : t('diary.modality_image'))
                : t('diary.modality_soon_aria', {
                    modality: m.id === 'text'
                      ? t('diary.modality_text')
                      : m.id === 'voice_transcript'
                        ? t('diary.modality_voice')
                        : t('diary.modality_image'),
                  })}
              title={m.available ? undefined : t('diary.soon')}
            >
              {m.id === 'text'
                ? t('diary.modality_text')
                : m.id === 'voice_transcript'
                  ? t('diary.modality_voice')
                  : t('diary.modality_image')}
              {!m.available && <span className="badge-soon">{t('diary.soon')}</span>}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Mood Selector (emotion_log only) */}
      {entryType === 'emotion_log' && (
        <fieldset className="capture-mood" aria-label={t('diary.mood_label')}>
          <legend className="capture-section-label">{t('diary.mood_label')}</legend>
          <div className="capture-mood-labels">
            {MOOD_LABEL_KEYS.map((labelKey) => {
              const label = t(labelKey);
              return (
              <button
                key={label}
                type="button"
                className={`mood-chip ${moodLabel === label ? 'active' : ''}`}
                onClick={() => setMoodLabel(label === moodLabel ? '' : label)}
              >
                {label}
              </button>
            )})}
          </div>
          {moodLabel && (
            <div className="capture-mood-intensity" aria-label={t('diary.mood_intensity_label')}>
              <label htmlFor="mood-intensity">{t('diary.mood_intensity', { value: moodIntensity })}</label>
              <input
                id="mood-intensity"
                type="range"
                min={1}
                max={5}
                step={1}
                value={moodIntensity}
                onChange={(e) => setMoodIntensity(Number(e.target.value))}
              />
            </div>
          )}
        </fieldset>
      )}

      {/* Text Input */}
      <div className="capture-text-field">
        <label htmlFor="capture-raw-text" className="capture-section-label">
          {entryType === 'quick_fragment'
            ? t('diary.text_label_quick_fragment')
            : entryType === 'emotion_log'
              ? t('diary.text_label_emotion_log')
              : t('diary.text_label_decision_log')}
        </label>
        <textarea
          id="capture-raw-text"
          rows={4}
          placeholder={
            entryType === 'quick_fragment'
              ? t('diary.placeholder_quick_fragment')
              : entryType === 'emotion_log'
                ? t('diary.placeholder_emotion_log')
                : t('diary.placeholder_decision_log')
          }
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          aria-required="true"
        />
      </div>

      {/* Voice/Image Placeholder */}
      {modality === 'voice_transcript' && (
        <div className="capture-placeholder" aria-live="polite">
          <p>{t('diary.voice_coming_soon')}</p>
        </div>
      )}
      {modality === 'image' && (
        <div className="capture-placeholder" aria-live="polite">
          <p>{t('diary.image_coming_soon')}</p>
        </div>
      )}

      {/* Error */}
      {error && <p className="capture-error" role="alert">{error}</p>}

      {/* Submit */}
      <button
        type="submit"
        className="btn-primary capture-submit"
        disabled={!canSubmit}
        aria-label={t('diary.submit_capture_aria')}
      >
        {submitting ? t('assessment.submitting') : t('landing.cta_record')}
      </button>

      {/* Result / Interpretations */}
      {result && (
        <div className="capture-result" aria-live="polite">
          <p className="capture-result-success">{t('diary.capture_saved')}</p>
          {result.summary && (
            <div className="capture-result-summary">
              <strong>{t('diary.summary_label')}</strong>
              <p>{result.summary}</p>
            </div>
          )}
          {result.interpretations && result.interpretations.length > 0 && (
            <div className="capture-result-interpretations">
              <strong>{t('diary.interpretations_label')}</strong>
              <p>{t('diary.interpretation_scope')}</p>
              {result.interpretations.map((interp) => (
                <div key={interp.id} className="interpretation-card">
                  <p className="interpretation-dim">{interp.dimension}</p>
                  <p className="interpretation-text">{interp.ai_explanation}</p>
                  <span className={`interpretation-status status-${interp.status}`}>
                    {interp.status === 'pending' ? t('diary.interpretation_pending') : interp.status === 'confirmed' ? t('diary.interpretation_confirmed') : t('diary.interpretation_rejected')}
                  </span>
                  {interp.status === 'pending' && (
                    <button
                      type="button"
                      className="btn-confirm-interp"
                      disabled={confirmingId !== null || refutingId !== null}
                      aria-busy={confirmingId === interp.id}
                      onClick={() => void handleConfirmInterpretation(result.id, interp.id)}
                    >
                      {confirmingId === interp.id && <span className="action-loading-spinner" aria-hidden="true" />}
                      {confirmingId === interp.id ? t('common.loading') : t('common.confirm')}
                    </button>
                  )}
                  {interp.status !== 'refuted' && (
                    <button
                      type="button"
                      disabled={confirmingId !== null || refutingId !== null}
                      aria-busy={refutingId === interp.id}
                      onClick={() => void handleRefuteInterpretation(result.id, interp.id)}
                    >
                      {refutingId === interp.id && <span className="action-loading-spinner" aria-hidden="true" />}
                      {refutingId === interp.id ? t('common.loading') : t('diary.interpretation_refute')}
                    </button>
                  )}
                  {confirmErrorId === interp.id && <p className="capture-error" role="alert">{t('diary.interpretation_confirm_failed')}</p>}
                  {refuteErrorId === interp.id && <p className="capture-error" role="alert">{t('diary.interpretation_refute_failed')}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </form>
  );
}
