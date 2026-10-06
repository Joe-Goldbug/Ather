// apps/web/app/daily-mirror/page.tsx — "记录" page (Task 26: captures + archive timeline)
// Replaces the old diary submission flow with CaptureForm.
// Timeline merges captures (new, editable) + legacy diary archive (old, read-only).
// Supports one-day-many-entries (no daily limit).
// Requirements: 5.1, 5.2, 5.3, 5.4, 5.5

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useLocale } from '../providers-impl';
import { getIntlLocale } from '@/lib/i18n';
import {
  capturesApi,
  diaryApi,
  type CaptureRecord,
  type DiaryEntry,
} from '@/lib/api';
import { useSession } from '@/hooks/useSession';
import { CaptureForm } from './capture-form';

// ── Timeline Item Types ──────────────────────────────────────────────────────

interface TimelineCapture {
  kind: 'capture';
  id: string;
  date: string; // ISO or YYYY-MM-DD
  timestamp: number;
  data: CaptureRecord;
}

interface TimelineDiary {
  kind: 'legacy_diary';
  id: string;
  date: string;
  timestamp: number;
  data: DiaryEntry;
}

type TimelineItem = TimelineCapture | TimelineDiary;

const CAPTURE_PAGE_SIZE = 50;
const LEGACY_PAGE_SIZE = 50;

// ── Helper: group timeline items by local date ───────────────────────────────

function groupByDate(items: TimelineItem[]): Map<string, TimelineItem[]> {
  const grouped = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const dateKey = item.date.slice(0, 10); // YYYY-MM-DD
    const existing = grouped.get(dateKey) ?? [];
    existing.push(item);
    grouped.set(dateKey, existing);
  }
  return grouped;
}

// ── Entry type labels ────────────────────────────────────────────────────────

// ── Main Page ────────────────────────────────────────────────────────────────

export default function DailyMirrorPage() {
  const { locale, t } = useLocale();
  const { user, loading: sessionLoading } = useSession();
  const [mounted, setMounted] = useState(false);

  // Timeline data
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [legacyDiaryEntries, setLegacyDiaryEntries] = useState<DiaryEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [timelineError, setTimelineError] = useState(false);
  const [hasMoreCaptures, setHasMoreCaptures] = useState(false);
  const [hasMoreLegacy, setHasMoreLegacy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [activeCaptureId, setActiveCaptureId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch captures and archived diary entries
  const fetchTimeline = useCallback(async () => {
    if (!user) return;
    setTimelineLoading(true);
    setTimelineError(false);
    try {
      const [captureResult, legacyDiaryResult] = await Promise.allSettled([
        capturesApi.list(CAPTURE_PAGE_SIZE + 1),
        diaryApi.recent(LEGACY_PAGE_SIZE + 1),
      ]);
      if (captureResult.status === 'fulfilled') {
        setCaptures(captureResult.value.slice(0, CAPTURE_PAGE_SIZE));
        setHasMoreCaptures(captureResult.value.length > CAPTURE_PAGE_SIZE);
      }
      if (legacyDiaryResult.status === 'fulfilled') {
        setLegacyDiaryEntries(legacyDiaryResult.value.slice(0, LEGACY_PAGE_SIZE));
        setHasMoreLegacy(legacyDiaryResult.value.length > LEGACY_PAGE_SIZE);
      }
      setTimelineError(captureResult.status === 'rejected' || legacyDiaryResult.status === 'rejected');
    } finally {
      setTimelineLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchTimeline();
  }, [fetchTimeline]);

  // Build merged timeline
  const timelineItems: TimelineItem[] = [
    ...captures.map((c): TimelineCapture => ({
      kind: 'capture',
      id: c.id,
      date: c.local_date || c.captured_at,
      timestamp: new Date(c.captured_at).getTime(),
      data: c,
    })),
    ...legacyDiaryEntries.map((d): TimelineDiary => ({
      kind: 'legacy_diary',
      id: d.id,
      date: d.entry_date || d.created_at,
      timestamp: new Date(d.created_at).getTime(),
      data: d,
    })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  const grouped = groupByDate(timelineItems);

  // Handle new capture added
  function handleCaptured(capture: CaptureRecord): void {
    setActiveCaptureId(capture.id);
    setCaptures((prev) => [capture, ...prev]);
  }

  async function loadMore(): Promise<void> {
    if (loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    const loadCaptures = hasMoreCaptures;
    const loadLegacy = hasMoreLegacy;
    try {
      const [captureResult, legacyResult] = await Promise.allSettled([
        loadCaptures ? capturesApi.list(CAPTURE_PAGE_SIZE + 1, captures.length) : Promise.resolve([] as CaptureRecord[]),
        loadLegacy ? diaryApi.recent(LEGACY_PAGE_SIZE + 1, legacyDiaryEntries.length) : Promise.resolve([] as DiaryEntry[]),
      ]);
      if (loadCaptures && captureResult.status === 'fulfilled') {
        const page = captureResult.value.slice(0, CAPTURE_PAGE_SIZE);
        setCaptures((current) => {
          const known = new Set(current.map((entry) => entry.id));
          return [...current, ...page.filter((entry) => !known.has(entry.id))];
        });
        setHasMoreCaptures(captureResult.value.length > CAPTURE_PAGE_SIZE);
      }
      if (loadLegacy && legacyResult.status === 'fulfilled') {
        const page = legacyResult.value.slice(0, LEGACY_PAGE_SIZE);
        setLegacyDiaryEntries((current) => {
          const known = new Set(current.map((entry) => entry.id));
          return [...current, ...page.filter((entry) => !known.has(entry.id))];
        });
        setHasMoreLegacy(legacyResult.value.length > LEGACY_PAGE_SIZE);
      }
      setMoreError((loadCaptures && captureResult.status === 'rejected') ||
        (loadLegacy && legacyResult.status === 'rejected'));
    } finally {
      setLoadingMore(false);
    }
  }

  const localeDate = mounted
    ? new Date().toLocaleDateString(getIntlLocale(locale), {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  if (sessionLoading) {
    return (
      <main className="diary-container">
        <p>{t('common.loading')}</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="diary-container">
        <p>{t('diary.auth_required')}</p>
        <Link href="/login?returnTo=%2Fdaily-mirror" className="btn-primary">
          {t('micro_sandbox.btn_login')} →
        </Link>
      </main>
    );
  }

  return (
    <main className="diary-container">
      <header className="diary-header">
        <h1>{t('diary.page_title')}</h1>
        <p className="diary-hint">{t('diary.page_hint')}</p>
        <p className="diary-date">{localeDate}</p>
      </header>

      {/* Capture Form */}
      <section aria-label={t('diary.new_entry_label')}>
        <CaptureForm
          onCaptured={handleCaptured}
          onCaptureUpdated={(updated) => setCaptures((current) => current.map((capture) =>
            capture.id === updated.id ? updated : capture))}
        />
      </section>

      {/* Timeline */}
      <section className="capture-timeline" aria-label={t('diary.timeline_label')}>
        <h2 className="timeline-title">{t('diary.timeline_title')}</h2>

        {timelineLoading && <p className="timeline-loading">{t('common.loading')}</p>}

        {!timelineLoading && timelineError && (
          <div role="alert">
            <p>{t('diary.timeline_load_failed')}</p>
            <button type="button" onClick={() => void fetchTimeline()}>{t('diary.timeline_retry')}</button>
          </div>
        )}

        {!timelineLoading && !timelineError && timelineItems.length === 0 && (
          <p className="timeline-empty">{t('diary.timeline_empty')}</p>
        )}

        {!timelineLoading &&
          Array.from(grouped.entries()).map(([dateKey, items]) => (
            <div key={dateKey} className="timeline-day">
              <h3 className="timeline-day-label">
                {mounted
                  ? new Date(dateKey + 'T00:00:00').toLocaleDateString(getIntlLocale(locale), {
                      month: 'short',
                      day: 'numeric',
                      weekday: 'short',
                    })
                  : dateKey}
              </h3>
              <div className="timeline-items">
                {items.map((item) =>
                  item.kind === 'capture' ? (
                    <CaptureTimelineCard
                      key={item.id}
                      capture={item.data}
                      showInterpretations={item.id !== activeCaptureId}
                      onCaptureUpdated={(updated) => setCaptures((current) =>
                        current.map((capture) => capture.id === updated.id ? updated : capture))}
                    />
                  ) : (
                    <DiaryTimelineCard key={item.id} entry={item.data} />
                  ),
                )}
              </div>
            </div>
          ))}
        {!timelineLoading && !timelineError && (hasMoreCaptures || hasMoreLegacy) && (
          <button type="button" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? t('common.loading') : t('diary.timeline_load_more')}
          </button>
        )}
        {moreError && <p role="alert">{t('diary.timeline_more_failed')}</p>}
      </section>
    </main>
  );
}

// ── Capture Timeline Card ────────────────────────────────────────────────────

function CaptureTimelineCard({
  capture,
  showInterpretations,
  onCaptureUpdated,
}: {
  capture: CaptureRecord;
  showInterpretations: boolean;
  onCaptureUpdated: (capture: CaptureRecord) => void;
}) {
  const { t, locale } = useLocale();
  const [savingPermission, setSavingPermission] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmErrorId, setConfirmErrorId] = useState<string | null>(null);
  const [refutingId, setRefutingId] = useState<string | null>(null);
  const [refuteErrorId, setRefuteErrorId] = useState<string | null>(null);
  const typeLabel =
    capture.entry_type === 'quick_fragment'
      ? t('diary.entry_type_quick_fragment')
      : capture.entry_type === 'emotion_log'
        ? t('diary.entry_type_emotion_log')
        : capture.entry_type === 'decision_log'
          ? t('diary.entry_type_decision_log')
          : capture.entry_type;
  const time = new Date(capture.captured_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <article className="timeline-card timeline-card-capture" aria-label={t('diary.capture_card_label', { type: typeLabel })}>
      <div className="timeline-card-header">
        <span className={`timeline-badge badge-${capture.entry_type}`}>{typeLabel}</span>
        <time className="timeline-time">{time}</time>
      </div>
      <p className="timeline-card-text">{capture.raw_text}</p>
      {capture.mood_label && (
        <p className="timeline-card-mood">
          {capture.mood_label}
          {capture.mood_intensity ? ` · ${t('diary.mood_intensity', { value: capture.mood_intensity })}` : ''}
        </p>
      )}
      {capture.summary && (
        <p className="timeline-card-summary">{t('diary.summary_prefix')} {capture.summary}</p>
      )}
      {showInterpretations && capture.interpretations && capture.interpretations.length > 0 && (
        <div className="capture-result-interpretations">
          <strong>{t('diary.interpretations_label')}</strong>
          <p>{t('diary.interpretation_scope')}</p>
          {capture.interpretations.map((interp) => (
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
                  onClick={async () => {
                    setConfirmingId(interp.id);
                    setConfirmErrorId(null);
                    try {
                      await capturesApi.confirmInterpretation(capture.id, interp.id);
                      onCaptureUpdated({
                        ...capture,
                        interpretations: capture.interpretations?.map((item) =>
                          item.id === interp.id ? { ...item, status: 'confirmed' as const } : item),
                      });
                    } catch {
                      setConfirmErrorId(interp.id);
                    } finally {
                      setConfirmingId(null);
                    }
                  }}
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
                  onClick={async () => {
                    setRefutingId(interp.id);
                    setRefuteErrorId(null);
                    try {
                      await capturesApi.refuteInterpretation(capture.id, interp.id);
                      onCaptureUpdated({
                        ...capture,
                        interpretations: capture.interpretations?.map((item) =>
                          item.id === interp.id ? { ...item, status: 'refuted' as const } : item),
                      });
                    } catch {
                      setRefuteErrorId(interp.id);
                    } finally {
                      setRefutingId(null);
                    }
                  }}
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
      {capture.process_mode !== 'save_only' && (
        <button
          type="button"
          className="text-toggle"
          disabled={savingPermission}
          aria-busy={savingPermission}
          onClick={async () => {
            setSavingPermission(true);
            setPermissionError(false);
            try {
              const updated = await capturesApi.setWeeklyReviewPermission(capture.id, !capture.allow_weekly_review);
              onCaptureUpdated({ ...updated, interpretations: capture.interpretations });
            } catch {
              setPermissionError(true);
            } finally {
              setSavingPermission(false);
            }
          }}
        >
          {savingPermission && <span className="action-loading-spinner" aria-hidden="true" />}
          {savingPermission
            ? t('common.loading')
            : locale === 'en'
            ? `AI weekly review: ${capture.allow_weekly_review ? 'allowed, click to revoke' : 'off, click to allow'}`
            : locale === 'es'
              ? `Resumen semanal con IA: ${capture.allow_weekly_review ? 'permitido, pulsa para revocar' : 'desactivado, pulsa para permitir'}`
              : locale === 'ja'
                ? `AI週間レビュー: ${capture.allow_weekly_review ? '許可中、押すと取り消し' : 'オフ、押すと許可'}`
                : `AI 周回看：${capture.allow_weekly_review ? '已允许，点击撤回' : '未允许，点击授权'}`}
        </button>
      )}
      {permissionError && <p role="alert">{locale === 'zh-CN' ? '权限更新失败，请重试。' : 'Permission update failed.'}</p>}
      {capture.interpretations && capture.interpretations.length > 0 && (
        <div className="timeline-card-interps">
          {capture.interpretations.map((interp) => (
            <span
              key={interp.id}
              className={`interp-badge status-${interp.status}`}
            >
              {interp.dimension}: {interp.status === 'confirmed' ? t('diary.status_confirmed') : interp.status === 'pending' ? t('diary.status_pending') : t('diary.status_rejected')}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

// ── Diary Timeline Card (read-only archive) ──────────────────────────────────

function DiaryTimelineCard({ entry }: { entry: DiaryEntry }) {
  const { t } = useLocale();
  const content = entry.content ?? {};
  const text = content.detail || content.high_point || content.low_point || content.pattern_noticed || '';

  return (
    <article className="timeline-card timeline-card-diary" aria-label={t('diary.archive_card_label')}>
      <div className="timeline-card-header">
        <span className="timeline-badge badge-diary">{t('diary.archive_badge')}</span>
        <span className="badge-readonly" aria-label={t('diary.readonly_badge')}>{t('diary.readonly_badge')}</span>
      </div>
      {text && <p className="timeline-card-text">{text}</p>}
      {content.event_type && (
        <span className="timeline-card-tag">{content.event_type}</span>
      )}
    </article>
  );
}
