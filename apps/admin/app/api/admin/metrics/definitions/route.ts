import { NextRequest, NextResponse } from 'next/server';
import { METRIC_DEFINITIONS } from '../../../../../lib/db';
import type { AdminDataEnvelope, AdminMetricDefinition } from '../../../../../lib/types';
import { authenticateAdmin, hasAdminPermission } from '../../../../../lib/admin-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const principal = await authenticateAdmin(req);
  if (!principal || !hasAdminPermission(principal.role, 'view_metrics')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const envelope: AdminDataEnvelope<AdminMetricDefinition[]> = {
    data: METRIC_DEFINITIONS,
    dataStatus: 'ready',
    updatedAt: new Date().toISOString(),
    source: 'derived',
    warnings: [],
  };

  return NextResponse.json(envelope);
}
