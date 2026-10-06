import { NextRequest, NextResponse } from 'next/server';
import { getUsersPage } from '../../../../lib/db';
import type { AdminDataEnvelope, AdminUsersPage } from '../../../../lib/types';
import { authenticateAdmin, hasAdminPermission } from '../../../../lib/admin-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const principal = await authenticateAdmin(req);
  if (!principal || !hasAdminPermission(principal.role, 'view_masked_users')) {
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
    const cursor = searchParams.get('cursor') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const range = searchParams.get('range') || 'all';
    const excludeAgents = searchParams.get('excludeAgents') !== 'false';
    const query = searchParams.get('query') || undefined;

    const page = await getUsersPage(cursor, limit, range, excludeAgents, query);

    const envelope: AdminDataEnvelope<AdminUsersPage> = {
      data: page,
      dataStatus: 'ready',
      updatedAt: new Date().toISOString(),
      source: 'database',
      warnings: [],
    };

    return NextResponse.json(envelope);
  } catch (err: any) {
    console.error('[admin/api/users]', err?.message || err);
    return NextResponse.json(
      {
        data: null,
        dataStatus: 'error',
        updatedAt: new Date().toISOString(),
        source: 'database',
        warnings: [err?.message || 'Failed to fetch users page'],
      } satisfies AdminDataEnvelope<null>,
      { status: 500 }
    );
  }
}
