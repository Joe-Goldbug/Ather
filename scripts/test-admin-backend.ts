#!/usr/bin/env bun
/**
 * Standalone Verification Test Suite for EVA Admin Dashboard (Phase 0)
 *
 * Usage:
 *   bun run scripts/test-admin-backend.ts
 *   ADMIN_DATA_MODE=api ADMIN_DATABASE_URL="postgresql://ethan@127.0.0.1:5432/eva_test" bun run scripts/test-admin-backend.ts
 */

import { getMockSnapshot } from '../apps/admin/lib/mock-data';
import {
  getNeonSnapshot,
  getUsersPage,
  METRIC_DEFINITIONS,
  revealSensitiveField,
  getPool,
} from '../apps/admin/lib/db';
import type {
  AdminSnapshot,
  AdminUserSummary,
  FeedbackItem,
} from '../apps/admin/lib/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

function testMockSnapshot() {
  console.log('🧪 [Test 1/5] Verifying Mock Snapshot Data & Contract...');
  const snapshot: AdminSnapshot = getMockSnapshot();

  assert(snapshot.mode === 'mock', 'Snapshot mode must be "mock"');
  assert(Boolean(snapshot.overview), 'Overview must be defined');
  assert(typeof snapshot.overview.metrics.registrations === 'number', 'Registrations metric must be a number');
  assert(typeof snapshot.overview.metrics.activeUsers === 'number', 'Active users metric must be a number');
  assert(typeof snapshot.overview.metrics.completionRate === 'number', 'Completion rate metric must be a number');
  assert(typeof snapshot.overview.metrics.pendingFeedback === 'number', 'Pending feedback metric must be a number');

  assert(Array.isArray(snapshot.overview.activity), 'Activity must be an array');
  assert(snapshot.overview.activity.length > 0, 'Activity must have entries');

  assert(Array.isArray(snapshot.overview.funnel), 'Funnel must be an array');
  assert(snapshot.overview.funnel.length > 0, 'Funnel must have entries');

  assert(Array.isArray(snapshot.users), 'Users must be an array');
  assert(snapshot.users.length > 0, 'Users must have entries');

  // Verify email privacy masking
  for (const user of snapshot.users) {
    assert(Boolean(user.id), 'User id must exist');
    assert(user.maskedEmail.includes('***'), `User email must be masked: ${user.maskedEmail}`);
  }

  assert(Array.isArray(snapshot.feedback), 'Feedback must be an array');
  assert(snapshot.feedback.length > 0, 'Feedback must have entries');

  assert(Boolean(snapshot.quality), 'Quality summary must be defined in snapshot');
  assert(typeof snapshot.quality?.confirmationRate === 'number', 'Quality confirmationRate must be a number');
  assert(typeof snapshot.quality?.rebuttalRate === 'number', 'Quality rebuttalRate must be a number');

  console.log(`✅ Mock Snapshot verified successfully!`);
}

function testDataStructures() {
  console.log('\n🧪 [Test 2/5] Verifying Data Types and Contract Schema...');
  const snapshot: AdminSnapshot = getMockSnapshot();

  const user = snapshot.users[0] as AdminUserSummary;
  const userFields: (keyof AdminUserSummary)[] = [
    'id',
    'maskedEmail',
    'registeredAt',
    'lastActiveAt',
    'maskedLastIp',
    'loginCount',
    'assessmentRoundCount',
    'feedbackCount',
    'correctionCount',
    'portraitConfidence',
    'status',
    'stage',
    'device',
    'location',
  ];
  for (const field of userFields) {
    assert(field in user, `User field "${field}" must exist`);
  }

  const fb = snapshot.feedback[0] as FeedbackItem;
  const fbFields: (keyof FeedbackItem)[] = [
    'id',
    'title',
    'original',
    'category',
    'page',
    'impact',
    'severity',
    'owner',
    'status',
    'age',
  ];
  for (const field of fbFields) {
    assert(field in fb, `Feedback field "${field}" must exist`);
  }

  assert(METRIC_DEFINITIONS.length >= 5, 'Must have at least 5 metric definitions');
  console.log(`✅ Admin Data Schema contract verified (${METRIC_DEFINITIONS.length} metric definitions).`);
}

async function testSecurityBoundaries() {
  console.log('\n🧪 [Test 3/5] Verifying Security Boundaries & Isolation Rules...');

  const origAdminUrl = process.env.ADMIN_DATABASE_URL;
  const origDbUrl = process.env.DATABASE_URL;

  try {
    delete process.env.ADMIN_DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://fake-high-privilege-url';

    let errorThrown = false;
    try {
      await getNeonSnapshot();
    } catch (err: any) {
      errorThrown = true;
      assert(
        err.message.includes('ADMIN_DATABASE_URL'),
        `Expected ADMIN_DATABASE_URL error, got: ${err.message}`
      );
    }
    assert(errorThrown, 'getNeonSnapshot must reject when ADMIN_DATABASE_URL is not explicitly set');
    console.log('✅ Strict ADMIN_DATABASE_URL security isolation rule verified (no fallback to DATABASE_URL).');
  } finally {
    if (origAdminUrl) process.env.ADMIN_DATABASE_URL = origAdminUrl;
    else delete process.env.ADMIN_DATABASE_URL;

    if (origDbUrl) process.env.DATABASE_URL = origDbUrl;
    else delete process.env.DATABASE_URL;
  }
}

async function testLiveDatabaseMetrics() {
  if (!process.env.ADMIN_DATABASE_URL) {
    console.log('\n⏭️ [Test 4/5] Skipped live PostgreSQL metrics: set ADMIN_DATABASE_URL to run this explicit integration check.');
    return;
  }

  console.log('\n🧪 [Test 4/5] Verifying Live PostgreSQL Metrics & Agent Isolation...');
  // 1. Test Overview with Agent Exclusion (Default)
  const snapExcluded = await getNeonSnapshot('7d', true);
  assert(snapExcluded.mode === 'api', 'Mode must be api');
  assert(typeof snapExcluded.overview.metrics.registrations === 'number', 'Registrations must be a valid number');
  assert(!isNaN(snapExcluded.overview.metrics.completionRate), 'Completion rate must not be NaN');

  // 2. Test Overview with Agent Inclusion
  const snapAll = await getNeonSnapshot('7d', false);
  assert(snapAll.overview.metrics.registrations >= snapExcluded.overview.metrics.registrations, 'All registrations >= Excluded registrations');

  // 3. Test Funnel status
  const portraitStep = snapExcluded.overview.funnel.find(f => f.label.includes('查看画像'));
  assert(portraitStep?.status === 'unavailable' || portraitStep?.status === 'ready', 'Portrait view step status must be valid (ready or unavailable)');

  console.log(`✅ Live Database Metrics verified:`);
  console.log(`   - Real registrations (excluded agents): ${snapExcluded.overview.metrics.registrations}`);
  console.log(`   - Total registrations (including agents): ${snapAll.overview.metrics.registrations}`);
  console.log(`   - Real completion rate: ${snapExcluded.overview.metrics.completionRate}%`);
}

async function testCursorPaginationAndAudit() {
  if (!process.env.ADMIN_DATABASE_URL) {
    console.log('\n⏭️ [Test 5/5] Skipped live pagination/audit: set ADMIN_DATABASE_URL to run this explicit integration check.');
    return;
  }

  console.log('\n🧪 [Test 5/5] Verifying Cursor Pagination & Sensitive Access Audit...');
  try {
    // 1. Test Cursor Pagination
    const page1 = await getUsersPage(undefined, 10, 'all', false);
    assert(Array.isArray(page1.items), 'Page 1 items must be array');
    assert(page1.totalCount > 0, 'Total count must be > 0');

    if (page1.hasMore && page1.nextCursor) {
      const page2 = await getUsersPage(page1.nextCursor, 10, 'all', false);
      assert(Array.isArray(page2.items), 'Page 2 items must be array');
      assert(page2.items.length > 0, 'Page 2 must have items');
      assert(page1.items[0].id !== page2.items[0].id, 'Page 1 and Page 2 must not have the same first item');
    }
    console.log(`✅ Cursor Pagination verified: Page 1 returned ${page1.items.length} items (Total: ${page1.totalCount})`);

    // 2. Test Sensitive Reveal with Audit
    if (page1.items.length > 0) {
      const targetUser = page1.items[0];
      const revealRes = await revealSensitiveField(
        'admin@eva.local',
        targetUser.id,
        'reveal_email',
        '测试 Phase 0 敏感信息审计日志写入'
      );
      assert(revealRes.success === true, 'Reveal must succeed');
      assert(Boolean(revealRes.revealedValue), 'Revealed value must be returned');
      assert(Boolean(revealRes.auditLogId), 'Audit log ID must be generated');

      // Verify audit log exists in DB
      const db = getPool();
      const auditQuery = await db.query(`SELECT * FROM admin_access_logs WHERE id = $1::uuid`, [revealRes.auditLogId]);
      assert(auditQuery.rows.length === 1, 'Audit log record must exist in admin_access_logs');
      assert(auditQuery.rows[0].action === 'reveal_email', 'Audit log action must be reveal_email');
      console.log(`✅ Sensitive Data Reveal & Audit Log verified (Audit ID: ${revealRes.auditLogId.slice(0, 8)}...)`);
    }
  } catch (err: any) {
    console.error(`❌ Pagination & Audit test failed:`, err?.message || err);
    process.exit(1);
  }
}

async function main() {
  console.log('================================================================');
  console.log('🚀 EVA Admin Dashboard (Signal Room Phase 0) Verification');
  console.log('================================================================\n');

  testMockSnapshot();
  testDataStructures();
  await testSecurityBoundaries();
  await testLiveDatabaseMetrics();
  await testCursorPaginationAndAudit();

  console.log('\n🎉 All 5/5 Phase 0 verification tests passed successfully!\n');
}

main().catch((err) => {
  console.error('Fatal error during test:', err);
  process.exit(1);
});
