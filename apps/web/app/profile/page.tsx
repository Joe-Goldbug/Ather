'use client';

import { useEffect, useRef, useState } from 'react';
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
  type RecordUsageScope,
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
  const routerRef = useRef(router);
  routerRef.current = router;
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
  const [recordScope, setRecordScopeState] = useState<RecordUsageScope | 'unset'>('unset');
  const [scopeSaving, setScopeSaving] = useState(false);
  const [scopeError, setScopeError] = useState('');
  const [scopeSuccess, setScopeSuccess] = useState('');

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
        routerRef.current.replace('/login');
        return;
      }

      try {
        const [evidenceRows, portraitData, observationRows, themeRoundRows, scopeData] = await Promise.all([
          evidenceApi.getByDimension().catch(() => []),
          portraitV1Api.current().catch((err: Error) => {
            if (!cancelled) setPortraitError(err.message || t('profile.load_failed'));
            return null;
          }),
          observationsV1Api.list().catch(() => []),
          themeAssessmentApi.history().catch(() => []),
          consentApi.getRecordScope?.()?.catch?.(() => ({ scope: 'unset' as const })) ?? Promise.resolve({ scope: 'unset' as const }),
        ]);

        if (cancelled) return;
        setPortraitEvidence(Array.isArray(evidenceRows) ? evidenceRows as EvidenceRow[] : []);
        setPortrait((portraitData as PortraitV1Response | null) ?? null);
        setPublishedObservations(Array.isArray(observationRows) ? observationRows as PublishedObservationV1[] : []);
        setThemeRounds(Array.isArray(themeRoundRows) ? themeRoundRows as ThemeRoundHistoryItem[] : []);
        setRecordScopeState(scopeData?.scope ?? 'unset');
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
  }, []);

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

  async function handleUpdateScope(newScope: RecordUsageScope) {
    if (scopeSaving || recordScope === newScope) return;
    setScopeSaving(true);
    setScopeError('');
    setScopeSuccess('');
    try {
      const res = await consentApi.setRecordScope(newScope);
      setRecordScopeState(res?.scope ?? newScope);
      setScopeSuccess('权限范围设置已更新并生效');
    } catch (err: any) {
      setScopeError(err?.message || '更新权限设置失败，原设置保持不变');
    } finally {
      setScopeSaving(false);
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
          EVA
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
          {t('nav.dashboard')}
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

          {/* 账号级认知记录使用范围设置 */}
          <div className="section-card handdrawn-box" data-testid="record-scope-card">
            <div className="section-title">
              认知记录使用权限
              <span className="count">
                {recordScope === 'store_only'
                  ? '仅本地保存'
                  : recordScope === 'analyze_permitted'
                  ? '允许心智分析'
                  : recordScope === 'share_permitted'
                  ? '允许授权分享'
                  : '尚未设置'}
              </span>
            </div>
            <p className="report-detail text-sm text-neutral-600 mb-4">
              控制 Eva 引擎如何使用您的全量心智与行为记录。此为<strong>账号级全局偏好</strong>，单条记录的纠正自述依然在各卡片中独立生效。
            </p>

            <div className="space-y-3 mb-4">
              <label
                className={`block p-3 border rounded-xl cursor-pointer transition ${
                  recordScope === 'store_only'
                    ? 'border-neutral-900 bg-neutral-50 font-medium'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="recordScope"
                      value="store_only"
                      checked={recordScope === 'store_only'}
                      onChange={() => void handleUpdateScope('store_only')}
                      disabled={scopeSaving}
                      className="text-neutral-900"
                    />
                    <span>💾 仅保存历史 (Store Only)</span>
                  </div>
                  <span className="text-xs text-neutral-500">最高隐私</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1 pl-6">
                  仅供个人浏览与导出。Eva 聊天与后台分析将<strong>完全停止读取历史记忆</strong>，不生成周报与聚合画像。
                </p>
              </label>

              <label
                className={`block p-3 border rounded-xl cursor-pointer transition ${
                  recordScope === 'analyze_permitted'
                    ? 'border-neutral-900 bg-neutral-50 font-medium'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="recordScope"
                      value="analyze_permitted"
                      checked={recordScope === 'analyze_permitted'}
                      onChange={() => void handleUpdateScope('analyze_permitted')}
                      disabled={scopeSaving}
                      className="text-neutral-900"
                    />
                    <span>🧠 允许心智分析 (Analyze Permitted)</span>
                  </div>
                  <span className="text-xs text-emerald-600 font-medium">推荐模式</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1 pl-6">
                  允许 Eva 在对话中唤醒记忆，持续提炼您的思考模式、更新心智画像并生成周度实验建议。
                </p>
              </label>

              <label
                className={`block p-3 border rounded-xl cursor-pointer transition ${
                  recordScope === 'share_permitted'
                    ? 'border-neutral-900 bg-neutral-50 font-medium'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="recordScope"
                      value="share_permitted"
                      checked={recordScope === 'share_permitted'}
                      onChange={() => void handleUpdateScope('share_permitted')}
                      disabled={scopeSaving}
                      className="text-neutral-900"
                    />
                    <span>🌐 允许授权分享 (Share Permitted)</span>
                  </div>
                  <span className="text-xs text-blue-600 font-medium">开放互通</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1 pl-6">
                  在心智分析基础上，允许生成可离线验真的防伪凭证，并可向第三方指定 Agent 授权访问。
                </p>
              </label>
            </div>

            {scopeSaving && <p className="text-xs text-neutral-500">正在同步权限设置到数据库事务...</p>}
            {scopeSuccess && <p className="text-xs text-emerald-600 font-medium">{scopeSuccess}</p>}
            {scopeError && <p className="text-xs text-rose-600 font-medium" role="alert">{scopeError}</p>}
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
