import { NextRequest, NextResponse } from 'next/server';
import { revealSensitiveField, getPool } from '../../../../../lib/db';
import type { AdminDataEnvelope, RevealSensitiveResponse } from '../../../../../lib/types';
import { authenticateAdmin, hasAdminPermission } from '../../../../../lib/admin-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const principal = await authenticateAdmin(req);
  if (!principal) {
    return NextResponse.json(
      {
        data: null,
        dataStatus: 'error',
        updatedAt: new Date().toISOString(),
        source: 'database',
        warnings: ['Unauthorized: valid admin credentials required'],
      } satisfies AdminDataEnvelope<null>,
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { targetUserId, action, reason } = body;

    if (!targetUserId || !action) {
      return NextResponse.json(
        {
          data: null,
          dataStatus: 'error',
          updatedAt: new Date().toISOString(),
          source: 'database',
          warnings: ['Missing required fields: targetUserId, action'],
        } satisfies AdminDataEnvelope<null>,
        { status: 400 }
      );
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 4) {
      return NextResponse.json(
        {
          data: null,
          dataStatus: 'error',
          updatedAt: new Date().toISOString(),
          source: 'database',
          warnings: ['查看敏感信息必须提供合法的业务原因（不少于 4 个字符）'],
        } satisfies AdminDataEnvelope<null>,
        { status: 403 }
      );
    }

    const requiredPermission = action === 'reveal_email'
      ? 'reveal_email'
      : action === 'reveal_ip'
        ? 'reveal_ip'
        : action === 'reveal_raw_words'
          ? 'reveal_raw_words'
          : null;
    if (!requiredPermission || !hasAdminPermission(principal.role, requiredPermission)) {
      return NextResponse.json({ error: 'Forbidden: role cannot reveal this field' }, { status: 403 });
    }

    const result = await revealSensitiveField(principal.email, targetUserId, action, reason.trim());

    const envelope: AdminDataEnvelope<RevealSensitiveResponse> = {
      data: result,
      dataStatus: 'ready',
      updatedAt: new Date().toISOString(),
      source: 'database',
      warnings: [],
    };

    return NextResponse.json(envelope);
  } catch (err: any) {
    console.error('[admin/api/audit/reveal]', err?.message || err);
    return NextResponse.json(
      {
        data: null,
        dataStatus: 'error',
        updatedAt: new Date().toISOString(),
        source: 'database',
        warnings: [err?.message || 'Sensitive data access denied'],
      } satisfies AdminDataEnvelope<null>,
      { status: 403 }
    );
  }
}
