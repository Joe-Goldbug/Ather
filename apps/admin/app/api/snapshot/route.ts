import { NextRequest, NextResponse } from 'next/server';
import { getNeonSnapshot } from '../../../lib/db';
import { getMockSnapshot } from '../../../lib/mock-data';
import { authenticateAdmin, hasAdminPermission } from '../../../lib/admin-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const principal = await authenticateAdmin(req);
    if (!principal || !hasAdminPermission(principal.role, 'view_metrics')) {
      return NextResponse.json(
        {
          error: 'Unauthorized: Valid admin credential (ADMIN_SECRET) required.',
          authenticated: false,
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '7d';
    const excludeAgents = searchParams.get('excludeAgents') !== 'false'; // Defaults to true (exclude agents by default)

    const mode = process.env.ADMIN_DATA_MODE ?? 'mock';
    if (mode === 'api') {
      const data = await getNeonSnapshot(range, excludeAgents);
      return NextResponse.json(data);
    }

    const mockData = getMockSnapshot();
    return NextResponse.json(mockData);
  } catch (error) {
    console.error('[admin/snapshot]', error instanceof Error ? error.message : error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Admin data unavailable',
        authenticated: true,
      },
      { status: 503 }
    );
  }
}
