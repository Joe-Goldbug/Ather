import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../../lib/db';
import { authenticateAdmin, hasAdminPermission } from '../../../../../lib/admin-auth';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set(['new', 'reviewing', 'confirmed', 'planned', 'resolved', 'closed']);
const VALID_SEVERITIES = new Set(['high', 'medium', 'low']);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ feedbackId: string }> }) {
  const principal = await authenticateAdmin(req);
  if (!principal || !hasAdminPermission(principal.role, 'update_feedback')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { feedbackId } = await params;
    const { status, severity, internalNote } = await req.json().catch(() => ({}));
    const db = getPool();

    // Map Chinese status back to DB English status if needed
    const reverseStatusMap: Record<string, string> = {
      '新反馈': 'new',
      '处理中': 'reviewing',
      '已确认': 'confirmed',
      '计划改进': 'planned',
      '已解决': 'resolved',
      '已关闭': 'closed'
    };
    const dbStatus = status ? (reverseStatusMap[status] || status) : undefined;

    const reverseSeverityMap: Record<string, string> = {
      '高': 'high',
      '中': 'medium',
      '低': 'low'
    };
    const dbSeverity = severity ? (reverseSeverityMap[severity] || severity) : undefined;

    if (dbStatus && !VALID_STATUSES.has(dbStatus)) {
      return NextResponse.json({ 
        error: `Invalid status. Must be one of: ${Array.from(VALID_STATUSES).join(', ')}` 
      }, { status: 400 });
    }

    if (dbSeverity && !VALID_SEVERITIES.has(dbSeverity)) {
      return NextResponse.json({ 
        error: `Invalid severity. Must be one of: ${Array.from(VALID_SEVERITIES).join(', ')}` 
      }, { status: 400 });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT status, severity FROM product_feedback WHERE id = $1::uuid FOR UPDATE`,
        [feedbackId]
      );
      if (current.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
      }
      const res = await client.query(`
        UPDATE product_feedback
        SET
          status = COALESCE($1, status),
          severity = COALESCE($2, severity),
          internal_note = COALESCE($3, internal_note),
          resolved_at = CASE 
            WHEN $1 IN ('resolved', 'closed') THEN COALESCE(resolved_at, NOW()) 
            WHEN $1 IS NOT NULL THEN NULL 
            ELSE resolved_at 
          END,
          updated_at = NOW()
        WHERE id = $4::uuid
        RETURNING id::text, status, severity, internal_note, updated_at;
      `, [dbStatus || null, dbSeverity || null, internalNote || null, feedbackId]);

      const updated = res.rows[0];
      await client.query(`
        INSERT INTO product_feedback_status_history
          (feedback_id, previous_status, next_status, previous_severity, next_severity, admin_user_id, admin_email, internal_note)
        VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, $7, $8)
      `, [feedbackId, current.rows[0].status, updated.status, current.rows[0].severity, updated.severity, principal.id, principal.email, internalNote || null]);
      await client.query(`
        INSERT INTO admin_access_logs (admin_user_id, admin_email, action, resource_type, resource_id, reason, success)
        VALUES ($1::uuid, $2, 'update_feedback_status', 'product_feedback', $3, '流转工单状态至 ' || $4, true)
      `, [principal.id, principal.email, feedbackId, updated.status]);
      await client.query('COMMIT');
      return NextResponse.json({ success: true, updated });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[api/admin/feedback PATCH]', err?.message || err);
    return NextResponse.json({ error: 'Failed to update feedback' }, { status: 500 });
  }
}
