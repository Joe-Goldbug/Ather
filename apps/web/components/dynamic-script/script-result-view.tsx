// apps/web/components/dynamic-script/script-result-view.tsx
//
// Post-experience view shown after the user finishes a dynamic script.
// Renders:
//   - Server-generated observations grounded in completed playback
//   - Validation/revision badge if the script was revised or had warnings
//   - CTAs to go to /profile, /micro-sandbox (start another), or /

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CompleteDynamicSuccessResponse } from '@/lib/api-dynamic-script';
import { UnderstandingPanel } from '@/components/understanding/understanding-panel';

export interface ScriptResultViewProps {
  script: CompleteDynamicSuccessResponse;
  generationId?: string | null;
  labels: {
    title: string;
    narrativeLabel: string;
    comparisonLabel: string;
    revisedBadge: string;
    profileCta: string;
    anotherCta: string;
    homeCta: string;
  };
}

export function ScriptResultView({ script, labels, generationId }: ScriptResultViewProps) {
  const [playbackHash, setPlaybackHash] = useState<string | null>(null);
  useEffect(() => {
    const path = script.played_path;
    if (!generationId || !path?.length || !crypto.subtle) return;
    void crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(path))).then((digest) => {
      setPlaybackHash(Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join(''));
    }).catch(() => setPlaybackHash(null));
  }, [generationId, script.played_path]);
  return (
    <main className="report-container">
      <header className="report-header">
        <p className="report-date">{labels.title}</p>
        {script.revised && (
          <p className="revised-badge" role="status">
            {labels.revisedBadge}
          </p>
        )}
      </header>

      <section className="report-section share-card-hero">
        <p className="narrative-label">这次故事里的你</p>
        <p>{script.observations?.length ? script.psychological_narrative : '暂时没有可核对的作答观察。请回到故事确认作答已保存。'}</p>
      </section>
      {script.observations?.map((observation) => (
        <section className="report-section" key={observation.id}>
          <h2>{observation.title}</h2>
          <p>{observation.text}</p>
          <p className="report-detail">{observation.question}</p>
          <details>
            <summary>回看这条观察的情境与选择</summary>
            <p>{observation.evidence.situation}</p>
            <p>你的回应：{observation.evidence.choice_text}</p>
          </details>
          {generationId && playbackHash && <UnderstandingPanel
            title="想继续理解这里的反应？"
            intro="如果这段故事让你想到现实中的一件事，可以写下来。Eva 只会结合这段情境、你的选择和补充来回应。"
            source={{ kind: 'dynamic_result', generation_id: generationId, script_id: script.script_id, observation_id: observation.id, playback_hash: playbackHash }}
          />}
        </section>
      ))}
      <p className="report-detail">这些记录只对应这次故事，不说明你在现实里一定会这样做，也不替你解释没说出的感受。</p>

      <div className="report-actions">
        <Link href="/profile" className="btn-primary">{labels.profileCta}</Link>
        <Link href="/micro-sandbox?mode=dynamic" className="btn-secondary">
          {labels.anotherCta}
        </Link>
        <Link href="/" className="btn-tertiary">{labels.homeCta}</Link>
      </div>
    </main>
  );
}
