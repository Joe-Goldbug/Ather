import { NextRequest, NextResponse } from 'next/server';
import { getOverviewData } from '../../../../lib/db';
import type { AdminDataEnvelope, OverviewData } from '../../../../lib/types';
import { authenticateAdmin, hasAdminPermission } from '../../../../lib/admin-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const principal = await authenticateAdmin(req);
  if (!principal || !hasAdminPermission(principal.role, 'view_metrics')) {
    return NextResponse.json(
      {
        data: null,
        dataStatus: 'error',
        updatedAt: new Date().toISOString(),
        source: 'database',
        warnings: ['Unauthorized: Valid admin credential required.'],
      } satisfies AdminDataEnvelope<null>,
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '7d';
    const excludeAgents = searchParams.get('excludeAgents') !== 'false';

    const overview = await getOverviewData(range, excludeAgents);

    const envelope: AdminDataEnvelope<OverviewData> = {
      data: overview,
      dataStatus: 'ready',
      updatedAt: new Date().toISOString(),
      source: 'database',
      warnings: [],
    };

    return NextResponse.json(envelope);
  } catch (err: any) {
    console.error('[admin/api/overview]', err?.message || err);
    return NextResponse.json(
      {
        data: null,
        dataStatus: 'error',
        updatedAt: new Date().toISOString(),
        source: 'database',
        warnings: [err?.message || 'Failed to fetch overview data'],
      } satisfies AdminDataEnvelope<null>,
      { status: 500 }
    );
  }
}
