'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type {
  AdminSnapshot,
  AdminUserSummary,
  FeedbackItem,
  AdminQualitySummary,
  AdminMetricDefinition,
} from '../lib/types';
import { getMockSnapshot } from '../lib/mock-data';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  Eye,
  FileText,
  Filter,
  Key,
  LayoutDashboard,
  LockKeyhole,
  MessageSquareText,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Status = 'active' | 'inactive' | 'flagged';
type Page = 'overview' | 'users' | 'feedback' | 'quality';

const navItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: '总览', icon: LayoutDashboard },
  { id: 'users', label: '用户列表', icon: Users },
  { id: 'feedback', label: '反馈中心', icon: MessageSquareText },
  { id: 'quality', label: '质量实验室', icon: BarChart3 },
];

function MetricCard({
  label,
  value,
  note,
  trend,
  accent = false,
  onInspect,
}: {
  label: string;
  value: string;
  note: string;
  trend?: string;
  accent?: boolean;
  onInspect?: () => void;
}) {
  return (
    <div className={`metric-card ${accent ? 'metric-card-accent' : ''}`}>
      <div className="metric-label">
        {label}
        <button
          onClick={onInspect}
          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }}
          title="查看指标定义与计算口径"
        >
          <CircleHelp size={13} />
        </button>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">
        {trend && <span className="trend">{trend}</span>}
        {note}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const labels = { active: '活跃', inactive: '沉默', flagged: '需关注' };
  return (
    <span className={`status-pill status-${status}`}>
      <span className="status-dot" />
      {labels[status]}
    </span>
  );
}

function Confidence({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">—</span>;
  return (
    <span className={`confidence confidence-${value >= 75 ? 'high' : value >= 55 ? 'mid' : 'low'}`}>
      {value}%
    </span>
  );
}

export default function AdminHome() {
  const [page, setPage] = useState<Page>('overview');
  const [range, setRange] = useState('7d');
  const [excludeAgents, setExcludeAgents] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [query, setQuery] = useState('');
  const [feedbackFilter, setFeedbackFilter] = useState<string>('全部');
  const [notice, setNotice] = useState('');
  const [snapshot, setSnapshot] = useState<AdminSnapshot>(() => getMockSnapshot());
  const [dataError, setDataError] = useState('');
  const [adminKey, setAdminKey] = useState<string>('');
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [tempKeyInput, setTempKeyInput] = useState<string>('');

  // Phase 0 Modals
  const [inspectMetric, setInspectMetric] = useState<AdminMetricDefinition | null>(null);
  const [revealModal, setRevealModal] = useState<{ userId: string; action: 'reveal_email' | 'reveal_ip' | 'reveal_raw_words'; label: string } | null>(null);
  const [revealReason, setRevealReason] = useState('');
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [isRevealing, setIsRevealing] = useState(false);

  const refreshSnapshot = async (keyToUse?: string, rangeToUse?: string, excludeAgentsToUse?: boolean) => {
    try {
      const activeKey = keyToUse ?? adminKey;
      const activeRange = rangeToUse ?? range;
      const activeExclude = excludeAgentsToUse ?? excludeAgents;

      const headers: Record<string, string> = {};
      if (activeKey) {
        headers['x-admin-key'] = activeKey;
      }
      const response = await fetch(`/api/snapshot?range=${activeRange}&excludeAgents=${activeExclude}`, {
        cache: 'no-store',
        headers,
      });

      if (response.status === 401) {
        setShowAuthModal(true);
        setDataError('需要管理员密钥 (ADMIN_SECRET) 访问');
        return;
      }

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'snapshot unavailable');
      }

      const next = (await response.json()) as AdminSnapshot;
      setSnapshot(next);
      setDataError('');
      setShowAuthModal(false);
    } catch (err: any) {
      setDataError(err?.message ? `实时连接提示: ${err.message}` : '实时数据暂不可用，当前显示离线快照');
    }
  };

  useEffect(() => {
    refreshSnapshot(adminKey, range, excludeAgents);
    const timer = window.setInterval(() => refreshSnapshot(adminKey, range, excludeAgents), 30_000);
    return () => window.clearInterval(timer);
  }, [adminKey, range, excludeAgents]);

  const handleRangeChange = (newRange: string) => {
    setRange(newRange);
    refreshSnapshot(adminKey, newRange, excludeAgents);
  };

  const handleToggleExcludeAgents = () => {
    const next = !excludeAgents;
    setExcludeAgents(next);
    refreshSnapshot(adminKey, range, next);
    setNotice(next ? '已开启测试数据隔离（默认排除 Agent）' : '已切换为全量数据视图（包含 Agent）');
    setTimeout(() => setNotice(''), 3000);
  };

  const handleRevealSubmit = async () => {
    if (!revealModal || !revealReason.trim()) return;
    setIsRevealing(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (adminKey) headers['x-admin-key'] = adminKey;
      const res = await fetch('/api/admin/audit/reveal', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          targetUserId: revealModal.userId,
          action: revealModal.action,
          reason: revealReason.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.warnings?.[0] || '授权失败');
      }

      const revealed = json.data?.revealedValue;
      setRevealedValues((prev) => ({
        ...prev,
        [`${revealModal.userId}_${revealModal.action}`]: revealed,
      }));
      setRevealModal(null);
      setRevealReason('');
      setNotice(`✅ 敏感访问已核准并记入安全审计日志 (Audit ID: ${json.data?.auditLogId?.slice(0, 8)})`);
      setTimeout(() => setNotice(''), 4000);
    } catch (err: any) {
      alert(`访问申请失败: ${err.message}`);
    } finally {
      setIsRevealing(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    const sourceUsers = snapshot.users || [];
    if (!term) return sourceUsers;
    return sourceUsers.filter(
      (user) =>
        user.maskedEmail.toLowerCase().includes(term) ||
        user.id.toLowerCase().includes(term) ||
        user.stage.toLowerCase().includes(term)
    );
  }, [snapshot.users, query]);

  const findMetric = (key: string) => {
    return snapshot.metricDefinitions?.find((m) => m.key === key) || {
      key,
      label: key,
      description: '暂无口径定义',
      numerator: 'COUNT(*)',
      denominator: null,
      sourceTables: ['users'],
      timeWindow: range as any,
      excludesSyntheticUsers: excludeAgents,
      status: 'ready' as const,
    };
  };

  return (
    <main className="admin-shell">
      {/* 侧边栏 */}
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">α</div>
          <div>
            <strong>eva</strong>
            <span>SIGNAL ROOM</span>
          </div>
        </div>

        <div className={`mode-chip ${snapshot.mode === 'api' ? 'mode-chip-live' : ''}`}>
          <span className="mode-dot" />
          {snapshot.mode === 'api' ? 'LIVE EVA DATA' : 'LOCAL MOCK DATA'}
        </div>

        <nav className="side-nav">
          <div className="nav-eyebrow">WORKSPACE</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = page === item.id && !selectedUser;
            return (
              <button
                key={item.id}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => {
                  setPage(item.id);
                  setSelectedUser(null);
                }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
                {item.id === 'feedback' && <b>{snapshot.feedback?.length || 0}</b>}
              </button>
            );
          })}

          <div className="nav-eyebrow nav-eyebrow-spaced">SYSTEM & ACCESS</div>
          <button
            className="nav-item"
            onClick={() => {
              setTempKeyInput(adminKey);
              setShowAuthModal(true);
            }}
          >
            <Key size={16} />
            <span>鉴权与凭证</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="avatar">ET</div>
          <div>
            <strong>内部工作区</strong>
            <span>Product + Engineering</span>
          </div>
          <ChevronRight size={14} />
        </div>
      </aside>

      {/* 主工作区 */}
      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>EVA / INTERNAL</span>
            <ChevronRight size={12} />
            <strong>{selectedUser ? '用户 360° 全景档案' : navItems.find((i) => i.id === page)?.label}</strong>
          </div>

          <div className="topbar-actions">
            {/* Agent 过滤隔离胶囊 */}
            <button
              onClick={handleToggleExcludeAgents}
              className={`outline-button ${excludeAgents ? 'exclude-active' : ''}`}
              title="切换是否包含测试 Agent 数据"
              style={{ fontSize: 11, padding: '4px 10px' }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: excludeAgents ? '#8ec31f' : '#dc8847',
                  marginRight: 6,
                }}
              />
              {excludeAgents ? '已排除 Agent 测试数据' : '包含全量测试数据'}
            </button>

            <span className="last-sync">
              <span className="online-dot" />
              {snapshot.mode === 'api' ? '直连 Postgres · 30s 刷新' : '离线快照 · 30s 自动刷新'}
            </span>

            <button
              className="icon-button"
              title="刷新数据"
              onClick={() => refreshSnapshot()}
            >
              <Activity size={14} />
            </button>

            <div className="top-avatar">E</div>
          </div>
        </header>

        <div className="content">
          {dataError && (
            <div className="data-warning">
              <AlertTriangle size={15} />
              <span>{dataError}</span>
            </div>
          )}

          {selectedUser ? (
            <UserDetailView
              user={selectedUser}
              adminKey={adminKey}
              onBack={() => setSelectedUser(null)}
              revealedValues={revealedValues}
              onRequestReveal={(userId, action, label) => setRevealModal({ userId, action, label })}
            />
          ) : (
            <>
              {page === 'overview' && (
                <OverviewPage
                  overview={snapshot.overview}
                  range={range}
                  onRangeChange={handleRangeChange}
                  onInspectMetric={(key) => setInspectMetric(findMetric(key))}
                />
              )}
              {page === 'users' && (
                <UsersPage
                  users={filteredUsers}
                  totalCount={snapshot.totalUsersCount ?? (snapshot.overview?.metrics?.registrations || filteredUsers.length)}
                  query={query}
                  onQueryChange={setQuery}
                  onSelectUser={setSelectedUser}
                  excludeAgents={excludeAgents}
                  adminKey={adminKey}
                  range={range}
                  initialCursor={snapshot.usersNextCursor}
                  initialHasMore={snapshot.usersHasMore}
                />
              )}
              {page === 'feedback' && (
                <FeedbackPage
                  feedback={snapshot.feedback}
                  filter={feedbackFilter}
                  onFilterChange={setFeedbackFilter}
                  adminKey={adminKey}
                  onFeedbackUpdated={() => refreshSnapshot(adminKey, range, excludeAgents)}
                />
              )}
              {page === 'quality' && (
                <QualityPage
                  quality={snapshot.quality}
                  mode={snapshot.mode}
                  onInspectMetric={(key) => setInspectMetric(findMetric(key))}
                />
              )}
            </>
          )}
        </div>
      </section>

      {/* 指标口径定义 Modal */}
      {inspectMetric && (
        <div className="auth-modal-overlay" onClick={() => setInspectMetric(null)}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <div className="auth-modal-header" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CircleHelp size={18} color="#6d8e17" />
                <h3>指标口径与计算契约</h3>
              </div>
              <button
                onClick={() => setInspectMetric(null)}
                style={{ background: 'none', border: 0, cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ margin: '14px 0', fontSize: 12 }}>
              <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: 14 }}>{inspectMetric.label}</p>
              <p style={{ color: '#687265', lineHeight: 1.6 }}>{inspectMetric.description}</p>
              <div style={{ background: '#f5f6f1', padding: 12, borderRadius: 6, margin: '12px 0' }}>
                <div style={{ marginBottom: 6 }}>
                  <strong style={{ color: '#4a5749' }}>分子 (Numerator)：</strong>
                  <code style={{ fontSize: 11, color: '#6d8e17', marginLeft: 4 }}>{inspectMetric.numerator}</code>
                </div>
                {inspectMetric.denominator && (
                  <div>
                    <strong style={{ color: '#4a5749' }}>分母 (Denominator)：</strong>
                    <code style={{ fontSize: 11, color: '#c76e28', marginLeft: 4 }}>{inspectMetric.denominator}</code>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 15, color: '#7a8578', fontSize: 11 }}>
                <span>源表：{inspectMetric.sourceTables.join(', ')}</span>
                <span>状态：{inspectMetric.status}</span>
              </div>
            </div>
            <div className="auth-modal-actions">
              <button className="primary-button" onClick={() => setInspectMetric(null)}>
                了解
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 敏感信息审计申请 Modal */}
      {revealModal && (
        <div className="auth-modal-overlay" onClick={() => setRevealModal(null)}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <div className="auth-modal-header">
              <ShieldCheck size={20} color="#c76e28" />
              <h3>敏感数据访问审计申请</h3>
            </div>
            <p className="auth-modal-desc">
              根据《EVA 最小权限与隐私合规规范》，查看未脱敏的 <strong>{revealModal.label}</strong> 需要提供合法的业务排查原因。该操作将被写入不可篡改的安全审计日志。
            </p>
            <label style={{ display: 'block', fontSize: 11, color: '#616e5f', marginBottom: 6 }}>
              访问原因 (不少于 4 个字符)：
            </label>
            <input
              type="text"
              className="auth-input"
              placeholder="例如：排查用户工单 #104 测评异常"
              value={revealReason}
              onChange={(e) => setRevealReason(e.target.value)}
              autoFocus
            />
            <div className="auth-modal-actions">
              <button className="outline-button" onClick={() => setRevealModal(null)}>
                取消
              </button>
              <button
                className="primary-button"
                style={{ background: '#7e9a18' }}
                disabled={isRevealing || revealReason.trim().length < 4}
                onClick={handleRevealSubmit}
              >
                {isRevealing ? '核准中...' : '提交原因并解密'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 鉴权密钥配置弹窗 */}
      {showAuthModal && (
        <div className="auth-modal-overlay">
          <div className="auth-modal">
            <div className="auth-modal-header">
              <LockKeyhole size={20} />
              <h3>配置管理凭证 (ADMIN_SECRET)</h3>
            </div>
            <p className="auth-modal-desc">
              EVA Signal Room 受服务端密钥保护。请输入环境变量中配置的 <code>ADMIN_SECRET</code> 或 <code>ADMIN_API_KEY</code> 进行连接。
            </p>
            <input
              type="password"
              className="auth-input"
              placeholder="输入 ADMIN_SECRET"
              value={tempKeyInput}
              onChange={(e) => setTempKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setAdminKey(tempKeyInput.trim());
                  refreshSnapshot(tempKeyInput.trim());
                }
              }}
            />
            <div className="auth-modal-actions">
              <button className="outline-button" onClick={() => setShowAuthModal(false)}>
                离线模式查看
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setAdminKey(tempKeyInput.trim());
                  refreshSnapshot(tempKeyInput.trim());
                }}
              >
                验证并保存
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div>{action}</div>}
    </header>
  );
}

function OverviewPage({
  overview,
  range,
  onRangeChange,
  onInspectMetric,
}: {
  overview?: AdminSnapshot['overview'];
  range: string;
  onRangeChange: (r: string) => void;
  onInspectMetric: (k: string) => void;
}) {
  const o = overview ?? {
    metrics: { registrations: 0, activeUsers: 0, completionRate: 0, pendingFeedback: 0 },
    activity: [],
    funnel: [],
    updatedAt: '',
    excludesSyntheticUsers: true,
  };

  return (
    <>
      <PageHeader
        eyebrow="01 / PRODUCT PULSE"
        title="早上好，团队。"
        description="看见用户正在经历什么，也是在校准我们对自我理解系统的判断。"
        action={
          <div className="range-switcher">
            {['24h', '7d', '30d', 'all'].map((r) => (
              <button
                key={r}
                className={range === r ? 'selected' : ''}
                onClick={() => onRangeChange(r)}
              >
                {r === '24h' ? '24 小时' : r === '7d' ? '7 天' : r === '30d' ? '30 天' : '全部'}
              </button>
            ))}
          </div>
        }
      />

      <div className="metric-grid">
        <MetricCard
          label="注册用户"
          value={o.metrics.registrations.toLocaleString()}
          note="时间范围内新增"
          accent
          onInspect={() => onInspectMetric('registrations')}
        />
        <MetricCard
          label="活跃用户"
          value={o.metrics.activeUsers !== null ? String(o.metrics.activeUsers) : '尚未采集'}
          note={o.metrics.activeUsers !== null ? '所选时间范围内活跃' : '依赖产品行为埋点'}
          onInspect={() => onInspectMetric('active_users')}
        />
        <MetricCard
          label="测评完成率"
          value={`${o.metrics.completionRate}%`}
          note="已完成主题测评 / 注册"
          onInspect={() => onInspectMetric('completion_rate')}
        />
        <MetricCard
          label="待处理反馈"
          value={String(o.metrics.pendingFeedback)}
          note="当前未关闭工单"
          onInspect={() => onInspectMetric('pending_feedback')}
        />
      </div>

      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">ENGAGEMENT / {range.toUpperCase()}</span>
              <h2>活跃趋势</h2>
            </div>
            <span className="panel-value">
              {o.activity.length > 0
                ? Math.round(o.activity.reduce((acc, cur) => acc + cur.users, 0) / o.activity.length)
                : 0}{' '}
              <small>人 / 日</small>
            </span>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={235}>
              <AreaChart data={o.activity.length > 0 ? o.activity : [{ day: '今日', users: 0 }]}>
                <defs>
                  <linearGradient id="areaColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d9f36a" stopOpacity={0.65} />
                    <stop offset="95%" stopColor="#d9f36a" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e8ebe3" vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#858b80', fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#858b80', fontSize: 11 }} />
                <Tooltip contentStyle={{ border: '1px solid #dfe4d8', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="users" stroke="#9bb62c" strokeWidth={2} fill="url(#areaColor)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel funnel-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">CORE LOOP / CONVERSION</span>
              <h2>核心流程转化</h2>
            </div>
          </div>
          <div className="funnel-list">
            {o.funnel.map((step) => (
              <div className="funnel-row" key={step.label}>
                <div className="funnel-meta">
                  <span>{step.label}</span>
                  <strong>{step.status === 'unavailable' ? '尚未采集' : `${step.value}%`}</strong>
                </div>
                <div className="funnel-track">
                  <div style={{ width: step.status === 'unavailable' ? '0%' : `${step.value}%` }} />
                </div>
                <small>
                  {step.status === 'unavailable' ? '依赖 product_events 埋点表' : `${step.count.toLocaleString()} 人`}
                </small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function UsersPage({
  users,
  totalCount,
  query,
  onQueryChange,
  onSelectUser,
  excludeAgents,
  adminKey,
  range,
  initialCursor,
  initialHasMore,
}: {
  users: AdminUserSummary[];
  totalCount: number;
  query: string;
  onQueryChange: (q: string) => void;
  onSelectUser: (u: AdminUserSummary) => void;
  excludeAgents: boolean;
  adminKey: string;
  range: string;
  initialCursor?: string | null;
  initialHasMore?: boolean;
}) {
  const [extraUsers, setExtraUsers] = useState<AdminUserSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor ?? null);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore ?? false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [serverUsers, setServerUsers] = useState<AdminUserSummary[] | null>(null);

  useEffect(() => {
    setCursor(initialCursor ?? null);
    setHasMore(initialHasMore ?? false);
    setExtraUsers([]);
    setServerUsers(null);
  }, [initialCursor, initialHasMore, excludeAgents, range]);

  const handleServerSearch = async (searchTerm: string) => {
    if (!searchTerm.trim()) {
      setServerUsers(null);
      return;
    }
    try {
      const headers: Record<string, string> = {};
      if (adminKey) headers['x-admin-key'] = adminKey;
      const res = await fetch(
        `/api/admin/users?query=${encodeURIComponent(searchTerm.trim())}&limit=50&range=${range}&excludeAgents=${excludeAgents}`,
        { headers }
      );
      if (res.ok) {
        const json = await res.json();
        if (json.data?.items) {
          setServerUsers(json.data.items);
        }
      }
    } catch (err) {
      console.warn('Server search failed:', err);
    }
  };

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const headers: Record<string, string> = {};
      if (adminKey) headers['x-admin-key'] = adminKey;
      const res = await fetch(
        `/api/admin/users?cursor=${encodeURIComponent(cursor)}&limit=50&range=${range}&excludeAgents=${excludeAgents}`,
        { headers }
      );
      if (res.ok) {
        const json = await res.json();
        if (json.data?.items) {
          setExtraUsers((prev) => [...prev, ...json.data.items]);
          setCursor(json.data.nextCursor ?? null);
          setHasMore(Boolean(json.data.hasMore));
        }
      }
    } catch (err) {
      console.warn('Load more users failed:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const displayUsers = serverUsers ?? [...users, ...extraUsers];

  return (
    <>
      <PageHeader
        eyebrow="02 / USER OPERATIONS"
        title="用户与行为全景"
        description="追溯每一个个体的测评旅程、决策反响与画像校准记录。"
        action={
          <span style={{ fontSize: 12, color: '#768074' }}>
            共 <strong>{totalCount}</strong> 位用户 {excludeAgents && '(已排除 Agent)'}
          </span>
        }
      />

      <div className="toolbar">
        <div className="search-box">
          <Search size={15} />
          <input
            type="search"
            placeholder="输入 User ID 或原始邮箱检索 (按回车全库查找)..."
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              if (!e.target.value) setServerUsers(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleServerSearch(query);
              }
            }}
          />
        </div>
        <div className="filter-summary">
          当前展示 <span>{displayUsers.length}</span> 位用户 {serverUsers ? '(服务端检索结果)' : ''}
        </div>
      </div>

      <div className="panel table-panel">
        <table>
          <thead>
            <tr>
              <th>用户标识</th>
              <th>注册时间</th>
              <th>登录</th>
              <th>测评轮数</th>
              <th>置信度</th>
              <th>状态</th>
              <th>当前阶段</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {displayUsers.map((u) => (
              <tr key={u.id} onClick={() => onSelectUser(u)}>
                <td>
                  <div className="user-cell">
                    <div className="user-avatar">{u.isSynthetic ? '🤖' : u.maskedEmail.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <strong>{u.maskedEmail}</strong>
                      <span className="mono">{u.id.slice(0, 13)}...</span>
                    </div>
                  </div>
                </td>
                <td className="mono">{u.registeredAt}</td>
                <td className="mono">{u.loginCount}</td>
                <td className="mono">{u.assessmentRoundCount}</td>
                <td>
                  <Confidence value={u.portraitConfidence} />
                </td>
                <td>
                  <StatusPill status={u.status as Status} />
                </td>
                <td>
                  <span className="stage-label">{u.stage}</span>
                </td>
                <td className="row-arrow">
                  <ChevronRight size={15} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {displayUsers.length === 0 && (
          <div className="empty-state">
            <Users size={32} />
            <strong>未找到匹配的用户</strong>
            <span>请尝试更换搜索关键词。</span>
          </div>
        )}
        {hasMore && !serverUsers && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '14px', borderTop: '1px solid #edf0e8' }}>
            <button
              className="outline-button"
              disabled={loadingMore}
              onClick={handleLoadMore}
              style={{ fontSize: 12, padding: '6px 20px', cursor: 'pointer' }}
            >
              {loadingMore ? '正在加载更多...' : '加载更多用户 (下一页)'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function UserDetailView({
  user,
  adminKey,
  onBack,
  revealedValues,
  onRequestReveal,
}: {
  user: AdminUserSummary;
  adminKey: string;
  onBack: () => void;
  revealedValues: Record<string, string>;
  onRequestReveal: (userId: string, action: 'reveal_email' | 'reveal_ip' | 'reveal_raw_words', label: string) => void;
}) {
  const [detail360, setDetail360] = useState<any>(null);
  const [loading360, setLoading360] = useState<boolean>(true);
  const [detailError, setDetailError] = useState('');
  const [detailAttempt, setDetailAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetch360 = async () => {
      setLoading360(true);
      setDetail360(null);
      setDetailError('');
      try {
        const headers: Record<string, string> = {};
        if (adminKey) headers['x-admin-key'] = adminKey;
        const res = await fetch(`/api/admin/users/${user.id}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.data?.user || json.data.user.id !== user.id ||
          !['timeline', 'devices', 'evidence'].every((key) => Array.isArray(json.data[key]))) {
          throw new Error('Invalid user detail response');
        }
        if (!cancelled) setDetail360(json.data);
      } catch (err) {
        console.error('Failed to fetch User 360 data:', err);
        if (!cancelled) setDetailError('用户详情加载失败，无法确认行为轨迹、设备及证据数据。请重试。');
      } finally {
        if (!cancelled) setLoading360(false);
      }
    };
    fetch360();
    return () => {
      cancelled = true;
    };
  }, [user.id, adminKey, detailAttempt]);

  const unmaskedEmail = revealedValues[`${user.id}_reveal_email`];
  const unmaskedIp = revealedValues[`${user.id}_reveal_ip`];
  const unmaskedRawWords = revealedValues[`${user.id}_reveal_raw_words`];

  return (
    <div className="user-detail">
      <button className="back-button" onClick={onBack}>
        ← 返回用户列表
      </button>

      <div className="detail-hero">
        <div className="detail-avatar">{user.isSynthetic ? '🤖' : user.maskedEmail.slice(0, 2).toUpperCase()}</div>
        <div>
          <div className="eyebrow">{user.isSynthetic ? 'SYNTHETIC AGENT USER' : 'INDIVIDUAL COGNITIVE PROFILE (USER 360)'}</div>
          <h1>{unmaskedEmail || detail360?.user?.maskedEmail || user.maskedEmail}</h1>
          <p className="mono">UUID: {user.id}</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          {!unmaskedEmail && (
            <button
              className="outline-button"
              onClick={() => onRequestReveal(user.id, 'reveal_email', '完整用户邮箱')}
            >
              <Eye size={14} />
              解密完整 Email (记审计)
            </button>
          )}
        </div>
      </div>

      {detailError && (
        <div className="empty-state" role="alert">
          <p>{detailError}</p>
          <button className="outline-button" onClick={() => setDetailAttempt((attempt) => attempt + 1)}>
            重试加载详情
          </button>
        </div>
      )}

      <div className="metric-grid detail-metrics">
        <MetricCard label="测评轮次" value={String(user.assessmentRoundCount)} note="主题轮完成数" />
        <MetricCard label="登录次数" value={String(user.loginCount)} note="会话记录" />
        <MetricCard label="纠错与反驳" value={String(user.correctionCount)} note="用户主动驳回" />
        <MetricCard
          label="画像置信度"
          value={user.portraitConfidence ? `${user.portraitConfidence}%` : '未完成'}
          note="基于多轮证据收敛"
          accent
        />
      </div>

      <div className="detail-columns">
        <section className="panel">
          <div className="panel-heading">
            <h2>基本属性与环境审计</h2>
          </div>
          <div className="data-list">
            <div>
              <dt>注册时间</dt>
              <dd className="mono">{user.registeredAt}</dd>
            </div>
            <div>
              <dt>最近活跃</dt>
              <dd className="mono">{user.lastActiveAt || '—'}</dd>
            </div>
            <div>
              <dt>客户端 IP</dt>
              <dd className="mono">
                {unmaskedIp || (detail360?.devices?.[0]?.ip_address ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {detail360.devices[0].ip_address} (已脱敏)
                    <button
                      onClick={() => onRequestReveal(user.id, 'reveal_ip', '客户端原始 IP')}
                      style={{ background: 'none', border: 0, cursor: 'pointer', color: '#6d8e17', padding: 0 }}
                      title="申请解密 IP"
                      aria-label="申请解密 IP"
                    >
                      <Eye size={12} />
                    </button>
                  </span>
                ) : loading360 ? '加载中...' : detailError ? '无法读取' : '暂无记录')}
              </dd>
            </div>
            <div>
              <dt>用户类型</dt>
              <dd>{user.isSynthetic ? '自动化测试 Agent' : '真实用户'}</dd>
            </div>
          </div>

          {detail360?.devices && detail360.devices.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: '#687265', marginBottom: 8 }}>登录设备历史</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {detail360.devices.map((d: any, idx: number) => (
                  <div key={idx} style={{ fontSize: 11, background: '#f5f6f1', padding: '6px 10px', borderRadius: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{d.browser || 'Browser'} / {d.operating_system || 'OS'} ({d.device_type || 'web'})</span>
                    <span className="mono" style={{ color: '#8c9588' }}>{d.ip_address}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>360° 行为轨迹时间轴</h2>
          </div>
          {loading360 ? (
            <div className="empty-state" style={{ padding: 20 }}><span>加载时间线中...</span></div>
          ) : detailError ? (
            <div className="empty-state" style={{ padding: 20 }}><span>行为轨迹未加载。</span></div>
          ) : detail360?.timeline && detail360.timeline.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10, maxHeight: 350, overflowY: 'auto' }}>
              {detail360.timeline.map((item: any, idx: number) => (
                <div key={idx} style={{ borderLeft: '2px solid #6d8e17', paddingLeft: 10, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <strong style={{ color: '#2d332d' }}>{item.title}</strong>
                    <span className="mono" style={{ fontSize: 10, color: '#8c9588' }}>{item.created_at ? item.created_at.slice(0, 19).replace('T', ' ') : ''}</span>
                  </div>
                  {item.meta && <p style={{ margin: 0, fontSize: 11, color: '#687265' }}>{item.meta}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 30 }}>
              <span>该用户暂无行为轨迹记录。</span>
            </div>
          )}
        </section>
      </div>

      {detail360?.evidence && detail360.evidence.length > 0 && (
        <section className="panel" style={{ marginTop: 20 }}>
          <div className="panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>底层证据池 (Evidence Pool)</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#687265' }}>收敛证据共 {detail360.evidence.length} 条</span>
              {!unmaskedRawWords && (
                <button
                  className="outline-button"
                  style={{ fontSize: 11, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  onClick={() => onRequestReveal(user.id, 'reveal_raw_words', '用户评测与纠偏原话')}
                >
                  <Eye size={12} />
                  解密原话 (记审计)
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginTop: 12 }}>
            {detail360.evidence.map((ev: any, idx: number) => (
              <div key={idx} style={{ background: '#fafbfa', border: '1px solid #e3e6df', borderRadius: 6, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: '#6d8e17' }}>{ev.target_dimension || '通用维度'}</span>
                  <span className="mono" style={{ color: '#8c9588' }}>权重: {ev.weight || 1.0}</span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: '#3b433b', fontStyle: 'italic' }}>
                  &ldquo;{ev.quote_text || (unmaskedRawWords ? unmaskedRawWords : '已脱敏（需安全审计申请）')}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FeedbackPage({
  feedback,
  filter,
  onFilterChange,
  adminKey,
  onFeedbackUpdated,
}: {
  feedback?: FeedbackItem[];
  filter: string;
  onFilterChange: (f: string) => void;
  adminKey: string;
  onFeedbackUpdated: () => void;
}) {
  const items = feedback || [];
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const filterTabs = ['全部', '新反馈', '处理中', '已确认', '计划改进', '已解决', '已关闭'];

  const filteredItems = useMemo(() => {
    if (filter === '全部' || filter === 'all') return items;
    return items.filter((item) => item.status === filter);
  }, [items, filter]);

  const handleStatusChange = async (feedbackId: string, nextStatus: string) => {
    setUpdatingId(feedbackId);
    setUpdatingStatus(nextStatus);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (adminKey) headers['x-admin-key'] = adminKey;
      const res = await fetch(`/api/admin/feedback/${feedbackId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        onFeedbackUpdated();
      } else {
        const json = await res.json().catch(() => ({}));
        alert(`状态流转失败: ${json.error || '权限不足'}`);
      }
    } catch (err: any) {
      alert(`流转请求失败: ${err.message}`);
    } finally {
      setUpdatingId(null);
      setUpdatingStatus(null);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case '高':
      case 'high':
        return <span style={{ background: '#fde8e8', color: '#c81e1e', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>高</span>;
      case '中':
      case 'medium':
        return <span style={{ background: '#fef08a', color: '#854d0e', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>中</span>;
      default:
        return <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>低</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case '新反馈':
        return <span style={{ background: '#ffedd5', color: '#c2410c', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>新反馈</span>;
      case '处理中':
        return <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>处理中</span>;
      case '已确认':
        return <span style={{ background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>已确认</span>;
      case '计划改进':
        return <span style={{ background: '#fae8ff', color: '#86198f', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>计划改进</span>;
      case '已解决':
        return <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>已解决</span>;
      case '已关闭':
        return <span style={{ background: '#f3f4f6', color: '#4b5563', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>已关闭</span>;
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="03 / FEEDBACK OPS"
        title="用户真实原话与反馈工单"
        description="用户反驳、纠偏与工单建议是校准 EVA 模型的最珍贵资产。支持多态工单流转与审计。"
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {filterTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => onFilterChange(tab)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              border: filter === tab ? '1px solid #6d8e17' : '1px solid #e3e6df',
              background: filter === tab ? '#eef3df' : '#fff',
              color: filter === tab ? '#3d5209' : '#576054',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <MessageSquareText size={32} />
            <strong>当前暂无符合条件的工单反馈</strong>
            <span>用户在客户端提交的新反馈将实时流转至此处。</span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="panel"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: 18,
                transition: 'box-shadow 0.2s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{item.category || item.title}</span>
                  {getSeverityBadge(item.severity)}
                  {getStatusBadge(item.status)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#8c9588' }}>
                  <span>来源: <code style={{ fontSize: 11 }}>{item.page || 'web'}</code></span>
                  <span className="mono">{item.age}</span>
                </div>
              </div>

              <div style={{ background: '#fafbfa', border: '1px solid #eef0eb', padding: '12px 14px', borderRadius: 6 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#2d332d', lineHeight: 1.6 }}>{item.original}</p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, fontSize: 12 }}>
                <span style={{ color: '#8c9588' }}>工单 ID: <span className="mono">{item.id.slice(0, 8)}</span></span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {item.status !== '处理中' && (
                    <button
                      className="outline-button"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                      disabled={updatingId === item.id}
                      aria-busy={updatingId === item.id && updatingStatus === '处理中'}
                      onClick={() => handleStatusChange(item.id, '处理中')}
                    >
                      {updatingId === item.id && updatingStatus === '处理中' ? '更新中…' : '处理中'}
                    </button>
                  )}
                  {item.status !== '计划改进' && (
                    <button
                      className="outline-button"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                      disabled={updatingId === item.id}
                      aria-busy={updatingId === item.id && updatingStatus === '计划改进'}
                      onClick={() => handleStatusChange(item.id, '计划改进')}
                    >
                      {updatingId === item.id && updatingStatus === '计划改进' ? '更新中…' : '计划改进'}
                    </button>
                  )}
                  {item.status !== '已解决' && (
                    <button
                      className="outline-button"
                      style={{ padding: '4px 8px', fontSize: 11, borderColor: '#15803d', color: '#15803d' }}
                      disabled={updatingId === item.id}
                      aria-busy={updatingId === item.id && updatingStatus === '已解决'}
                      onClick={() => handleStatusChange(item.id, '已解决')}
                    >
                      {updatingId === item.id && updatingStatus === '已解决' ? '更新中…' : '已解决'}
                    </button>
                  )}
                  {item.status !== '已关闭' && (
                    <button
                      className="outline-button"
                      style={{ padding: '4px 8px', fontSize: 11, borderColor: '#9ca3af', color: '#4b5563' }}
                      disabled={updatingId === item.id}
                      aria-busy={updatingId === item.id && updatingStatus === '已关闭'}
                      onClick={() => handleStatusChange(item.id, '已关闭')}
                    >
                      {updatingId === item.id && updatingStatus === '已关闭' ? '更新中…' : '关闭'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function QualityPage({
  quality,
  mode,
  onInspectMetric,
}: {
  quality?: AdminQualitySummary;
  mode: AdminSnapshot['mode'];
  onInspectMetric: (k: string) => void;
}) {
  const q = quality ?? {
    confirmationRate: 0,
    rebuttalRate: 0,
    sufficientEvidenceCount: 0,
    correctionEffectivenessRate: null,
    disputedDimensions: [],
    versionComparisons: [],
  };

  return (
    <>
      <PageHeader
        eyebrow="04 / QUALITY LAB"
        title="测评与画像质量"
        description="不只看完成率。看用户是否认可、纠正，以及纠正后系统是否真的改变。"
      />
      <div className="metric-grid">
        <MetricCard
          label="画像确认率"
          value={`${q.confirmationRate}%`}
          note="基于用户 Confirm 反馈"
          accent
          onInspect={() => onInspectMetric('confirmation_rate')}
        />
        <MetricCard
          label="用户反驳率"
          value={`${q.rebuttalRate}%`}
          note="需要持续下降"
          onInspect={() => onInspectMetric('rebuttal_rate')}
        />
        <MetricCard
          label="有效测评样本"
          value={String(q.sufficientEvidenceCount)}
          note="已完成轮次"
        />
        <MetricCard
          label="纠错生效率"
          value={q.correctionEffectivenessRate !== null ? `${q.correctionEffectivenessRate}%` : '尚未采集'}
          note={q.correctionEffectivenessRate !== null ? '纠错后产生修订' : '依赖 correction_records'}
          onInspect={() => onInspectMetric('correction_effectiveness')}
        />
      </div>

      <div className="dashboard-grid">
        <section className="panel disputed-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">DISPUTED DIMENSIONS</span>
              <h2>最常被反驳的维度榜</h2>
            </div>
          </div>
          <div className="disputed-list">
            {q.disputedDimensions.map((item, idx) => (
              <div key={item.dimension}>
                <span className="rank">{String(idx + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{item.dimensionLabel}</strong>
                  <small>{item.disputeCount} 次反驳</small>
                </div>
                <b>{item.rate}%</b>
              </div>
            ))}
            {q.disputedDimensions.length === 0 && (
              <div className="empty-state" style={{ padding: 25 }}>
                <span>暂无反驳维度统计</span>
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">VERSION GOVERNANCE</span>
              <h2>题库与规则版本</h2>
            </div>
          </div>
          <div className="data-list" style={{ marginTop: 15 }}>
            <div>
              <dt>当前测评题库</dt>
              <dd>v1.4 (Theme-Adaptive)</dd>
            </div>
            <div>
              <dt>画像置信度规则</dt>
              <dd>4-Factor Core Model</dd>
            </div>
            <div>
              <dt>数据模式</dt>
              <dd>{mode === 'api' ? 'Postgres 真实聚合' : '离线 Mock 快照'}</dd>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
