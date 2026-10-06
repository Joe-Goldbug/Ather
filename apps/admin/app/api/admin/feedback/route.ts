import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../lib/db';
import type { AdminDataEnvelope } from '../../../../lib/types';
import { authenticateAdmin, hasAdminPermission } from '../../../../lib/admin-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const principal = await authenticateAdmin(req);
  if (!principal || !hasAdminPermission(principal.role, 'view_feedback')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '50', 10));
    const status = searchParams.get('status'); // e.g. 'new', 'reviewing', 'resolved'

    const db = getPool();
    let query = `
      SELECT f.id::text, f.content AS original, f.category, f.source_page AS page, 
             f.status, f.severity, f.created_at, f.updated_at,
             au.email AS owner
      FROM product_feedback f
      LEFT JOIN admin_users au ON f.assigned_admin_id = au.id
    `;
    const params: any[] = [];
    if (status) {
      query += ` WHERE f.status = $1`;
      params.push(status);
    }
    
    query += ` ORDER BY f.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const res = await db.query(query, params);

    const formattedFeedback = res.rows.map(row => {
      // Map English status back to Chinese for frontend compatibility
      const statusMap: Record<string, string> = {
        'new': '新反馈',
        'reviewing': '处理中',
        'confirmed': '已确认',
        'planned': '计划改进',
        'resolved': '已解决',
        'closed': '已关闭'
      };
      const severityMap: Record<string, string> = {
        'high': '高',
        'medium': '中',
        'low': '低'
      };

      return {
        id: row.id,
        title: row.category, // Fallback since title doesn't exist
        original: row.original,
        category: row.category,
        page: row.page,
        impact: null, // No score is stored yet; do not fabricate a product signal.
        severity: severityMap[row.severity] || '中',
        owner: row.owner ? row.owner.split('@')[0] : '—',
        status: statusMap[row.status] || row.status,
        age: row.created_at.toISOString() // Frontend can parse this to "X time ago"
      };
    });

    const envelope: AdminDataEnvelope<any[]> = {
      data: formattedFeedback,
      dataStatus: 'ready',
      updatedAt: new Date().toISOString(),
      source: 'database',
      warnings: [],
    };

    return NextResponse.json(envelope);
  } catch (err: any) {
    console.error('[api/admin/feedback GET]', err?.message || err);
    return NextResponse.json({ error: 'Failed to list feedback' }, { status: 500 });
  }
}
