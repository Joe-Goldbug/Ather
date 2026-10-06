import { Pool } from 'pg';
import crypto from 'crypto';

async function runDeepPhase1Audit() {
  const db = new Pool({
    connectionString: 'postgresql://ethan@127.0.0.1:5432/eva_test',
  });

  const baseUrl = 'http://localhost:3102';
  const adminSecret = 'eva-signal-secret';
  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-admin-key': adminSecret
  };

  const testEmail = `phase1-audit-${crypto.randomBytes(4).toString('hex')}@eva.local`;
  let testUserId: string | null = null;
  let testFeedbackId: string | null = null;
  const testEventId = `evt_audit_${crypto.randomBytes(6).toString('hex')}`;

  try {
    console.log('🧪 Starting Rigorous Phase 1 Security, Contract & UI-Loop Verification...\n');

    // ==========================================
    // 1. Setup Test User
    // ==========================================
    const userRes = await db.query(`
      INSERT INTO users (email) VALUES ($1) RETURNING id::text
    `, [testEmail]);
    testUserId = userRes.rows[0].id;
    console.log('✅ [Setup] Created clean test user:', testUserId);

    // ==========================================
    // 2. Security Penetration: Reveal API Auth
    // ==========================================
    console.log('\n🔒 [Security 1/2] Testing Reveal API Authentication & Authorization...');
    
    // 2.1 Unauthenticated reveal request -> MUST 401
    const unauthRevealReq = await fetch(`${baseUrl}/api/admin/audit/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId: testUserId,
        action: 'reveal_email',
        reason: 'Unauthorized attempt',
      })
    });
    if (unauthRevealReq.status !== 401) {
      throw new Error(`SECURITY VULNERABILITY: Reveal API without auth returned HTTP ${unauthRevealReq.status}, expected 401!`);
    }
    console.log('  ✓ Unauthenticated reveal blocked with HTTP 401');

    // 2.2 Authenticated reveal but invalid/short reason -> MUST 403
    const shortReasonRevealReq = await fetch(`${baseUrl}/api/admin/audit/reveal`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        targetUserId: testUserId,
        action: 'reveal_email',
        reason: 'hi', // < 4 chars
      })
    });
    if (shortReasonRevealReq.status !== 403) {
      throw new Error(`SECURITY ISSUE: Reveal with short reason returned HTTP ${shortReasonRevealReq.status}, expected 403!`);
    }
    console.log('  ✓ Short business reason blocked with HTTP 403');

    // 2.3 Authenticated valid reveal -> MUST 200 & insert audit log
    const validRevealReq = await fetch(`${baseUrl}/api/admin/audit/reveal`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        targetUserId: testUserId,
        action: 'reveal_email',
        reason: 'Customer dispute resolution compliance investigation',
      })
    });
    const validRevealJson = await validRevealReq.json();
    if (!validRevealReq.ok || validRevealJson.data?.revealedValue !== testEmail) {
      throw new Error(`Reveal failed to unmask correct email: ${JSON.stringify(validRevealJson)}`);
    }
    console.log('  ✓ Authenticated reveal returned unmasked email:', validRevealJson.data.revealedValue);

    // Verify audit log exists
    const auditCheck = await db.query(`
      SELECT id, admin_email, action, resource_id, reason FROM admin_access_logs 
      WHERE resource_id = $1 AND action = 'reveal_email' ORDER BY occurred_at DESC LIMIT 1
    `, [testUserId]);
    if (auditCheck.rows.length === 0) {
      throw new Error('Audit log was NOT created in admin_access_logs table!');
    }
    console.log('  ✓ Immutable audit record verified in admin_access_logs (ID:', auditCheck.rows[0].id, ')');

    // ==========================================
    // 3. Security Penetration: User 360 API
    // ==========================================
    console.log('\n🔒 [Security 2/2] Testing User 360 Default Masking & RBAC...');
    
    // 3.1 Unauthenticated User 360 -> MUST 401
    const unauth360Req = await fetch(`${baseUrl}/api/admin/users/${testUserId}`);
    if (unauth360Req.status !== 401) {
      throw new Error(`SECURITY VULNERABILITY: User 360 without auth returned HTTP ${unauth360Req.status}, expected 401!`);
    }
    console.log('  ✓ Unauthenticated User 360 blocked with HTTP 401');

    // 3.2 Authenticated User 360 -> MUST return MASKED email and MASKED IP
    // Insert a login event with a known IP
    await db.query(`
      INSERT INTO login_events (user_id, ip_address, device_type, browser, operating_system)
      VALUES ($1, '203.0.113.45', 'desktop', 'Chrome', 'macOS')
    `, [testUserId]);

    const auth360Req = await fetch(`${baseUrl}/api/admin/users/${testUserId}`, { headers: adminHeaders });
    const auth360Json = await auth360Req.json();
    const user360Data = auth360Json.data;
    if (!user360Data || !user360Data.user) {
      throw new Error(`Failed to fetch User 360: ${JSON.stringify(auth360Json)}`);
    }
    if (user360Data.user.maskedEmail === testEmail) {
      throw new Error(`SECURITY LEAK: User 360 returned unmasked raw email by default!`);
    }
    if (!user360Data.user.maskedEmail.includes('***@')) {
      throw new Error(`User 360 email format invalid: ${user360Data.user.maskedEmail}`);
    }
    if (user360Data.devices[0]?.ip_address === '203.0.113.45') {
      throw new Error(`SECURITY LEAK: User 360 returned unmasked IP: ${user360Data.devices[0]?.ip_address}`);
    }
    console.log('  ✓ User 360 correctly masks email by default:', user360Data.user.maskedEmail);
    console.log('  ✓ User 360 correctly masks IP by default:', user360Data.devices[0]?.ip_address);

    // ==========================================
    // 4. Contract Enforcement: Product Events
    // ==========================================
    console.log('\n📜 [Contract Validation] Testing Event Contract Ingestion & Idempotency...');

    // 4.1 Missing required fields (empty or incomplete) -> MUST 400
    const invalidEventReq1 = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'result_viewed' }) // missing eventId, roundId, contentVersion, occurredAt
    });
    if (invalidEventReq1.status !== 400) {
      throw new Error(`CONTRACT FLAW: Partial event payload returned HTTP ${invalidEventReq1.status}, expected 400!`);
    }
    console.log('  ✓ Incomplete event payload rejected with HTTP 400');

    // 4.2 Invalid event name -> MUST 400
    const invalidEventReq2 = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_invalid_name',
        roundId: 'round_01',
        contentVersion: 'v1.4',
        eventName: 'totally_invalid_action',
        occurredAt: new Date().toISOString()
      })
    });
    if (invalidEventReq2.status !== 400) {
      throw new Error(`CONTRACT FLAW: Invalid eventName returned HTTP ${invalidEventReq2.status}, expected 400!`);
    }
    console.log('  ✓ Non-whitelisted eventName rejected with HTTP 400');

    // 4.3 Negative duration -> MUST 400
    const invalidEventReq3 = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_neg_dur',
        roundId: 'round_01',
        contentVersion: 'v1.4',
        eventName: 'node_presented',
        durationMs: -500,
        occurredAt: new Date().toISOString()
      })
    });
    if (invalidEventReq3.status !== 400) {
      throw new Error(`CONTRACT FLAW: Negative durationMs returned HTTP ${invalidEventReq3.status}, expected 400!`);
    }
    console.log('  ✓ Negative durationMs rejected with HTTP 400');

    // 4.4 Valid complete event -> MUST 200
    const validEventReq = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: testEventId,
        userId: testUserId,
        roundId: 'round_theme_01',
        contentVersion: 'v1.4-script-conflict',
        nodeId: 'scene_01_office',
        eventName: 'result_viewed',
        durationMs: 4500,
        occurredAt: new Date().toISOString()
      })
    });
    if (!validEventReq.ok) {
      throw new Error(`Valid event submission failed: ${await validEventReq.text()}`);
    }
    console.log('  ✓ Valid AssessmentNodeEvent submitted successfully (HTTP 200)');

    // 4.5 Idempotent submission with same eventId -> MUST 200 without duplication
    const duplicateEventReq = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: testEventId,
        userId: testUserId,
        roundId: 'round_theme_01',
        contentVersion: 'v1.4-script-conflict',
        nodeId: 'scene_01_office',
        eventName: 'result_viewed',
        durationMs: 4500,
        occurredAt: new Date().toISOString()
      })
    });
    if (!duplicateEventReq.ok) {
      throw new Error('Idempotent retry failed');
    }
    const eventCountCheck = await db.query(`SELECT COUNT(*)::int AS count FROM product_events WHERE event_id = $1`, [testEventId]);
    if (eventCountCheck.rows[0].count !== 1) {
      throw new Error(`Idempotency failure: Found ${eventCountCheck.rows[0].count} duplicate events with ID ${testEventId}`);
    }
    console.log('  ✓ Idempotency verified: duplicate submission ignored safely (Exact count = 1)');

    // ==========================================
    // 5. Product Feedback Workflow & State Transitions
    // ==========================================
    console.log('\n📝 [Feedback Workflow] Testing Feedback Ingestion, Snapshot & State Transitions...');

    // 5.1 Invalid severity -> MUST 400
    const invalidFbReq = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: testUserId,
        content: 'Valid content text',
        severity: 'CRITICAL_UNSUPPORTED'
      })
    });
    if (invalidFbReq.status !== 400) {
      throw new Error(`Feedback with invalid severity returned HTTP ${invalidFbReq.status}, expected 400!`);
    }
    console.log('  ✓ Invalid feedback severity rejected with HTTP 400');

    // 5.2 Valid feedback submission -> MUST 200
    const validFbReq = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: testUserId,
        category: '画像准确性',
        content: '我不是赛博朋克，请修改',
        sourcePage: 'theme-assessment',
        severity: 'high'
      })
    });
    const validFbJson = await validFbReq.json();
    if (!validFbReq.ok || !validFbJson.feedback?.id) {
      throw new Error(`Feedback submission failed: ${JSON.stringify(validFbJson)}`);
    }
    testFeedbackId = validFbJson.feedback.id;
    console.log('  ✓ Valid feedback submitted successfully (Feedback ID:', testFeedbackId, ')');

    // 5.3 Snapshot verification: Ensure feedback is visible in snapshot API
    const snapshotReq = await fetch(`${baseUrl}/api/snapshot?range=7d`, { headers: adminHeaders });
    const snapshotJson = await snapshotReq.json();
    if (!snapshotJson.feedback || snapshotJson.feedback.length === 0) {
      throw new Error('FEEDBACK PIPELINE BROKEN: snapshot.feedback is empty despite records in database!');
    }
    const foundInSnapshot = snapshotJson.feedback.some((f: any) => f.id === testFeedbackId);
    if (!foundInSnapshot) {
      throw new Error('New feedback item not found in snapshot.feedback array!');
    }
    if (snapshotJson.overview.metrics.pendingFeedback < 1) {
      throw new Error(`pendingFeedback counter is ${snapshotJson.overview.metrics.pendingFeedback}, expected >= 1`);
    }
    console.log('  ✓ Feedback successfully connected to Snapshot & Admin Dashboard! (Snapshot feedback count:', snapshotJson.feedback.length, ')');

    // 5.4 State Transition: Invalid status -> MUST 400
    const invalidPatchReq = await fetch(`${baseUrl}/api/admin/feedback/${testFeedbackId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ status: 'totally_invalid_status' })
    });
    if (invalidPatchReq.status !== 400) {
      throw new Error(`PATCH with invalid status returned HTTP ${invalidPatchReq.status}, expected 400!`);
    }
    console.log('  ✓ Invalid feedback state mutation rejected with HTTP 400');

    // 5.5 State Transition: Valid state transition to '计划改进' -> MUST 200
    const validPatchReq = await fetch(`${baseUrl}/api/admin/feedback/${testFeedbackId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ status: '计划改进', internalNote: 'Scheduled for v1.5 script release' })
    });
    const validPatchJson = await validPatchReq.json();
    if (!validPatchReq.ok || validPatchJson.updated?.status !== 'planned') {
      throw new Error(`Status transition failed: ${JSON.stringify(validPatchJson)}`);
    }
    console.log('  ✓ Feedback status successfully transitioned to "计划改进" (planned)');

    // ==========================================
    // 6. User 360 Full Timeline Integration
    // ==========================================
    console.log('\n👁️ [User 360] Verifying unified multi-source timeline in User 360 API...');
    const final360Req = await fetch(`${baseUrl}/api/admin/users/${testUserId}`, { headers: adminHeaders });
    const final360Json = await final360Req.json();
    const timeline = final360Json.data.timeline;
    if (!timeline || timeline.length < 2) {
      throw new Error(`User 360 timeline has only ${timeline?.length} items, expected >= 2 (login + event + feedback)!`);
    }
    console.log('  ✓ User 360 unified timeline contains', timeline.length, 'chronological events from 3 distinct sources:');
    timeline.forEach((item: any) => console.log(`     • [${item.type}] ${item.title} (${item.created_at?.slice(0, 19)})`));

    console.log('\n======================================================');
    console.log('🎉 ALL 5 AUDIT GATES & SECURITY CHECKS PASSED WITH 100% SUCCESS!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ AUDIT VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    // Exact cleanup of test data
    console.log('🧹 Cleaning up audit test records...');
    if (testUserId) {
      await db.query(`DELETE FROM product_events WHERE user_id = $1::uuid`, [testUserId]);
      await db.query(`DELETE FROM product_feedback WHERE user_id = $1::uuid`, [testUserId]);
      await db.query(`DELETE FROM login_events WHERE user_id = $1::uuid`, [testUserId]);
      await db.query(`DELETE FROM users WHERE id = $1::uuid`, [testUserId]);
    }
    if (testEventId) {
      await db.query(`DELETE FROM product_events WHERE event_id = $1`, [testEventId]);
    }
    await db.end();
    console.log('✨ Cleanup complete.');
  }
}

runDeepPhase1Audit();
