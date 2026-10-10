'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useLocale } from '../providers-impl';
import { capturesApi, diaryApi, type CaptureRecord, type DiaryEntry, type NoteReview } from '@/lib/api';
import { useSession } from '@/hooks/useSession';
import { CaptureForm } from './capture-form';
import { NoteReviewPanel } from './note-review-panel';
import { notesCopy } from './notes-copy';

type NoteTab = 'write' | 'records' | 'review';
const PAGE_SIZE = 50;

export default function DailyMirrorPage() {
  const { locale } = useLocale();
  const copy = notesCopy(locale);
  const { user, loading: sessionLoading } = useSession();
  const [tab, setTab] = useState<NoteTab>('write');
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [archive, setArchive] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [moreCaptures, setMoreCaptures] = useState(false);
  const [moreArchive, setMoreArchive] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const owner = useRef(user?.id);
  const localWrites = useRef(new Map<string, CaptureRecord>());
  const captureOffset = useRef(0);
  const archiveOffset = useRef(0);
  owner.current = user?.id;

  const fetchRecords = useCallback(async () => {
    if (!user) return;
    const userId = user.id;
    setLoading(true); setError(false);
    const [notes, old] = await Promise.allSettled([capturesApi.list(PAGE_SIZE + 1), diaryApi.recent(PAGE_SIZE + 1)]);
    if (owner.current !== userId) return;
    if (notes.status === 'fulfilled') {
      captureOffset.current = Math.min(notes.value.length, PAGE_SIZE);
      const loaded = new Map(notes.value.slice(0, PAGE_SIZE).map((note) => [note.id, note]));
      for (const [id, note] of localWrites.current) loaded.set(id, note);
      setCaptures(Array.from(loaded.values()).sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime()));
      setMoreCaptures(notes.value.length > PAGE_SIZE);
    }
    if (old.status === 'fulfilled') {
      archiveOffset.current = Math.min(old.value.length, PAGE_SIZE);
      setArchive(old.value.slice(0, PAGE_SIZE)); setMoreArchive(old.value.length > PAGE_SIZE);
    }
    setError(notes.status === 'rejected' || old.status === 'rejected'); setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    localWrites.current.clear();
    setCaptures([]); setArchive([]); setOpenId(null); setSelected([]);
    void fetchRecords();
  }, [fetchRecords]);

  async function loadMore() {
    if (loadingMore || !user) return;
    const userId = user.id;
    setLoadingMore(true); setMoreError(false);
    try {
      const [notes, old] = await Promise.allSettled([
        moreCaptures ? capturesApi.list(PAGE_SIZE + 1, captureOffset.current) : Promise.resolve([]),
        moreArchive ? diaryApi.recent(PAGE_SIZE + 1, archiveOffset.current) : Promise.resolve([]),
      ]);
      if (owner.current !== userId) return;
      if (moreCaptures && notes.status === 'fulfilled') {
        captureOffset.current += Math.min(notes.value.length, PAGE_SIZE);
        setCaptures((current) => [...current, ...notes.value.slice(0, PAGE_SIZE).filter((row) => !current.some((note) => note.id === row.id))]);
        setMoreCaptures(notes.value.length > PAGE_SIZE);
      }
      if (moreArchive && old.status === 'fulfilled') {
        archiveOffset.current += Math.min(old.value.length, PAGE_SIZE);
        setArchive((current) => [...current, ...old.value.slice(0, PAGE_SIZE).filter((row) => !current.some((note) => note.id === row.id))]);
        setMoreArchive(old.value.length > PAGE_SIZE);
      }
      setMoreError(notes.status === 'rejected' || old.status === 'rejected');
    } finally { setLoadingMore(false); }
  }

  function saveReview(review: NoteReview) {
    if (owner.current !== user?.id) return;
    setCaptures((current) => current.map((capture) => capture.id === review.source_ids[0]
      ? (() => {
          const updated = { ...capture, note_reviews: [...(capture.note_reviews ?? []).filter((item) => item.id !== review.id), review] };
          localWrites.current.set(capture.id, updated);
          return updated;
        })()
      : capture));
  }
  async function openComparison(review: NoteReview) {
    if (loadingMore || !user) return;
    const userId = user.id;
    setLoadingMore(true); setMoreError(false);
    try {
      const missing = await Promise.all(review.source_ids.filter((id) => !captures.some((note) => note.id === id)).map((id) => capturesApi.get(id)));
      if (owner.current !== userId) return;
      setCaptures((current) => [...current, ...missing.filter((note) => !current.some((row) => row.id === note.id))]);
      setSelected(review.source_ids);
    } catch { setMoreError(true); }
    finally { setLoadingMore(false); }
  }
  const detail = captures.find((capture) => capture.id === openId);
  const sources = captures.filter((capture) => selected.includes(capture.id)).sort((a, b) => a.id.localeCompare(b.id));
  const allComparisons = captures.flatMap((capture) => capture.note_reviews ?? []).filter((review) => review.kind === 'comparison');
  const comparisonReviews = allComparisons.filter((review) => review.source_ids.join(',') === sources.map((source) => source.id).join(','));
  const comparisonGroups = new Map<string, NoteReview>();
  for (const review of allComparisons) {
    const key = review.source_ids.join(',');
    if ((comparisonGroups.get(key)?.revision ?? 0) < review.revision) comparisonGroups.set(key, review);
  }
  const tabs: NoteTab[] = ['write', 'records', 'review'];
  const listControls = (
    <>
      {loading && <p role="status">{copy.loading}</p>}
      {!loading && error && <div role="alert"><p>{copy.incomplete}</p><button type="button" onClick={() => void fetchRecords()}>{copy.retry}</button></div>}
      {!loading && (moreCaptures || moreArchive) && <button type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? copy.loading : copy.more}</button>}
      {moreError && <p role="alert">{copy.incomplete}</p>}
    </>
  );

  if (sessionLoading) return <main className="eva-notes"><p>{copy.loading}</p></main>;
  if (!user) return <main className="eva-notes"><Link href="/login?returnTo=%2Fdaily-mirror">{copy.loginRequired}</Link></main>;

  return (
    <main className="eva-notes">
      <header className="eva-notes-heading"><h1>{copy.title}</h1><p>{copy.subtitle}</p></header>
      <div className="eva-notes-tabs" role="tablist" aria-label={copy.title}>
        {tabs.map((name, index) => (
          <button key={name} id={`note-tab-${name}`} role="tab" type="button"
            aria-selected={tab === name} aria-controls={`note-panel-${name}`} tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
              else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = tabs.length - 1;
              else return;
              event.preventDefault(); setTab(tabs[next]); document.getElementById(`note-tab-${tabs[next]}`)?.focus();
            }}>{copy[name]}</button>
        ))}
      </div>
      <section hidden={tab !== 'write'} id="note-panel-write" role="tabpanel" aria-labelledby="note-tab-write">
        <CaptureForm key={user.id} onCaptured={(capture) => {
          if (owner.current !== user.id) return;
          localWrites.current.set(capture.id, capture);
          setCaptures((current) => [capture, ...current.filter((item) => item.id !== capture.id)]);
          setOpenId(capture.id); setTab('records');
        }} />
      </section>
      <section hidden={tab !== 'records'} id="note-panel-records" role="tabpanel" aria-labelledby="note-tab-records">
        {detail ? (
          <article className="eva-notes-detail">
            <button type="button" className="eva-notes-link" onClick={() => setOpenId(null)}>{copy.back}</button>
            <p className="eva-notes-muted">{String(detail.local_date ?? detail.captured_at).slice(0, 10)}</p>
            <h2>{copy.original}</h2><blockquote className="eva-notes-original">{detail.raw_text}</blockquote>
            <NoteReviewPanel key={detail.id} reviews={(detail.note_reviews ?? []).filter((item) => item.kind === 'single')}
              sources={[detail]} onSaved={saveReview} />
            {!!detail.interpretations?.length && <details><summary>{copy.oldCues}</summary>
              {detail.interpretations.map((cue) => <p key={cue.id}>{cue.ai_explanation}</p>)}
            </details>}
          </article>
        ) : (
          <>
            {!loading && !error && !captures.length && !archive.length && <p>{copy.empty}</p>}
            {captures.map((capture) => {
              const latest = [...(capture.note_reviews ?? [])].filter((review) => review.kind === 'single').sort((a, b) => b.revision - a.revision)[0];
              return <article className="eva-notes-entry" key={capture.id}>
              <div className="eva-notes-row"><time>{String(capture.local_date ?? capture.captured_at).slice(0, 10)}</time>
                <span className="eva-notes-tag">{!latest ? copy.noAnalysis : latest.feedback.some((feedback) => feedback.response === 'wrong') ? copy.disputed : copy.pending}</span></div>
              <p className="eva-notes-excerpt">{capture.raw_text}</p>
              <button type="button" className="eva-notes-link" onClick={() => setOpenId(capture.id)}>{copy.open} →</button>
            </article>;
            })}
            {archive.map((entry) => <article className="eva-notes-entry" key={entry.id}>
              <time>{String(entry.entry_date ?? entry.created_at).slice(0, 10)}</time>
              <p>{entry.content?.detail || entry.content?.high_point || entry.content?.low_point || entry.content?.pattern_noticed}</p>
            </article>)}
            {listControls}
          </>
        )}
      </section>
      <section hidden={tab !== 'review'} id="note-panel-review" role="tabpanel" aria-labelledby="note-tab-review">
        <h2>{copy.choose}</h2><p className="eva-notes-muted">{copy.chooseHint}</p>
        <div className="eva-notes-selection">
          {captures.map((capture) => <label key={capture.id}>
            <input type="checkbox" checked={selected.includes(capture.id)}
              disabled={selected.length >= 4 && !selected.includes(capture.id)}
              onChange={(event) => setSelected((current) => event.target.checked
                ? [...current, capture.id] : current.filter((id) => id !== capture.id))} />
            <span><time>{String(capture.local_date ?? capture.captured_at).slice(0, 10)}</time><span className="eva-notes-excerpt">{capture.raw_text}</span></span>
          </label>)}
        </div>
        <p className="eva-notes-muted">{selected.length} {copy.selection}</p>
        {sources.length >= 2 && sources.length === selected.length ? <div className="eva-notes-detail">
          <div className="eva-notes-source-grid">{sources.map((source) => <blockquote key={source.id}>
            <time>{String(source.local_date ?? source.captured_at).slice(0, 10)}</time><p>{source.raw_text}</p>
          </blockquote>)}</div>
          <NoteReviewPanel key={sources.map((source) => source.id).join(',')} sources={sources} reviews={comparisonReviews} onSaved={saveReview} />
        </div> : <p>{copy.noReview}</p>}
        {!!comparisonGroups.size && <details><summary>{copy.savedReviews}</summary>
          {Array.from(comparisonGroups.values()).map((review) => <button key={review.id} type="button" className="eva-notes-entry"
            disabled={loadingMore} onClick={() => void openComparison(review)}>{review.content.reaction.text}</button>)}
        </details>}
        {listControls}
      </section>
    </main>
  );
}
