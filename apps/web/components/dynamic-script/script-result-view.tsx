// apps/web/components/dynamic-script/script-result-view.tsx
//
// Post-experience view shown after the user finishes a dynamic script.
// Renders:
//   - Server-generated observations grounded in completed playback
//   - Validation/revision badge if the script was revised or had warnings
//   - CTAs to go to /profile, /micro-sandbox (start another), or /

'use client';

import Link from 'next/link';
import type { CompleteDynamicSuccessResponse } from '@/lib/api-dynamic-script';

export interface ScriptResultViewProps {
  script: CompleteDynamicSuccessResponse;
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

export function ScriptResultView({ script, labels }: ScriptResultViewProps) {
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
