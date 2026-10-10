'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from '../providers-impl';
import { applySessionUser } from '@/hooks/useSession';
import {
  authApi,
  consentApi,
  portraitV1Api,
  accountApi,
  themeAssessmentApi,
  API_BASE,
  clearActiveRound,
  readActiveRound,
  type ActiveRoundRef,
  type AuthUser,
  type PortraitV1Response,
  type ThemeRoundHistoryItem,
  type RecordUsageScope,
} from '@/lib/api';
import {
  ProfilePortraitView,
} from '@/components/portrait-sections';

const COMPLETED_PAGE_SIZE = 5;

export default function ProfilePage() {
  const { locale, t } = useLocale();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [portrait, setPortrait] = useState<PortraitV1Response | null>(null);
  const [themeRounds, setThemeRounds] = useState<ThemeRoundHistoryItem[]>([]);
  const [overviewTab, setOverviewTab] = useState<'completed' | 'active'>('completed');
  const [completedPage, setCompletedPage] = useState(1);
  const [activeRound, setActiveRound] = useState<ActiveRoundRef | null>(null);
  const [abandoning, setAbandoning] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
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
      setPortraitError('');
      setScopeError('');
      setScopeSuccess('');

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
        const [portraitData, themeRoundRows, scopeData] = await Promise.all([
          portraitV1Api.current().catch((err: Error) => {
            if (!cancelled) setPortraitError(err.message || t('profile.load_failed'));
            return null;
          }),
          themeAssessmentApi.history().catch(() => []),
          consentApi.getRecordScope?.()?.catch?.(() => ({ scope: 'unset' as const })) ?? Promise.resolve({ scope: 'unset' as const }),
        ]);

        if (cancelled) return;
        setPortrait((portraitData as PortraitV1Response | null) ?? null);
        setThemeRounds(Array.isArray(themeRoundRows) ? themeRoundRows as ThemeRoundHistoryItem[] : []);
        setActiveRound(readActiveRound());
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
  }, [locale]);

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

  /** 保存昵称/头像：昵称变化走 PATCH /profile/me，选了文件走 POST /profile/avatar */
  async function saveProfile() {
    if (profileSaving) return;
    setProfileSaving(true);
    setProfileMsg('');
    try {
      let nextName = user?.name ?? null;
      let nextAvatar = user?.avatar_url ?? null;
      const trimmed = nameDraft.trim();
      if (trimmed && trimmed !== (user?.name ?? '')) {
        const updated = await accountApi.updateName(trimmed);
        nextName = updated.name;
      }
      if (avatarFile) {
        const uploaded = await accountApi.uploadAvatar(avatarFile);
        nextAvatar = uploaded.avatar_url;
      }
      if (user) {
        const nextUser = { ...user, name: nextName, avatar_url: nextAvatar };
        setUser(nextUser);
        // 同步到 useSession 全局缓存，左上角顶栏头像/名称立即刷新
        applySessionUser(nextUser);
      }
      setProfileMsg('已保存');
      setAvatarFile(null);
      window.setTimeout(() => setProfileDialogOpen(false), 600);
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : '保存失败，请稍后重试。');
    } finally {
      setProfileSaving(false);
    }
  }

  /** 放弃进行中的轮次：服务端标记 abandoned + 清除浏览器暂存 */
  async function abandonActiveRound() {
    if (!activeRound || abandoning) return;
    setAbandoning(true);
    try {
      await themeAssessmentApi.abandon(activeRound.roundId);
    } catch {
      // 404（轮次已不存在/已完成）等情况下也照样清掉本地暂存，保证 UI 一致
    } finally {
      clearActiveRound();
      setActiveRound(null);
      setAbandoning(false);
    }
  }

  if (loading)
    return (
      <main className="profile-page">
        <p>{t('common.loading')}</p>
      </main>
    );  if (error)
    return (
      <main className="profile-page">
        <p className="error">{error}</p>
      </main>
    );
  if (!user) return null;

  return (
    <main className="page-container-minimal theme-profile-page">
      {/* User Toolbar */}
      <div className="minimal-header" style={{ justifyContent: 'flex-end', marginBottom: '24px' }}>
        <div className="minimal-user-badge">
          <span>{user.email}</span>
          <button onClick={logout} className="minimal-logout">
            {t('profile.logout')}
          </button>
        </div>
      </div>

      {/* Dashboard Grid — 左栏：身份卡 + EVA 记录 + 认知权限；右栏：多轮观察总览 + 数据导出 */}
      <div className="dashboard-grid-minimal">
        <div className="left-col">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 身份卡：头像 + 名称 + 编辑入口 */}
            <div className="section-card handdrawn-box" data-testid="identity-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${API_BASE}${user.avatar_url}`}
                    alt="头像"
                    style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover' }}
                    data-testid="avatar-image"
                  />
                ) : (
                  <div
                    style={{
                      width: '56px', height: '56px', borderRadius: '50%',
                      background: 'var(--paper, #f5f2ea)', border: '1px dashed var(--ink, #1a1a1a)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '20px', color: 'var(--ink, #1a1a1a)',
                    }}
                    data-testid="avatar-initial"
                  >
                    {(user.name?.[0] ?? user.email[0] ?? '?').toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, wordBreak: 'break-all' }} data-testid="display-name">
                    {user.name ?? user.email.split('@')[0]}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', opacity: 0.65, wordBreak: 'break-all' }}>{user.email}</p>
                </div>
              </div>
              <button
                className="btn-secondary"
                style={{ marginTop: '12px', width: '100%' }}
                onClick={() => {
                  setNameDraft(user.name ?? '');
                  setProfileMsg('');
                  setProfileDialogOpen(true);
                }}
                data-testid="open-profile-editor"
              >
                编辑名称与头像
              </button>

              {profileDialogOpen && createPortal(
                <div
                  style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8vh', zIndex: 9999 }}
                  onClick={() => setProfileDialogOpen(false)}
                >
                  <div
                    role="dialog"
                    aria-label="编辑个人资料"
                    className="section-card handdrawn-box"
                    style={{ width: 'min(420px, 92vw)', background: 'var(--paper, #fff)', zIndex: 9999, position: 'relative' }}
                    onClick={(e) => e.stopPropagation()}
                    data-testid="profile-editor-dialog"
                  >
                    <div className="section-title">编辑个人资料</div>

                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>名称</label>
                    <input
                      value={nameDraft}
                      maxLength={30}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder="1-30 个字符"
                      style={{ width: '100%', padding: '8px 10px', marginBottom: '12px' }}
                      data-testid="name-input"
                    />

                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>头像（≤2MB，jpg/png/webp/gif）</label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                      style={{ width: '100%', marginBottom: '12px' }}
                      data-testid="avatar-input"
                    />

                    {profileMsg && <p className="report-detail" data-testid="profile-msg">{profileMsg}</p>}

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button className="btn-secondary" onClick={() => setProfileDialogOpen(false)}>取消</button>
                      <button className="btn-save-minimal" onClick={saveProfile} disabled={profileSaving} data-testid="save-profile">
                        {profileSaving ? '保存中…' : '保存'}
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </div>

            {/* EVA 当前记录 */}
            <div className="section-card handdrawn-box">
              <div className="section-title">EVA 当前记录</div>
              <ProfilePortraitView data={portrait} loading={false} error={portraitError} />
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
          </div>
        </div>

        <div className="right-col">
          <div className="section-card handdrawn-box">
            <div className="section-title">多轮观察总览</div>

            {/* 标签页：成功完成的记录（服务端，分页） / 进行中（浏览器本地，最多一条） */}
            <div className="overview-tabs" role="tablist" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button
                role="tab"
                aria-selected={overviewTab === 'completed'}
                onClick={() => setOverviewTab('completed')}
                className="btn-secondary"
                style={{
                  borderColor: overviewTab === 'completed' ? 'var(--ink, #1a1a1a)' : 'transparent',
                  fontWeight: overviewTab === 'completed' ? 600 : 400,
                }}
                data-testid="overview-tab-completed"
              >
                成功完成的记录
              </button>
              <button
                role="tab"
                aria-selected={overviewTab === 'active'}
                onClick={() => setOverviewTab('active')}
                className="btn-secondary"
                style={{
                  borderColor: overviewTab === 'active' ? 'var(--ink, #1a1a1a)' : 'transparent',
                  fontWeight: overviewTab === 'active' ? 600 : 400,
                }}
                data-testid="overview-tab-active"
              >
                进行中{activeRound ? ' (1)' : ' (0)'}
              </button>
            </div>

            {overviewTab === 'completed' && (() => {
              const completedRounds = themeRounds.filter(
                (round) => round.status === 'completed' || round.status === 'withheld'
              );
              const pageCount = Math.max(1, Math.ceil(completedRounds.length / COMPLETED_PAGE_SIZE));
              const safePage = Math.min(completedPage, pageCount);
              const pageRounds = completedRounds.slice(
                (safePage - 1) * COMPLETED_PAGE_SIZE,
                safePage * COMPLETED_PAGE_SIZE
              );
              if (completedRounds.length === 0) {
                return (
                  <p className="empty-state-text">
                    完成主题测试后，这里会按时间保留每一轮可回看的选择与侧写。
                  </p>
                );
              }
              return (
                <>
                  <div className="evidence-nodes">
                    {pageRounds.map((round) => (
                      <div key={round.id} className="evidence-node">
                        <div className="evidence-node-meta">
                          <span className="evidence-node-source">{round.theme_title}</span>
                          <span>
                            {round.completed_at
                              ? new Date(round.completed_at).toLocaleDateString(locale)
                              : ''}
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
                      </div>
                    ))}
                  </div>
                  {pageCount > 1 && (
                    <div className="overview-pagination" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                      <button
                        className="btn-secondary"
                        disabled={safePage <= 1}
                        onClick={() => setCompletedPage(safePage - 1)}
                        data-testid="overview-prev-page"
                      >
                        上一页
                      </button>
                      <span>第 {safePage} / {pageCount} 页 · 共 {completedRounds.length} 条</span>
                      <button
                        className="btn-secondary"
                        disabled={safePage >= pageCount}
                        onClick={() => setCompletedPage(safePage + 1)}
                        data-testid="overview-next-page"
                      >
                        下一页
                      </button>
                    </div>
                  )}
                </>
              );
            })()}

            {overviewTab === 'active' && (
              activeRound ? (
                <div className="evidence-node" data-testid="active-round-card">
                  <div className="evidence-node-meta">
                    <span className="evidence-node-source">{activeRound.themeTitle}</span>
                    <span>进行中</span>
                  </div>
                  <p className="report-detail">
                    {activeRound.updatedAt
                      ? `最后活动：${new Date(activeRound.updatedAt).toLocaleString(locale)}`
                      : '这轮测试还没有完成，可以随时回来继续作答。'}
                  </p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <Link
                      href={`/theme-assessment?roundId=${encodeURIComponent(activeRound.roundId)}`}
                      className="evidence-node-link"
                      data-testid="resume-active-round"
                    >
                      继续这一轮
                    </Link>
                    <button
                      className="btn-secondary"
                      onClick={abandonActiveRound}
                      disabled={abandoning}
                      data-testid="abandon-active-round"
                    >
                      {abandoning ? '放弃中…' : '放弃这一轮'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="empty-state-text">当前没有进行中的测试。开始一轮新的主题测试后，可以在这里随时续玩。</p>
              )
            )}

            <Link href="/theme-assessment" className="btn-secondary">
              继续主题测试
            </Link>
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
