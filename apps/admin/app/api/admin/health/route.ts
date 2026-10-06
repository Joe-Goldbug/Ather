import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '../../../../lib/db';
import type { AdminDataEnvelope } from '../../../../lib/types';
import { authenticateAdmin } from '../../../../lib/admin-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (!await authenticateAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const mode = process.env.ADMIN_DATA_MODE ?? 'mock';
  let dbStatus = 'disconnected';

  if (mode === 'api') {
    try {
      const db = getPool();
      const res = await db.query('SELECT 1 AS ok');
      if (res.rows[0]?.ok === 1) {
        dbStatus = 'connected';
      }
    } catch (err: any) {
      dbStatus = `error: ${err?.message || 'cannot reach postgres'}`;
    }
  } else {
    dbStatus = 'isolated_mock';
  }

  const envelope: AdminDataEnvelope<{
    status: 'healthy' | 'degraded';
    mode: string;
    database: string;
    nodeEnv: string;
    serverTime: string;
  }> = {
    data: {
      status: dbStatus.startsWith('error') ? 'degraded' : 'healthy',
      mode,
      database: dbStatus,
      nodeEnv: process.env.NODE_ENV || 'development',
      serverTime: new Date().toISOString(),
    },
    dataStatus: dbStatus.startsWith('error') ? 'partial' : 'ready',
    updatedAt: new Date().toISOString(),
    source: 'derived',
    warnings: dbStatus.startsWith('error') ? [dbStatus] : [],
  };

  return NextResponse.json(envelope);
}
