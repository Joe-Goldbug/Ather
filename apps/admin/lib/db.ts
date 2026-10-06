import pg from 'pg';
const { Pool } = pg;
import type {
  AdminSnapshot,
  AdminUserSummary,
  FeedbackItem,
  AdminQualitySummary,
  QualityDimensionDispute,
  QuestionBankVersionComparison,
  AdminUsersPage,
  OverviewData,
  AdminMetricDefinition,
  RevealSensitiveResponse,
} from './types';

let pool: pg.Pool | null = null;

type DbRow = Record<string, unknown>;

export function getPool(): pg.Pool {
  const url = process.env.ADMIN_DATABASE_URL;
  if (!url) {
    throw new Error(
      'ADMIN_DATABASE_URL environment variable is required when ADMIN_DATA_MODE=api. (Do not fallback to general DATABASE_URL for security isolation)'
    );
  }

  if (!pool) {
    const isLocal = url.includes('127.0.0.1') || url.includes('localhost');
    pool = new Pool({
      connectionString: url,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 10,
    });
  }

  return pool;
}

const rows = (value: unknown): DbRow[] =>
  Array.isArray(value)
    ? value.filter((row): row is DbRow => typeof row === 'object' && row !== null && !Array.isArray(row))
    : [];
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const number = (value: unknown) => Number(value ?? 0);
export const maskEmail = (email: string) => {
  if (!email || !email.includes('@')) return '***@redacted';
  const [name, domain] = email.split('@');
  return `${(name ?? '').slice(0, 2)}***@${domain ?? 'redacted'}`;
};

type UserCursor = { createdAt: string; id: string };

export function encodeUserCursor(cursor: UserCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeUserCursor(cursor: string): UserCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as UserCursor;
    const timestamp = new Date(parsed.createdAt);
    if (!parsed.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id) || Number.isNaN(timestamp.getTime())) {
      throw new Error('invalid');
    }
    return { createdAt: timestamp.toISOString(), id: parsed.id };
  } catch {
    throw new Error('Invalid user cursor');
  }
}

async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    console.warn('[admin/db] Non-fatal query fallback:', err?.message || err);
    return fallback;
  }
}

function getRangeInterval(range: string = '7d'): string | null {
  switch (range) {
    case '24h':
      return '24 hours';
    case '7d':
      return '7 days';
    case '30d':
      return '30 days';
    case 'all':
    default:
      return null;
  }
}

export const METRIC_DEFINITIONS: AdminMetricDefinition[] = [
  {
    key: 'registrations',
    label: '注册用户',
    description: '在指定时间范围内创建的唯一用户总数（支持排除测试 Agent 账号）',
    numerator: 'COUNT(*) FROM users',
    denominator: null,
    sourceTables: ['users'],
    timeWindow: '7d',
    excludesSyntheticUsers: true,
    status: 'ready',
  },
  {
    key: 'active_users',
    label: '活跃用户',
    description: '在时间范围内至少产生一次会话或产品事件的唯一用户数',
    numerator: 'COUNT(DISTINCT user_id) FROM session_tokens / product_events',
    denominator: null,
    sourceTables: ['session_tokens', 'product_events'],
    timeWindow: '7d',
    excludesSyntheticUsers: true,
    status: 'ready',
  },
  {
    key: 'completion_rate',
    label: '测评完成率',
    description: '成功完成至少一轮主题测评的唯一用户数占注册总人数的比例',
    numerator: 'COUNT(DISTINCT user_id) WHERE status = completed',
    denominator: 'COUNT(*) FROM users',
    sourceTables: ['theme_assessment_rounds', 'users'],
    timeWindow: '7d',
    excludesSyntheticUsers: true,
    status: 'ready',
  },
  {
    key: 'confirmation_rate',
    label: '画像确认率',
    description: '用户主动提交 Confirm 确认的反馈数占全部有效反馈的比例',
    numerator: 'COUNT(*) WHERE action = confirm',
    denominator: 'COUNT(*) FROM theme_assessment_result_responses',
    sourceTables: ['theme_assessment_result_responses'],
    timeWindow: 'all',
    excludesSyntheticUsers: false,
    status: 'ready',
  },
  {
    key: 'rebuttal_rate',
    label: '画像反驳率',
    description: '用户主动提交 Refute 反驳的反馈数占全部有效反馈的比例',
    numerator: 'COUNT(*) WHERE action = refute',
    denominator: 'COUNT(*) FROM theme_assessment_result_responses',
    sourceTables: ['theme_assessment_result_responses'],
    timeWindow: 'all',
    excludesSyntheticUsers: false,
    status: 'ready',
  },
  {
    key: 'portrait_views',
    label: '画像查看率',
    description: '完成测评后进入画像页面的用户比例（依赖 product_events 埋点事件）',
    numerator: 'COUNT(DISTINCT user_id) WHERE event = portrait_viewed',
    denominator: 'COUNT(DISTINCT user_id) WHERE status = completed',
    sourceTables: ['product_events'],
    timeWindow: '7d',
    excludesSyntheticUsers: true,
    status: 'unavailable',
  },
  {
    key: 'correction_effectiveness',
    label: '纠错生效率',
    description: '纠错处理后画像产生有效修订的比例（依赖 correction_records 处理流水）',
    numerator: 'COUNT(*) WHERE status = changed',
    denominator: 'COUNT(*) FROM correction_records',
    sourceTables: ['correction_records'],
    timeWindow: '30d',
    excludesSyntheticUsers: false,
    status: 'unavailable',
  },
  {
    key: 'pending_feedback',
    label: '待处理反馈',
    description: '当前尚未处理或关闭的用户反馈工单总量（status 为 new 或 reviewing）',
    numerator: "COUNT(*) WHERE status IN ('new', 'reviewing')",
    denominator: null,
    sourceTables: ['product_feedback'],
    timeWindow: 'all',
    excludesSyntheticUsers: false,
    status: 'ready',
  },
];

export async function getOverviewData(
  range: string = '7d',
  excludeAgents: boolean = false
): Promise<OverviewData> {
  const db = getPool();
  const interval = getRangeInterval(range);

  // 1. Total Registrations count
  const regQuery = interval
    ? `SELECT COUNT(*)::int AS count FROM users WHERE ($1 = false OR is_synthetic = FALSE) AND created_at >= NOW() - $2::interval`
    : `SELECT COUNT(*)::int AS count FROM users WHERE ($1 = false OR is_synthetic = FALSE)`;
  const regParams = interval ? [excludeAgents, interval] : [excludeAgents];

  const regRes = await safeQuery(async () => {
    const res = await db.query(regQuery, regParams);
    return number(res.rows[0]?.count);
  }, 0);

  // 2. Assessment Started users count
  const startQuery = interval
    ? `SELECT COUNT(DISTINCT tar.user_id)::int AS count 
       FROM theme_assessment_rounds tar 
       JOIN users u ON u.id = tar.user_id 
       WHERE ($1 = false OR u.is_synthetic = FALSE) AND tar.created_at >= NOW() - $2::interval`
    : `SELECT COUNT(DISTINCT tar.user_id)::int AS count 
       FROM theme_assessment_rounds tar 
       JOIN users u ON u.id = tar.user_id 
       WHERE ($1 = false OR u.is_synthetic = FALSE)`;
  const startParams = interval ? [excludeAgents, interval] : [excludeAgents];

  const startedCount = await safeQuery(async () => {
    const res = await db.query(startQuery, startParams);
    return number(res.rows[0]?.count);
  }, 0);

  // 3. Assessment Completed users count
  const completeQuery = interval
    ? `SELECT COUNT(DISTINCT tar.user_id)::int AS count 
       FROM theme_assessment_rounds tar 
       JOIN users u ON u.id = tar.user_id 
       WHERE tar.status = 'completed' AND ($1 = false OR u.is_synthetic = FALSE) AND tar.created_at >= NOW() - $2::interval`
    : `SELECT COUNT(DISTINCT tar.user_id)::int AS count 
       FROM theme_assessment_rounds tar 
       JOIN users u ON u.id = tar.user_id 
       WHERE tar.status = 'completed' AND ($1 = false OR u.is_synthetic = FALSE)`;

  const completedCount = await safeQuery(async () => {
    const res = await db.query(completeQuery, startParams);
    return number(res.rows[0]?.count);
  }, 0);

  // 4. Portrait Viewed users count (from product_events)
  const portraitViewQuery = interval
    ? `SELECT COUNT(DISTINCT pe.user_id)::int AS count
       FROM product_events pe
       JOIN users u ON u.id = pe.user_id
       WHERE pe.event_name = 'result_viewed' AND ($1 = false OR u.is_synthetic = FALSE) AND pe.occurred_at >= NOW() - $2::interval`
    : `SELECT COUNT(DISTINCT pe.user_id)::int AS count
       FROM product_events pe
       JOIN users u ON u.id = pe.user_id
       WHERE pe.event_name = 'result_viewed' AND ($1 = false OR u.is_synthetic = FALSE)`;

  const portraitViewedCount = await safeQuery(async () => {
    const res = await db.query(portraitViewQuery, startParams);
    return number(res.rows[0]?.count);
  }, 0);

  // 5. Calibrated users count (from user_corrections)
  const calQuery = interval
    ? `SELECT COUNT(DISTINCT uc.user_id)::int AS count 
       FROM user_corrections uc 
       JOIN users u ON u.id = uc.user_id 
       WHERE ($1 = false OR u.is_synthetic = FALSE) AND uc.created_at >= NOW() - $2::interval`
    : `SELECT COUNT(DISTINCT uc.user_id)::int AS count 
       FROM user_corrections uc 
       JOIN users u ON u.id = uc.user_id 
       WHERE ($1 = false OR u.is_synthetic = FALSE)`;

  const calibratedCount = await safeQuery(async () => {
    const res = await db.query(calQuery, startParams);
    return number(res.rows[0]?.count);
  }, 0);

  // 6. Active users: a user is active when they either authenticate or produce
  // a product event in the selected period. Both sources are needed because a
  // long-lived session should not hide real in-product activity.
  const activeWindow = interval ? `AND occurred_at >= NOW() - $2::interval` : '';
  const activeRes = await safeQuery(async () => {
    const res = await db.query(
      `SELECT COUNT(DISTINCT activity.user_id)::int AS count
       FROM (
         SELECT st.user_id, st.created_at AS occurred_at FROM session_tokens st
         UNION
         SELECT pe.user_id, pe.occurred_at FROM product_events pe
       ) activity
       JOIN users u ON u.id = activity.user_id
       WHERE ($1 = false OR u.is_synthetic = FALSE) ${activeWindow}`,
      interval ? [excludeAgents, interval] : [excludeAgents]
    );
    return number(res.rows[0]?.count);
  }, 0);

  // 7. Daily active users under the same selected range and definition.
  const activityWindow = interval ? `AND activity.occurred_at >= NOW() - $2::interval` : '';
  const activityResult = await safeQuery(async () => {
    const res = await db.query(`
      SELECT to_char(date_trunc('day', activity.occurred_at), 'MM/DD') AS day, COUNT(DISTINCT activity.user_id)::int AS users
      FROM (
        SELECT st.user_id, st.created_at AS occurred_at FROM session_tokens st
        UNION
        SELECT pe.user_id, pe.occurred_at FROM product_events pe
      ) activity
      JOIN users u ON u.id = activity.user_id
      WHERE ($1 = false OR u.is_synthetic = FALSE) ${activityWindow}
      GROUP BY 1
      ORDER BY 1
    `, interval ? [excludeAgents, interval] : [excludeAgents]);
    return res.rows.map((r: any) => ({ day: text(r.day), users: number(r.users) }));
  }, []);

  const completionRate = regRes > 0 ? Math.round((completedCount / regRes) * 1000) / 10 : 0;

  // 8. Pending Feedback count
  const pendingFeedback = await safeQuery(async () => {
    const res = await db.query(`SELECT COUNT(*)::int AS count FROM product_feedback WHERE status IN ('new', 'reviewing')`);
    return number(res.rows[0]?.count);
  }, 0);

  // Funnel steps with real bounds (0% to 100%)
  const funnel = [
    { label: '01 注册', value: 100, count: regRes, status: 'ready' as const },
    {
      label: '02 开始测评',
      value: regRes > 0 ? Math.min(100, Math.round((startedCount / regRes) * 100)) : 0,
      count: startedCount,
      status: 'ready' as const,
    },
    {
      label: '03 完成测评',
      value: regRes > 0 ? Math.min(100, Math.round((completedCount / regRes) * 100)) : 0,
      count: completedCount,
      status: 'ready' as const,
    },
    {
      label: '04 查看画像',
      value: regRes > 0 ? Math.min(100, Math.round((portraitViewedCount / regRes) * 100)) : 0,
      count: portraitViewedCount,
      status: 'ready' as const,
    },
    {
      label: '05 首次校准',
      value: regRes > 0 ? Math.min(100, Math.round((calibratedCount / regRes) * 100)) : 0,
      count: calibratedCount,
      status: 'ready' as const,
    },
  ];

  return {
    metrics: {
      registrations: regRes,
      activeUsers: activeRes,
      completionRate,
      pendingFeedback,
    },
    activity: activityResult,
    funnel,
    updatedAt: new Date().toISOString(),
    excludesSyntheticUsers: excludeAgents,
  };
}

export async function getUsersPage(
  cursor?: string,
  limit: number = 50,
  range: string = 'all',
  excludeAgents: boolean = false,
  query?: string
): Promise<AdminUsersPage> {
  const db = getPool();
  const safeLimit = Math.min(100, Math.max(1, limit));
  const interval = getRangeInterval(range);

  const baseWhereClauses: string[] = [];
  const baseParams: unknown[] = [];

  if (excludeAgents) {
    baseWhereClauses.push(`u.is_synthetic = FALSE`);
  }

  if (interval) {
    baseWhereClauses.push(`u.created_at >= NOW() - $${baseParams.length + 1}::interval`);
    baseParams.push(interval);
  }

  if (query && query.trim()) {
    const q = `%${query.trim()}%`;
    baseWhereClauses.push(`(u.email ILIKE $${baseParams.length + 1} OR u.id::text ILIKE $${baseParams.length + 1})`);
    baseParams.push(q);
  }

  const decodedCursor = cursor ? decodeUserCursor(cursor) : null;
  const countWhere = baseWhereClauses.length > 0 ? `WHERE ${baseWhereClauses.join(' AND ')}` : '';
  const countQuery = `SELECT COUNT(*)::int AS count FROM users u ${countWhere}`;

  const totalCount = await safeQuery(async () => {
    const res = await db.query(countQuery, baseParams);
    return number(res.rows[0]?.count);
  }, 0);

  const pageWhereClauses = [...baseWhereClauses];
  const listParams = [...baseParams];
  if (decodedCursor) {
    const timestampPosition = listParams.length + 1;
    const idPosition = listParams.length + 2;
    pageWhereClauses.push(`(u.created_at, u.id) < ($${timestampPosition}::timestamptz, $${idPosition}::uuid)`);
    listParams.push(decodedCursor.createdAt, decodedCursor.id);
  }
  const whereStr = pageWhereClauses.length > 0 ? `WHERE ${pageWhereClauses.join(' AND ')}` : '';

  const listQuery = `
    SELECT 
      u.id::text,
      u.email,
      u.created_at,
      u.updated_at,
      u.is_synthetic,
      COALESCE((SELECT COUNT(*) FROM session_tokens st WHERE st.user_id = u.id), 0)::int AS login_count,
      COALESCE((SELECT COUNT(*) FROM user_corrections uc WHERE uc.user_id = u.id), 0)::int AS correction_count,
      COALESCE((SELECT COUNT(*) FROM product_feedback pf WHERE pf.user_id = u.id), 0)::int AS feedback_count,
      COALESCE((SELECT COUNT(*) FROM theme_assessment_rounds tar WHERE tar.user_id = u.id), 0)::int AS theme_round_count,
      COALESCE((SELECT COUNT(*) FROM assessment_runs ar WHERE ar.user_id = u.id), 0)::int AS legacy_run_count,
      (SELECT MAX(st.created_at) FROM session_tokens st WHERE st.user_id = u.id) AS last_session_at
    FROM users u
    ${whereStr}
    ORDER BY u.created_at DESC NULLS LAST, u.id DESC
    LIMIT $${listParams.length + 1}
  `;
  listParams.push(safeLimit + 1);

  const userRows = await safeQuery(async () => {
    const res = await db.query(listQuery, listParams);
    return res.rows;
  }, []);

const toIso = (val: unknown): string => {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString();
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? String(val) : d.toISOString();
};

  const hasMore = userRows.length > safeLimit;
  const itemsRows = hasMore ? userRows.slice(0, safeLimit) : userRows;
  const nextCursor = hasMore && itemsRows.length > 0
    ? encodeUserCursor({ createdAt: toIso(itemsRows[itemsRows.length - 1].created_at), id: text(itemsRows[itemsRows.length - 1].id) })
    : null;

  const items: AdminUserSummary[] = itemsRows.map((row) => {
    const email = text(row.email);
    const isSynthetic = Boolean(row.is_synthetic);
    const totalRounds = number(row.theme_round_count) + number(row.legacy_run_count);
    const lastActive = row.last_session_at ? text(row.last_session_at) : row.updated_at ? text(row.updated_at) : null;
    const isActive = lastActive ? Date.now() - new Date(lastActive).getTime() < 7 * 86400000 : false;
    const correctionCount = number(row.correction_count);

    let stage = '已注册';
    if (correctionCount > 0) {
      stage = '持续校准';
    } else if (totalRounds > 0) {
      stage = '完成测评';
    }

    return {
      id: text(row.id),
      maskedEmail: maskEmail(email),
      registeredAt: text(row.created_at).slice(0, 10),
      lastActiveAt: lastActive ? lastActive.slice(0, 16).replace('T', ' ') : null,
      maskedLastIp: null,
      loginCount: number(row.login_count),
      assessmentRoundCount: totalRounds,
      feedbackCount: number(row.feedback_count),
      correctionCount,
      // A count of completed rounds is not a confidence score. Until the
      // portrait engine exposes a calibrated value, show the field as unknown.
      portraitConfidence: null,
      status: isActive ? 'active' : 'inactive',
      stage,
      device: '—',
      location: '—',
      isSynthetic,
    };
  });

  return {
    items,
    nextCursor,
    hasMore,
    totalCount,
    excludesSyntheticUsers: excludeAgents,
  };
}

export async function revealSensitiveField(
  adminEmail: string,
  targetUserId: string,
  action: 'reveal_email' | 'reveal_ip' | 'reveal_raw_words',
  reason: string
): Promise<RevealSensitiveResponse> {
  const db = getPool();

  if (!reason || reason.trim().length < 4) {
    throw new Error('查看敏感信息必须提供合法的业务原因（不少于 4 个字符）');
  }

  // 1. Check admin authorization
  const adminRes = await db.query(
    `SELECT id, role, status FROM admin_users WHERE email = $1 LIMIT 1`,
    [adminEmail]
  );
  const adminUser = adminRes.rows[0];
  if (!adminUser || adminUser.status !== 'active') {
    throw new Error('未授权的管理员账号或账号已停用');
  }

  // 2. Fetch the target field value
  const userRes = await db.query(
    `SELECT id, email FROM users WHERE id = $1::uuid LIMIT 1`,
    [targetUserId]
  );
  const targetUser = userRes.rows[0];
  if (!targetUser) {
    throw new Error('目标用户不存在');
  }

  let revealedValue = '';
  let resourceType = 'user_pii';

  if (action === 'reveal_email') {
    revealedValue = targetUser.email;
    resourceType = 'user_email';
  } else if (action === 'reveal_ip') {
    const ipRes = await db.query(
      `SELECT ip_address FROM login_events WHERE user_id = $1::uuid AND ip_address IS NOT NULL ORDER BY occurred_at DESC LIMIT 1`,
      [targetUserId]
    );
    revealedValue = ipRes.rows[0]?.ip_address ?? '该用户尚无已记录的登录 IP';
    resourceType = 'user_ip';
  } else if (action === 'reveal_raw_words') {
    const wordsRes = await db.query(
      `SELECT corrected_text AS text FROM user_corrections WHERE user_id = $1::uuid AND corrected_text IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
      [targetUserId]
    );
    const quoteRes = await db.query(
      `SELECT quote AS text FROM evidence_events WHERE user_id = $1::uuid AND quote IS NOT NULL AND quote != '' ORDER BY created_at DESC LIMIT 1`,
      [targetUserId]
    );
    revealedValue = wordsRes.rows[0]?.text || quoteRes.rows[0]?.text || '该用户尚无可查看的原话或纠错记录';
    resourceType = 'user_raw_words';
  }

  // 3. Write immutable audit log
  const auditRes = await db.query(
    `INSERT INTO admin_access_logs 
      (admin_user_id, admin_email, action, target_user_id, resource_type, resource_id, reason, success)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id::text`,
    [
      adminUser.id,
      adminEmail,
      action,
      targetUserId,
      resourceType,
      targetUserId,
      reason.trim(),
      true,
    ]
  );

  const auditLogId = auditRes.rows[0]?.id;

  return {
    success: true,
    revealedValue,
    targetUserId,
    action,
    auditLogId,
  };
}

export async function getNeonSnapshot(
  range: string = '7d',
  excludeAgents: boolean = false
): Promise<AdminSnapshot> {
  const db = getPool();

  const overview = await getOverviewData(range, excludeAgents);
  const usersPage = await getUsersPage(undefined, 100, range, excludeAgents);

  // 2. Feedback query (from product_feedback table)
  const feedbackResult = await safeQuery(async () => {
    const res = await db.query(`
      SELECT 
        f.id::text, 
        f.category, 
        f.content AS original, 
        f.source_page AS page, 
        f.severity, 
        f.status, 
        f.internal_note,
        f.created_at,
        au.email AS owner
      FROM product_feedback f
      LEFT JOIN admin_users au ON f.assigned_admin_id = au.id
      ORDER BY f.created_at DESC
      LIMIT 100
    `);
    return res.rows;
  }, []);

  const statusMap: Record<string, FeedbackItem['status']> = {
    'new': '新反馈',
    'reviewing': '处理中',
    'confirmed': '已确认',
    'planned': '计划改进',
    'resolved': '已解决',
    'closed': '已关闭'
  };
  const severityMap: Record<string, FeedbackItem['severity']> = {
    'high': '高',
    'medium': '中',
    'low': '低'
  };

  const mappedFeedback: FeedbackItem[] = rows(feedbackResult).map((row) => ({
    id: text(row.id),
    title: text(row.category),
    original: text(row.original),
    category: text(row.category),
    page: text(row.page) || 'web',
    impact: 10,
    severity: severityMap[text(row.severity)] || '中',
    owner: text(row.owner) ? text(row.owner).split('@')[0] : '—',
    status: statusMap[text(row.status)] || (text(row.status) as FeedbackItem['status']) || '新反馈',
    age: text(row.created_at).slice(0, 10),
  }));

  // 3. Quality stats from theme_assessment_result_responses
  const qualityResponses = await safeQuery(async () => {
    const res = await db.query(`
      SELECT action, COUNT(*)::int AS count
      FROM theme_assessment_result_responses
      GROUP BY action
    `);
    return res.rows;
  }, []);

  // 4. Disputed dimensions from user_corrections
  const correctionData = await safeQuery(async () => {
    const res = await db.query(`
      SELECT 
        COALESCE(dimension, '未分类') AS dimension,
        COUNT(*)::int AS count
      FROM user_corrections
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 5
    `);
    const totalRes = await db.query(`SELECT COUNT(*)::int AS total FROM user_corrections`);
    return {
      dimensions: res.rows,
      total: number(totalRes.rows[0]?.total),
    };
  }, { dimensions: [], total: 0 });

  // Quality calculation with safe bounds
  const totalResponses = rows(qualityResponses).reduce((sum, r) => sum + number(r.count), 0);
  const confirmCount = number(rows(qualityResponses).find((r) => r.action === 'confirm')?.count ?? 0);
  const refuteCount = number(rows(qualityResponses).find((r) => r.action === 'refute')?.count ?? 0);

  const confirmationRate = totalResponses > 0 ? Math.round((confirmCount / totalResponses) * 1000) / 10 : 0;
  const rebuttalRate = totalResponses > 0 ? Math.round((refuteCount / totalResponses) * 1000) / 10 : 0;

  const totalCorrections = correctionData.total;
  const disputedDimensions: QualityDimensionDispute[] = rows(correctionData.dimensions).map((row) => ({
    dimension: text(row.dimension),
    dimensionLabel: text(row.dimension),
    disputeCount: number(row.count),
    rate: totalCorrections > 0 ? Math.round((number(row.count) / totalCorrections) * 1000) / 10 : 0,
  }));

  const completedCount = overview.funnel.find(f => f.label.includes('完成测评'))?.count ?? 0;

  const quality: AdminQualitySummary = {
    confirmationRate,
    rebuttalRate,
    sufficientEvidenceCount: completedCount,
    correctionEffectivenessRate: null, // Null indicates correction_records state table is not yet migrated
    disputedDimensions,
    versionComparisons: [
      {
        version: 'v1.4 (Theme-Adaptive)',
        isCurrent: true,
        sampleCount: completedCount,
        completionRate: overview.metrics.completionRate,
        confirmationRate,
        rebuttalRate,
        status: 'active',
      },
    ],
  };

  return {
    mode: 'api',
    authenticated: true,
    overview,
    users: usersPage.items,
    feedback: mappedFeedback,
    quality,
    metricDefinitions: METRIC_DEFINITIONS,
    usersNextCursor: usersPage.nextCursor,
    usersHasMore: usersPage.hasMore,
    totalUsersCount: usersPage.totalCount,
  };
}
