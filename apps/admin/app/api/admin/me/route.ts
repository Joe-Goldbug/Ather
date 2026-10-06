import { NextRequest, NextResponse } from 'next/server';
import type { AdminDataEnvelope } from '../../../../lib/types';
import { authenticateAdmin, hasAdminPermission, type AdminPermission } from '../../../../lib/admin-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const principal = await authenticateAdmin(req);
  if (!principal) {
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

  const allPermissions: AdminPermission[] = ['view_metrics', 'view_masked_users', 'view_feedback', 'update_feedback', 'reveal_email', 'reveal_ip', 'reveal_raw_words'];

  const envelope: AdminDataEnvelope<{
    id: string;
    email: string;
    role: string;
    permissions: string[];
    authenticated: boolean;
  }> = {
    data: {
      id: principal.id ?? 'dev_admin',
      email: principal.email,
      role: principal.role,
      permissions: allPermissions.filter((permission) => hasAdminPermission(principal.role, permission)),
      authenticated: true,
    },
    dataStatus: 'ready',
    updatedAt: new Date().toISOString(),
    source: 'database',
    warnings: [],
  };

  return NextResponse.json(envelope);
}
