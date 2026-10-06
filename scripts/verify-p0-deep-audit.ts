import { getPool } from '../apps/admin/lib/db';

async function deepAudit() {
  console.log('================================================================');
  console.log('🔍 Comprehensive Deep Audit for EVA Admin Phase 0');
  console.log('================================================================\n');

  const secret = 'eva-signal-secret';
  const headers = { 'x-admin-key': secret };
  const db = getPool();
  let failureCount = 0;

  function check(name: string, condition: boolean, details?: any) {
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      if (details) console.log(`         `, details);
    } else {
      console.error(`❌ [FAIL] ${name}`);
      if (details) console.error(`         `, details);
      failureCount++;
    }
  }

  // ── 1. 权限拦截与生产安全 (P0-05) ──────────────────────────────────────────
  console.log('\n--- 1. Auth & Security Invariants ---');
  const noAuthRes = await fetch('http://localhost:3102/api/snapshot');
  check('Unauthenticated request returns 401', noAuthRes.status === 401, { status: noAuthRes.status });

  const badAuthRes = await fetch('http://localhost:3102/api/snapshot', { headers: { 'x-admin-key': 'wrong-secret' } });
  check('Invalid secret returns 401', badAuthRes.status === 401, { status: badAuthRes.status });

  const authedRes = await fetch('http://localhost:3102/api/snapshot', { headers });
  check('Valid secret returns 200', authedRes.status === 200, { status: authedRes.status });

  // ── 2. 指标字典与公式完整性 (P0-01) ──────────────────────────────────────────
  console.log('\n--- 2. Metric Definitions & Contract ---');
  const defsRes = await fetch('http://localhost:3102/api/admin/metrics/definitions', { headers });
  const defsJson = await defsRes.json();
  check('GET /api/admin/metrics/definitions returns ready status', defsJson.dataStatus === 'ready');
  check('At least 7 metric definitions present', Array.isArray(defsJson.data) && defsJson.data.length >= 7, {
    count: defsJson.data?.length,
  });

  const regDef = defsJson.data?.find((d: any) => d.key === 'registrations');
  check('Metric has numerator, sourceTables, description', Boolean(regDef?.numerator && regDef?.sourceTables?.length > 0));

  // ── 3. 真实 SQL 对账验证 (P0-01, P0-04) ─────────────────────────────────────
  console.log('\n--- 3. Database Count Consistency & Agent Isolation ---');
  // Lifetime checks (range=all)
  const dbRegExcludedAll = await db.query(`SELECT COUNT(*)::int AS count FROM users WHERE email NOT LIKE 'qa+%'`);
  const expectedExcludedAll = dbRegExcludedAll.rows[0].count;

  const dbRegAll = await db.query(`SELECT COUNT(*)::int AS count FROM users`);
  const expectedAll = dbRegAll.rows[0].count;

  const snapExcludedAll = await (await fetch('http://localhost:3102/api/snapshot?range=all&excludeAgents=true', { headers })).json();
  check('Lifetime Excluded snapshot matches DB COUNT', snapExcludedAll.overview?.metrics?.registrations === expectedExcludedAll, {
    snapshot: snapExcludedAll.overview?.metrics?.registrations,
    database: expectedExcludedAll,
  });

  const snapAllLifetime = await (await fetch('http://localhost:3102/api/snapshot?range=all&excludeAgents=false', { headers })).json();
  check('Lifetime All snapshot matches DB COUNT', snapAllLifetime.overview?.metrics?.registrations === expectedAll, {
    snapshot: snapAllLifetime.overview?.metrics?.registrations,
    database: expectedAll,
  });

  // 7-day checks (range=7d)
  const dbReg7d = await db.query(`SELECT COUNT(*)::int AS count FROM users WHERE created_at >= NOW() - interval '7 days'`);
  const snap7d = await (await fetch('http://localhost:3102/api/snapshot?range=7d&excludeAgents=false', { headers })).json();
  check('7d snapshot matches DB 7-day query', snap7d.overview?.metrics?.registrations === dbReg7d.rows[0].count, {
    snapshot: snap7d.overview?.metrics?.registrations,
    database: dbReg7d.rows[0].count,
  });

  // ── 4. 0 数据与除以 0 防御 (P0-02) ────────────────────────────────────────
  console.log('\n--- 4. Edge Cases: 0-Data & Divide-by-Zero Resilience ---');
  const snapExcluded7d = await (await fetch('http://localhost:3102/api/snapshot?range=7d&excludeAgents=true', { headers })).json();
  check('completionRate is a valid number (not NaN)', typeof snapExcluded7d.overview?.metrics?.completionRate === 'number' && !isNaN(snapExcluded7d.overview?.metrics?.completionRate));

  const unavailableStep = snapExcluded7d.overview?.funnel?.find((f: any) => f.label.includes('查看画像'));
  check('Funnel step status is valid (ready or unavailable)', unavailableStep?.status === 'unavailable' || unavailableStep?.status === 'ready', {
    step: unavailableStep,
  });

  // ── 5. Cursor 分页游标与时间范围过滤 (P0-03) ────────────────────────────────
  console.log('\n--- 5. Server-side Cursor Pagination & Time Range ---');
  const page1Res = await fetch('http://localhost:3102/api/admin/users?limit=5&excludeAgents=false', { headers });
  const page1 = await page1Res.json();
  check('Cursor API returns ready envelope', page1.dataStatus === 'ready' && page1.data?.items?.length > 0);
  check('Cursor API has totalCount matching DB', page1.data?.totalCount === expectedAll);

  if (page1.data?.hasMore && page1.data?.nextCursor) {
    const page2Res = await fetch(`http://localhost:3102/api/admin/users?limit=5&excludeAgents=false&cursor=${encodeURIComponent(page1.data.nextCursor)}`, { headers });
    const page2 = await page2Res.json();
    check('Page 2 has items', page2.data?.items?.length > 0);
    check('Page 2 items are distinct from Page 1', page1.data.items[0].id !== page2.data.items[0].id);
  }

  // ── 6. 敏感信息审计写链 (P0-06) ──────────────────────────────────────────
  console.log('\n--- 6. Sensitive Data Reveal & Audit Logs ---');
  if (snapAllLifetime.users?.[0]?.id) {
    const targetUserId = snapAllLifetime.users[0].id;
    // Reject reason < 4 chars
    const rejectRes = await fetch('http://localhost:3102/api/admin/audit/reveal', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId,
        action: 'reveal_email',
        reason: 'no', // too short
        adminEmail: 'admin@eva.local'
      })
    });
    check('Short reason is rejected (403/400)', rejectRes.status === 403 || rejectRes.status === 400);

    // Valid reveal
    const validRes = await fetch('http://localhost:3102/api/admin/audit/reveal', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId,
        action: 'reveal_email',
        reason: 'Deep Audit automated verification test',
        adminEmail: 'admin@eva.local'
      })
    });
    const validJson = await validRes.json();
    check('Valid reason reveal succeeds', validJson.data?.success === true && Boolean(validJson.data?.revealedValue));

    // Verify audit log row in DB
    const logId = validJson.data?.auditLogId;
    const auditDbRes = await db.query(`SELECT * FROM admin_access_logs WHERE id = $1::uuid`, [logId]);
    check('Audit log entry created in PostgreSQL', auditDbRes.rows.length === 1 && auditDbRes.rows[0].action === 'reveal_email', {
      auditLogId: logId,
      reason: auditDbRes.rows[0]?.reason,
    });
  }

  // ── 7. 总结 ───────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  if (failureCount === 0) {
    console.log('🎉 ALL AUDIT CHECKS PASSED (0 failures)! Phase 0 is 100% verified.');
  } else {
    console.error(`⚠️ ${failureCount} AUDIT CHECKS FAILED! Review issues above.`);
  }
  console.log('================================================================\n');

  process.exit(failureCount === 0 ? 0 : 1);
}

deepAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
