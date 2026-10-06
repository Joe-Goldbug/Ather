import { NextRequest, NextResponse } from 'next/server';
import { getPool, maskEmail } from '../../../../../lib/db';
import type { AdminDataEnvelope } from '../../../../../lib/types';
import { authenticateAdmin, hasAdminPermission } from '../../../../../lib/admin-auth';

export const dynamic = 'force-dynamic';

function maskIp(ip: string): string {
  if (!ip) return '—';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***`;
  }
  return '***.***.***';
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const principal = await authenticateAdmin(req);
  if (!principal || !hasAdminPermission(principal.role, 'view_masked_users')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getPool();
    const { userId } = await params;

    // 1. User basic info
    const userRes = await db.query(`SELECT id, email, is_synthetic, created_at, updated_at FROM users WHERE id = $1::uuid`, [userId]);
    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const rawUser = userRes.rows[0];

    // 2. Timeline (Aggregating session_tokens, theme_assessment_rounds, product_events, product_feedback, user_corrections)
    const timeline = await db.query(`
      SELECT 'login' AS type, created_at, '登录系统' AS title, NULL AS meta 
      FROM session_tokens WHERE user_id = $1::uuid
      UNION ALL
      SELECT 'theme_round' AS type, created_at, '完成剧本测评: ' || theme_lens AS title, '(' || status || ')' AS meta 
      FROM theme_assessment_rounds WHERE user_id = $1::uuid
      UNION ALL
      SELECT 'event' AS type, occurred_at AS created_at, '行为节点: ' || event_name AS title, COALESCE(node_id, path_id) AS meta
      FROM product_events WHERE user_id = $1::uuid
      UNION ALL
      SELECT 'feedback' AS type, created_at, '提交工单反馈: ' || category AS title, status AS meta 
      FROM product_feedback WHERE user_id = $1::uuid
      UNION ALL
      SELECT 'correction' AS type, created_at, '主动纠偏反驳: ' || COALESCE(dimension, '未分类') AS title, NULL AS meta
      FROM user_corrections WHERE user_id = $1::uuid
      ORDER BY created_at DESC LIMIT 50;
    `, [userId]);

    // 3. Continuous Portrait
    const portrait = await db.query(`
      SELECT current_revision_id AS revision, updated_at, 'active' AS status, state AS dimensions_summary 
      FROM continuous_portraits WHERE user_id = $1::uuid ORDER BY updated_at DESC LIMIT 1;
    `, [userId]);

    // 4. Evidence Events (quote_text masked as NULL by default to enforce reveal_raw_words permission & audit log)
    const evidence = await db.query(`
      SELECT id, source_type, NULL AS quote_text, weight, dimension AS target_dimension, evidence_kind AS action, created_at
      FROM evidence_events WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT 20;
    `, [userId]);
    
    // 5. Login Devices with masked IP
    const devices = await db.query(`
      SELECT id, ip_address, device_type, browser, operating_system, occurred_at 
      FROM login_events WHERE user_id = $1::uuid ORDER BY occurred_at DESC LIMIT 5;
    `, [userId]);

    const maskedDevices = devices.rows.map(d => ({
      ...d,
      ip_address: maskIp(d.ip_address),
    }));

    const isSynthetic = Boolean(rawUser.is_synthetic) || (rawUser.email ? String(rawUser.email).startsWith('qa+') : false);

    const detail360 = {
      user: {
        id: rawUser.id,
        maskedEmail: maskEmail(rawUser.email),
        isSynthetic,
        created_at: rawUser.created_at,
        updated_at: rawUser.updated_at,
      },
      timeline: timeline.rows,
      portrait: portrait.rows[0] || null,
      evidence: evidence.rows,
      devices: maskedDevices,
    };

    const envelope: AdminDataEnvelope<any> = {
      data: detail360,
      dataStatus: 'ready',
      updatedAt: new Date().toISOString(),
      source: 'database',
      warnings: [],
    };

    return NextResponse.json(envelope);
  } catch (err: any) {
    console.error('[api/admin/users/[userId] GET]', err?.message || err);
    return NextResponse.json({ error: 'Failed to fetch user 360 data' }, { status: 500 });
  }
}
