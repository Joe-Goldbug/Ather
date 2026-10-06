'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from '../providers-impl';
import {
  authApi,
  consentApi,
  evidenceApi,
  observationsV1Api,
  portraitV1Api,
  themeAssessmentApi,
  type AuthUser,
  type PortraitV1Response,
  type PublishedObservationV1,
  type ThemeRoundHistoryItem,
} from '@/lib/api';
import {
  ProfilePortraitView,
  PublishedObservationResponseSection,
} from '@/components/portrait-sections';

interface EvidenceRow {
  dimension: string;
  total: string;
  avg_confidence: string;
  weighted_delta: string | null;
  latest_at: string;
}

export default function ProfilePage() {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [portraitEvidence, setPortraitEvidence] = useState<EvidenceRow[]>([]);
  const [portrait, setPortrait] = useState<PortraitV1Response | null>(null);
  const [publishedObservations, setPublishedObservations] = useState<PublishedObservationV1[]>([]);
  const [themeRounds, setThemeRounds] = useState<ThemeRoundHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [portraitError, setPortraitError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const me = await authApi.me();
        if (cancelled) return;
        setUser(me);
      } catch {
        try {
          localStorage.removeItem('eva_token');
          localStorage.removeItem('eva_user_id');
        } catch {}
        router.replace('/login');
        return;
      }

      try {
        const [evidenceRows, portraitData, observationRows, themeRoundRows] = await Promise.all([
          evidenceApi.getByDimension().catch(() => []),
          portraitV1Api.current().catch((err: Error) => {
            if (!cancelled) setPortraitError(err.message || t('profile.load_failed'));
            return null;
          }),
          observationsV1Api.list().catch(() => []),
          themeAssessmentApi.history().catch(() => []),
        ]);

        if (cancelled) return;
        setPortraitEvidence(Array.isArray(evidenceRows) ? evidenceRows as EvidenceRow[] : []);
        setPortrait((portraitData as PortraitV1Response | null) ?? null);
        setPublishedObservations(Array.isArray(observationRows) ? observationRows as PublishedObservationV1[] : []);
        setThemeRounds(Array.isArray(themeRoundRows) ? themeRoundRows as ThemeRoundHistoryItem[] : []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t('profile.load_failed'));
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router, t]);

  async function logout() {
    try {
      await authApi.logout();
    } catch {}
    try {
      localStorage.removeItem('eva_token');
      localStorage.removeItem('eva_user_id');
    } catch {}
    router.push('/');
  }

  async function exportData() {
    if (exporting) return;
    setExporting(true);
    setExportError(false);
    try {
      const data = await consentApi.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = `eva-data-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }

  if (loading)
    return (
      <main className="profile-page">
        <p>{t('common.loading')}</p>
      </main>
    );
  if (error)
    return (
      <main className="profile-page">
        <p className="error">{error}</p>
      </main>
    );
  if (!user) return null;

  return (
    <main className="page-container-minimal theme-profile-page">
      {/* Minimal Header */}
      <header className="minimal-header">
        <div className="minimal-brand">
          EVA <span>/ Personality Analytics</span>
        </div>
        <div className="minimal-user-badge">
          <span>{user.email}</span>
          <button onClick={logout} className="minimal-logout">
            {t('profile.logout')}
          </button>
        </div>
      </header>

      {/* Minimal Navigation */}
      <nav className="minimal-nav" aria-label="Main navigation">
        <Link href="/profile" className="nav-link active">
          Dashboard
        </Link>
        <Link href="/theme-assessment" className="nav-link">
          {t('nav.assessment')}
        </Link>
        <Link href="/daily-mirror" className="nav-link">
          {t('nav.diary')}
        </Link>
      </nav>

      {/* Dashboard Grid */}
      <div className="dashboard-grid-minimal">
        <div className="left-col">
          <div className="section-card handdrawn-box">
            <div className="section-title">EVA 当前记录</div>
            <ProfilePortraitView data={portrait} loading={false} error={portraitError} />
          </div>
        </div>

        <div className="right-col">
          <div className="section-card handdrawn-box">
            <div className="section-title">多轮观察总览</div>
            {themeRounds.length === 0 ? (
              <p className="empty-state-text">
                完成主题测试后，这里会按时间保留每一轮可回看的选择与侧写。
              </p>
            ) : (
              <div className="evidence-nodes">
                {themeRounds.map((round) => (
                  <div key={round.id} className="evidence-node">
                    <div className="evidence-node-meta">
                      <span className="evidence-node-source">{round.theme_title}</span>
                      <span>
                        {round.completed_at
                          ? new Date(round.completed_at).toLocaleDateString(locale)
                          : '进行中'}
                      </span>
                    </div>
                    {round.feedback_state === 'needs_follow_up' && (
                      <p className="report-detail theme-round-feedback" data-testid="round-feedback-state">
                        {t('theme_round.historical_dispute_notice')}
                      </p>
                    )}
                    <p className="theme-round-headline">
                      {round.whole_result_refuted ? t('theme_round.whole_refuted_heading') : round.headline ?? '本轮尚未完成。'}
                    </p>
                    <div role={round.whole_result_refuted ? 'group' : undefined}
                      aria-label={round.whole_result_refuted ? t('theme_round.historical_result_label') : undefined}>
                      {round.whole_result_refuted && (
                        <p className="report-detail">{t('theme_round.historical_result_label')}</p>
                      )}
                      {round.whole_result_refuted && round.headline && (
                        <p className="report-detail">{t('theme_round.historical_conclusion_label')}：{round.headline}</p>
                      )}
                      {round.boundary && (
                        <p className="report-detail theme-round-boundary">{round.boundary}</p>
                      )}
                    </div>
                    {round.feedback_state === 'recorded' && (
                      <p className="report-detail theme-round-feedback" data-testid="round-feedback-state">
                        {t('theme_round.feedback_recorded')}
                      </p>
                    )}
                    {round.headline && (
                      <Link href={`/theme-assessment?roundId=${encodeURIComponent(round.id)}`} className="evidence-node-link">
                        查看本轮结果和反馈
                      </Link>
                    )}
                    {(round.status === 'in_progress' || round.status === 'ready_to_complete') && (
                      <Link href={`/theme-assessment?roundId=${encodeURIComponent(round.id)}`} className="evidence-node-link">
                        继续未完成主题轮
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
            <Link href="/theme-assessment" className="btn-secondary">
              继续主题测试
            </Link>
          </div>

          <div className="section-card handdrawn-box">
            <PublishedObservationResponseSection observations={publishedObservations} />
          </div>

          {/* Evidence Nodes */}
          <div className="section-card handdrawn-box">
            <div className="section-title">
              按主题整理的线索
              <span className="count">{portraitEvidence.length} 条</span>
            </div>
            {portraitEvidence.length === 0 ? (
              <p className="empty-state-text">{t('profile.no_evidence')}</p>
            ) : (
              <div className="evidence-nodes">
                {portraitEvidence.map((row, idx) => (
                  <div key={row.dimension} className="evidence-node">
                    <div className="evidence-node-meta">
                      <span className="evidence-node-source">
                        {t(`profile.dim_${row.dimension}`) ?? row.dimension}
                      </span>
                      <span>
                        {t('common.evidence_count')}: {row.total}
                      </span>
                    </div>
                    {idx < portraitEvidence.length - 1 && <hr className="hr-divider" />}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="section-card handdrawn-box">
            <div className="section-title">{t('profile.data_export_title')}</div>
            <p className="report-detail">{t('profile.data_export_description')}</p>
            <button type="button" className="btn-secondary" onClick={exportData} disabled={exporting}>
              {t(exporting ? 'profile.data_exporting' : 'profile.data_export_button')}
            </button>
            {exportError && <p className="error" role="alert">{t('profile.data_export_error')}</p>}
          </div>
        </div>
      </div>
    </main>
  );
}
