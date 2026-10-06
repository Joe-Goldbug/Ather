import { NextResponse } from 'next/server';

// User feedback enters through the authenticated main API. The Admin service
// must never accept a browser-supplied user identity as a write authority.
export async function POST() {
  return NextResponse.json(
    { error: 'Gone: submit feedback to the authenticated EVA API at /product-feedback.' },
    { status: 410 }
  );
}
