export function buildReportJson() {
  return {
    reportVersion: 'evidence-v1' as const,
    evidenceHighlights: [],
    limitations: ['本地 mock 没有正式证据，因此目前无法判断长期模式。'],
    summary: '本地 mock 已返回空的证据报告。',
  };
}
