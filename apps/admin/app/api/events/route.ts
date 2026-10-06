import { NextResponse } from 'next/server';

// Product telemetry enters through the authenticated main API. Retiring this
// Admin-origin endpoint prevents cross-origin cookies and client-chosen IDs.
export async function POST() {
  return NextResponse.json(
    { error: 'Gone: send telemetry to the authenticated EVA API at /product-events.' },
    { status: 410 }
  );
}
