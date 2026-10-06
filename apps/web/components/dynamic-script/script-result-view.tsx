// apps/web/components/dynamic-script/script-result-view.tsx
//
// Post-experience view shown after the user finishes a dynamic script.
// Renders:
//   - The AI-generated psychological narrative (M3 narrative output)
//   - Optional comparison_summary vs the user's last dynamic-script run
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
        <p className="narrative-label">{labels.narrativeLabel}</p>
        <p>{script.psychological_narrative}</p>
      </section>

      {script.comparison_summary && (
        <section className="report-section">
          <p className="comparison-label">{labels.comparisonLabel}</p>
          <p>{script.comparison_summary}</p>
        </section>
      )}

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