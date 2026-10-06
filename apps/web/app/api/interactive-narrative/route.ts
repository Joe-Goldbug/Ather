import { NextResponse } from 'next/server';

/**
 * The former direct-to-provider narrative endpoint is intentionally retired.
 * Theme-round follow-ups are generated through the authenticated NestJS path
 * and must obey the same evidence and rendering contract as every other turn.
 */
export async function POST() {
  return NextResponse.json(
    {
      code: 'interactive_narrative_retired',
      message: 'Use /v1/assessment-rounds through the authenticated API.',
    },
    { status: 410 }
  );
}
