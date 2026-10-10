'use client';

import { useState, useRef } from 'react';
import { capturesApi, type CaptureRecord } from '@/lib/api';
import { useLocale } from '../providers-impl';
import { notesCopy } from './notes-copy';

export function CaptureForm({ onCaptured }: { onCaptured?: (capture: CaptureRecord) => void }) {
  const { locale } = useLocale();
  const copy = notesCopy(locale);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    const now = new Date();
    try {
      const capture = await capturesApi.create({
        entry_type: 'quick_fragment', process_mode: 'save_only', modality: 'text',
        raw_text: text.trim(),
        local_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setText('');
      onCaptured?.(capture);
    } catch { setError(copy.failed); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <div className="eva-notes-compose">
      <form className="eva-notes-editor" onSubmit={(event) => void save(event)}>
        <label htmlFor="eva-note-text"><h2>{copy.prompt}</h2></label>
        <p className="eva-notes-muted">{copy.hint}</p>
        <textarea id="eva-note-text" value={text} rows={7} maxLength={10000}
          placeholder={copy.placeholder} onChange={(event) => setText(event.target.value)} disabled={busy} required />
        <p className="eva-notes-muted">{copy.privacy}</p>
        <div className="eva-notes-actions">
          <button type="submit" className="btn-primary" disabled={!text.trim() || busy} aria-busy={busy}>
            {busy ? copy.busy : copy.save}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        <details><summary>{copy.help}</summary><p>{copy.event}</p><p>{copy.action}</p><p>{copy.feeling}</p></details>
      </form>
      <aside className="eva-notes-prompts">
        <h3>{copy.ideas}</h3>
        {[copy.difficult, copy.positive, copy.different].map((prompt) => <p key={prompt}>{prompt}</p>)}
        <small>{copy.reminder}</small>
      </aside>
    </div>
  );
}
