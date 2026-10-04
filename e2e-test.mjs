// End-to-end smoke test for the anonymous assessment loop.
//
// Verifies the full closed loop in a real browser: home -> play -> answer all
// six decision nodes -> result -> whitepaper search.
//
// Usage:
//   Terminal 1:  node apps/api/dist/main.js            (port 3001)
//   Terminal 2:  npx next start -p 3100                (apps/web)
//   Terminal 3:  node e2e-test.mjs
//
// Set E2E_WEB_URL / E2E_API_URL to point at non-default hosts.

import { chromium } from 'playwright';

const WEB = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3100';
const HEADLESS = process.env.E2E_HEADED !== '1';
const EXECUTABLE = process.env.CHROME_PATH || undefined;

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
  }
}

const browser = await chromium.launch({ headless: HEADLESS, executablePath: EXECUTABLE });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

try {
  console.log('\n1. Home');
  await page.goto(WEB + '/', { waitUntil: 'networkidle' });
  check('home renders', (await page.locator('h1').count()) > 0);
  check('play CTA present', (await page.locator('a[href="/play"]').count()) > 0);

  console.log('\n2. Assessment page');
  await page.click('a[href="/play"]');
  await page.waitForURL('**/play');
  await page.waitForTimeout(600);
  check('adult gate shown', (await page.locator('button.btn-primary').count()) > 0);

  console.log('\n3. Start the run');
  await page.locator('button.btn-primary').first().click();
  await page.waitForSelector('button .choice-text', { timeout: 20000 });
  check('first node loaded', true);

  console.log('\n4. Answer all six nodes');
  for (let i = 1; i <= 6; i++) {
    const choices = page.locator('button .choice-text');
    if ((await choices.count()) === 0) break;
    await choices.nth(i % 2 === 1 ? 0 : 1).click();
    await page.waitForTimeout(400);
    // Each choice opens the consequence step; advance past it.
    const advance = page.locator('button.btn-primary');
    if ((await advance.count()) > 0) {
      await advance.first().click();
      await page.waitForTimeout(550);
    }
  }
  await page.waitForTimeout(2200);

  console.log('\n5. Result');
  const insightCount = await page.locator('.report-insight').count();
  check('result sections rendered', insightCount === 3, `${insightCount} blocks`);
  const body = await page.locator('main').first().innerText();
  check('has pattern text', body.includes('这一章里'));
  check('has disclaimer', body.includes('不是诊断'));
  check('no undefined leaked', !body.includes('undefined'));

  console.log('\n6. Whitepaper');
  await page.goto(WEB + '/whitepaper', { waitUntil: 'networkidle' });
  const search = page.locator('input');
  check('search box present', (await search.count()) > 0);
  if ((await search.count()) > 0) {
    await search.first().fill('人格');
    await page.waitForTimeout(600);
    const marks = await page.locator('mark.wp-highlight').count();
    check('search highlights', marks > 0, `${marks} marks`);
  }

  console.log('\n7. No auth surface');
  const html = await page.content();
  check('no login link', !html.includes('/login'));
  check('no page errors', pageErrors.length === 0, pageErrors.join('; '));
} catch (err) {
  failed++;
  console.error('\nEXCEPTION:', err.message);
} finally {
  await browser.close();
}

console.log(`\n${'-'.repeat(40)}\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
