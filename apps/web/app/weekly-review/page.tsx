// apps/web/app/weekly-review/page.tsx — Weekly Review page (Phase 6/7)
// Shows week-in-review: AI-generated summary from NestJS (or local record fallback)

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  capturesApi,
  consentApi,
  diaryApi,
  weeklyExperimentsApi,
  weeklyReviewApi,
  type CaptureRecord,
  type DiaryEntry,
  type WeeklyExperiment,
  type WeeklyExperimentOutcome,
  type WeeklyReview,
} from '@/lib/api';
import { useSession } from '@/hooks/useSession';
import { useLocale } from '../providers-impl';
import { WEEKLY_PATTERN_KEYWORDS } from '@/messages/weekly-pattern-keywords';
import { getIntlLocale, type Locale } from '@/lib/i18n';

interface WeeklyPattern {
  dimension_key: string;
  confidence: number;
}

const CHECK_IN_LABELS: Record<WeeklyExperimentOutcome, string> = {
  done: '完成了',
  partly_done: '做了一部分',
  no_opportunity: '这周没有遇到机会',
  paused: '先暂停',
};

const CHECK_IN_STATUS: Record<WeeklyExperimentOutcome, string> = {
  done: '已记下：这次行动完成了。',
  partly_done: '已记下：你做了一部分。',
  no_opportunity: '已记下：这周没有遇到合适机会。',
  paused: '已记下：这项行动先暂停。',
};

const CAPTURE_ENTRY_LABELS: Record<
  Locale,
  Record<'quick_fragment' | 'emotion_log' | 'decision_log' | 'legacy_diary', string>
> = {
  'zh-CN': {
    quick_fragment: '碎片',
    emotion_log: '情绪',
    decision_log: '决策',
    legacy_diary: '旧日记',
  },
  en: {
    quick_fragment: 'Fragment',
    emotion_log: 'Emotion',
    decision_log: 'Decision',
    legacy_diary: 'Legacy diary',
  },
  ja: {
    quick_fragment: '断片',
    emotion_log: '感情',
    decision_log: '決定',
    legacy_diary: '旧日記',
  },
  es: {
    quick_fragment: 'Fragmento',
    emotion_log: 'Emoción',
    decision_log: 'Decisión',
    legacy_diary: 'Diario legado',
  },
};

type WeeklyEntry =
  | {
      kind: 'capture';
      id: string;
      date: string;
      timestamp: number;
      text: string;
      label: string;
    }
  | {
      kind: 'legacy_diary';
      id: string;
      date: string;
      timestamp: number;
      text: string;
      label: string;
    };

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return { start: fmt(monday), end: fmt(sunday) };
}

function getLegacyDiaryEntriesForWeek(entries: DiaryEntry[]): DiaryEntry[] {
  const { start, end } = getWeekRange();
  return entries.filter(
    (e) => e.entry_date >= start && e.entry_date <= end,
  );
}

function getCapturesForWeek(entries: CaptureRecord[]): CaptureRecord[] {
  const { start, end } = getWeekRange();
  return entries.filter((entry) => entry.local_date >= start && entry.local_date <= end);
}

function toWeeklyEntries(
  captures: CaptureRecord[],
  legacyDiaryEntries: DiaryEntry[],
  locale: Locale,
): WeeklyEntry[] {
  const labels = CAPTURE_ENTRY_LABELS[locale] ?? CAPTURE_ENTRY_LABELS['zh-CN'];
  const captureItems: WeeklyEntry[] = captures.map((capture) => ({
    kind: 'capture',
    id: capture.id,
    date: capture.local_date || capture.captured_at.slice(0, 10),
    timestamp: new Date(capture.captured_at).getTime(),
    text: capture.summary?.trim() || capture.raw_text.trim(),
    label: labels[capture.entry_type],
  }));

  const diaryItems: WeeklyEntry[] = legacyDiaryEntries.map((entry) => {
    const content = entry.content as Record<string, string>;
    const text = content.detail || content.note || content.pattern_noticed || content.high_point || content.low_point || '';
    return {
      kind: 'legacy_diary',
      id: entry.id,
      date: entry.entry_date,
      timestamp: new Date(entry.created_at).getTime(),
      text,
      label: content.event_type || labels.legacy_diary,
    };
  });

  return [...captureItems, ...diaryItems]
    .filter((entry) => entry.text.trim().length > 0)
    .sort((a, b) => b.timestamp - a.timestamp);
}

function detectPatterns(entries: WeeklyEntry[], locale: Locale): WeeklyPattern[] {
  const patterns: WeeklyPattern[] = [];
  const texts = entries
    .map((entry) => entry.text)
    .join(' ')
    .toLowerCase();

  const kw = WEEKLY_PATTERN_KEYWORDS[locale] ?? WEEKLY_PATTERN_KEYWORDS['zh-CN'];

  if (kw.stress.some((w) => texts.includes(w.toLowerCase()))) {
    patterns.push({ dimension_key: 'stress', confidence: 0.8 });
  }
  if (kw.connection.filter((w) => texts.includes(w.toLowerCase())).length >= 2) {
    patterns.push({ dimension_key: 'connection', confidence: 0.75 });
  }
  if (kw.achievement.some((w) => texts.includes(w.toLowerCase()))) {
    patterns.push({ dimension_key: 'achievement', confidence: 0.7 });
  }
  if (kw.anxiety.filter((w) => texts.includes(w.toLowerCase())).length >= 2) {
    patterns.push({ dimension_key: 'anxiety', confidence: 0.8 });
  }
  return patterns;
}

export default function WeeklyReviewPage() {
  const { locale, t } = useLocale();
  const { user, loading: sessionLoading } = useSession();
  const [weekEntries, setWeekEntries] = useState<WeeklyEntry[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [experiment, setExperiment] = useState<WeeklyExperiment | null>(null);
  const [experimentNote, setExperimentNote] = useState('');
  const [experimentStatus, setExperimentStatus] = useState<string | null>(null);
  const [creatingExperiment, setCreatingExperiment] = useState(false);
  const [checkingIn, setCheckingIn] = useState<WeeklyExperimentOutcome | null>(null);
  const [patterns, setPatterns] = useState<WeeklyPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [weeklyPermission, setWeeklyPermission] = useState(false);
  const [shareForReview, setShareForReview] = useState(false);
  const [eligibleCount, setEligibleCount] = useState(0);
  const [permissionError, setPermissionError] = useState('');
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>({});
  const [expandedSummary, setExpandedSummary] = useState(false);
  const { start, end } = getWeekRange();

  const syncTagLabel = (tag: string) => {
    switch (tag) {
      case 'breakthrough': return t('diary.tag_breakthrough');
      case 'compromise': return t('diary.tag_compromise');
      case 'anger': return t('diary.tag_anger');
      case 'overwhelm': return t('diary.tag_overwhelm');
      default: return tag;
    }
  };

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    Promise.all([
      weeklyReviewApi.current(),
      capturesApi.list(100),
      diaryApi.recent(),
      consentApi.status(),
    ])
      .then(([review, captures, legacyDiaryEntries, consent]) => {
        setWeeklyPermission(consent.weekly_review_analysis === true);
        setShareForReview(consent.weekly_review_analysis === true);
        setReview(review.id ? review : null);
        // If AI summary exists, use it; otherwise fall back to local patterns
        if (review.summary) {
          setAiSummary(review.summary);
        }
        const week = toWeeklyEntries(
          getCapturesForWeek(captures),
          getLegacyDiaryEntriesForWeek(legacyDiaryEntries),
          locale,
        );
        setWeekEntries(week);
        const allowedCaptures = getCapturesForWeek(captures).filter(
          (capture) => capture.process_mode !== 'save_only' && capture.allow_weekly_review,
        );
        setEligibleCount(allowedCaptures.length);
        if (!review.summary) {
          setPatterns(consent.weekly_review_analysis
            ? detectPatterns(toWeeklyEntries(allowedCaptures, [], locale), locale)
            : []);
        }
      })
      .catch(() => {
        // Network error — fall back to local record data
        Promise.all([
          capturesApi.list(100).catch(() => [] as CaptureRecord[]),
          diaryApi.recent().catch(() => [] as DiaryEntry[]),
        ])
          .then(([captures, legacyDiaryEntries]) => {
            const week = toWeeklyEntries(
              getCapturesForWeek(captures),
              getLegacyDiaryEntriesForWeek(legacyDiaryEntries),
              locale,
            );
            setWeekEntries(week);
            setPatterns([]);
          })
          .catch(() => setWeekEntries([]));
      })
      .finally(() => setLoading(false));
  }, [locale, sessionLoading, user]);

  async function handleGenerate() {
    if (!shareForReview || eligibleCount === 0) return;
    setTriggering(true);
    setPermissionError('');
    try {
      if (!weeklyPermission) {
        await consentApi.grant('weekly_review_analysis');
        setWeeklyPermission(true);
      }
      await weeklyReviewApi.trigger();
      // Refresh after triggering
      const review = await weeklyReviewApi.current();
      setReview(review.id ? review : null);
      if (review.summary) setAiSummary(review.summary);
      setPatterns([]);
    } catch {
      setPermissionError(t('weekly.permission_error'));
    } finally {
      setTriggering(false);
    }
  }

  async function revokeWeeklyPermission() {
    setPermissionError('');
    try {
      await consentApi.revoke('weekly_review_analysis');
      setWeeklyPermission(false);
      setShareForReview(false);
      setPatterns([]);
    } catch {
      setPermissionError(t('weekly.revoke_error'));
    }
  }

  async function handleCreateExperiment() {
    if (!review?.id) return;
    setCreatingExperiment(true);
    setExperimentStatus(null);
    try {
      const result = await weeklyReviewApi.createExperiment(review.id);
      setExperiment(result.experiment);
    } catch {
      setExperimentStatus('暂时无法保存这项行动，请稍后重试。');
    } finally {
      setCreatingExperiment(false);
    }
  }

  async function handleExperimentCheckIn(outcome: WeeklyExperimentOutcome) {
    if (!experiment || experiment.state !== 'active') return;
    setCheckingIn(outcome);
    setExperimentStatus(null);
    try {
      const result = await weeklyExperimentsApi.checkIn(experiment.id, {
        outcome,
        note: experimentNote.trim() || null,
      });
      setExperiment(result.experiment);
      setExperimentNote('');
      setExperimentStatus(CHECK_IN_STATUS[outcome]);
    } catch {
      setExperimentStatus('暂时无法保存这次回看，请稍后重试。');
    } finally {
      setCheckingIn(null);
    }
  }

  if (sessionLoading) {
    return (
      <main className="weekly-review-container">
        <p className="loading-text">{t('weekly.loading_entries')}</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="weekly-review-container" aria-label={t('weekly.auth_required_title')}>
        <header className="review-header">
          <h1>{t('weekly.auth_required_title')}</h1>
          <p className="review-range">{t('weekly.auth_required_body')}</p>
        </header>
        <div className="review-actions">
          <Link href="/login?returnTo=%2Fweekly-review" className="btn-primary">
            {t('weekly.btn_go_login')}
          </Link>
          <Link href="/" className="btn-secondary">
            {t('weekly.back_home')}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="weekly-review-container">
      <header className="review-header">
        <h1>{t('weekly.title')}</h1>
        <p className="review-range">
          {t('weekly.date_range', {
            start: new Date(start).toLocaleDateString(getIntlLocale(locale), { month: 'long', day: 'numeric' }),
            end: new Date(end).toLocaleDateString(getIntlLocale(locale), { month: 'long', day: 'numeric' }),
          })}
        </p>
      </header>

      {loading ? (
        <p className="loading-text">{t('weekly.loading_entries')}</p>
      ) : weekEntries.length === 0 ? (
        <div className="empty-week">
          <p>{t('weekly.no_entries')}</p>
          <Link href="/daily-mirror" className="btn-primary">{t('weekly.btn_write_today')}</Link>
        </div>
      ) : (
        <>
          <section className="review-section">
            <h3>{t('weekly.week_diary_title')}</h3>
            <div className="week-entries">
              {weekEntries.map((entry) => (
                <div key={entry.id} className="week-entry-card">
                  <p className="entry-date">
                    {new Date(entry.date).toLocaleDateString(
                      getIntlLocale(locale),
                      { weekday: 'short', month: 'numeric', day: 'numeric' },
                    )}
                  </p>
                  {(() => {
                    const fieldKey = `${entry.id}:text`;
                    const shouldClamp = entry.text.length > 140;
                    const isExpanded = !!expandedFields[fieldKey];
                    const label = entry.kind === 'capture' ? entry.label : syncTagLabel(entry.label) || t('weekly.week_diary_title');
                    return (
                      <div className="entry-field">
                        <span className="entry-question">{label}</span>
                        <p className={`entry-answer ${shouldClamp && !isExpanded ? 'collapsed' : ''}`}>{entry.text}</p>
                        {shouldClamp ? (
                          <button
                            type="button"
                            className="text-toggle"
                            onClick={() =>
                              setExpandedFields((prev) => ({
                                ...prev,
                                [fieldKey]: !prev[fieldKey],
                              }))
                            }
                          >
                            {isExpanded ? t('common.show_less') : t('common.show_more')}
                          </button>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          </section>

          {aiSummary ? (
            <section className="review-section">
              <h3>{t('weekly.eva_observation')}</h3>
              <blockquote className="ai-summary-block">
                <p className={aiSummary.length > 220 && !expandedSummary ? 'collapsed' : ''}>{aiSummary}</p>
                {aiSummary.length > 220 ? (
                  <button
                    type="button"
                    className="text-toggle"
                    onClick={() => setExpandedSummary((prev) => !prev)}
                  >
                    {expandedSummary ? t('common.show_less') : t('common.show_more')}
                  </button>
                ) : null}
              </blockquote>
            </section>
          ) : patterns.length > 0 ? (
            <section className="review-section">
              <h3>{t('weekly.eva_observation')}</h3>
              <div className="patterns-list">
                {patterns.map((p) => (
                  <div key={p.dimension_key} className="pattern-card">
                    <span className="pattern-dimension">{t(`weekly_pattern.dim_${p.dimension_key}`)}</span>
                    <p className="pattern-summary">{t(`weekly_pattern.summary_${p.dimension_key}`)}</p>
                    <span className="pattern-confidence">
                      {'●'.repeat(Math.round(p.confidence * 3))}
                      {'○'.repeat(3 - Math.round(p.confidence * 3))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {!aiSummary && (
            <section className="review-section">
              <div className="generate-cta">
                <p>{t('weekly.generate_cta')}</p>
                <p>{t('weekly.allowed_count', { count: eligibleCount })}</p>
                <label>
                  <input
                    type="checkbox"
                    checked={shareForReview}
                    onChange={(event) => setShareForReview(event.target.checked)}
                  />
                  {t('weekly.permission_label')}
                </label>
                <button
                  className="btn-primary"
                  onClick={handleGenerate}
                  disabled={triggering || !shareForReview || eligibleCount === 0}
                >
                  {triggering ? t('weekly.btn_generating') : t('weekly.btn_generate')}
                </button>
              </div>
            </section>
          )}
          {weeklyPermission && (
            <button type="button" className="text-toggle" onClick={revokeWeeklyPermission}>
              {t('weekly.revoke_permission')}
            </button>
          )}
          {permissionError && <p role="alert">{permissionError}</p>}

          {review?.content?.suggested_experiment ? (
            <section className="review-section" aria-label="自愿行动回看">
              <h3>一个可以自己决定是否尝试的小行动</h3>
              <p>{review.content.suggested_experiment.action_text}</p>
              <p className="review-range">适合在：{review.content.suggested_experiment.trigger_context}</p>
              {!experiment ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCreateExperiment}
                  disabled={creatingExperiment}
                >
                  {creatingExperiment ? '正在保存…' : '我愿意试试'}
                </button>
              ) : (
                <div>
                  <p>由你主动开始。回看时可选择最接近实际情况的一项。</p>
                  {experiment.state === 'active' ? (
                    <>
                      <label className="entry-field">
                        <span className="entry-question">补充说明（可选）</span>
                        <textarea
                          value={experimentNote}
                          onChange={(event) => setExperimentNote(event.target.value)}
                          maxLength={2000}
                        />
                      </label>
                      <div className="review-actions">
                        {(Object.keys(CHECK_IN_LABELS) as WeeklyExperimentOutcome[]).map((outcome) => (
                          <button
                            type="button"
                            className="btn-secondary"
                            key={outcome}
                            onClick={() => handleExperimentCheckIn(outcome)}
                            disabled={checkingIn !== null}
                          >
                            {checkingIn === outcome ? '正在保存…' : CHECK_IN_LABELS[outcome]}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p>{experiment.state === 'completed' ? '这项行动已经完成。' : '这项行动目前暂停。'}</p>
                  )}
                </div>
              )}
              {experimentStatus ? <p role="status">{experimentStatus}</p> : null}
            </section>
          ) : null}
        </>
      )}

      {weekEntries.length > 0 ? (
        <div className="review-actions">
          <Link href="/daily-mirror" className="btn-primary">{t('weekly.btn_write_today')}</Link>
          <Link href="/profile" className="btn-secondary">{t('weekly.btn_chat')}</Link>
        </div>
      ) : null}
    </main>
  );
}
