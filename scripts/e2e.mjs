#!/usr/bin/env node
/**
 * End-to-end browser test (Chromium via Playwright). Starts the local server with the PRODUCTION headers, so the
 * Content-Security-Policy is really enforced. External services (GTM, Apps Script, ad pixels) are stubbed, no network needed.
 *
 *   npm i --no-save playwright && npx playwright install chromium
 *   node scripts/e2e.mjs
 *
 * Checks: pages load with no console errors / CSP violations, every ad vendor in the CSP allow-list is really allowed (and an
 * unknown host is really blocked), traffic-source classification (Google / YouTube / Meta / Microsoft / LinkedIn / ChatGPT /
 * Perplexity / organic), the complete lead-form flow (validation, number confirmation, dataLayer events, redirect), the
 * homepage FAQ, and the mobile layout (no horizontal scroll).
 */
import { startServer } from './serve.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const PORT = 4188;
const BASE = `http://localhost:${PORT}`;
const GEN = '/Generativeai&Agenticai/online-course';

let pass = 0, fail = 0;
const check = (ok, msg, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? '  ok ' : ' FAIL'}  ${msg}${ok ? '' : '  ' + extra}`); };

const server = await startServer(PORT);
const browser = await chromium.launch();

// Every external https request is answered locally. CSP is evaluated by the browser BEFORE the request is made, so a blocked
// host never reaches this handler and shows up as a securitypolicyviolation instead.
async function newPage(opts = {}, persistDL = false) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  const page = await ctx.newPage();
  const log = { errors: [], violations: [], requests: [] };
  page.on('console', m => { if (m.type() === 'error') log.errors.push(m.text()); });
  page.on('pageerror', e => log.errors.push('pageerror: ' + e.message));
  await page.addInitScript(() => {
    window.__viol = [];
    document.addEventListener('securitypolicyviolation', e => window.__viol.push(e.violatedDirective + ' ' + e.blockedURI));
  });
  if (persistDL) {
    // dataLayer is wiped by the redirect to the thank-you page, so mirror every push into sessionStorage (survives navigation).
    await page.addInitScript(() => {
      window.dataLayer = [];
      const orig = window.dataLayer.push.bind(window.dataLayer);
      window.dataLayer.push = function (...a) {
        try {
          const s = JSON.parse(sessionStorage.getItem('__dl') || '[]');
          a.forEach(x => s.push(JSON.parse(JSON.stringify(x, (k, v) => (typeof v === 'function' ? undefined : v)))));
          sessionStorage.setItem('__dl', JSON.stringify(s));
        } catch (e) {}
        return orig(...a);
      };
    });
  }
  await page.route(/^https:\/\//, route => {
    const u = route.request().url();
    log.requests.push(u);
    if (/script\.google\.com/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' });
    if (/gtm\.js/.test(u)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: "window.google_tag_manager=window.google_tag_manager||{};window.google_tag_manager['GTM-TFGRSK64']={};" });
    return route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: '' });
  });
  return { ctx, page, log };
}
const violations = page => page.evaluate(() => window.__viol);

/* ---------- 1. every page loads cleanly ---------- */
console.log('\n1. Pages load without console errors or CSP violations');
for (const p of ['/', '/cyber-security', GEN, '/refund', '/cyber-security/thank-you', '/generative-ai/thank-you', '/this-does-not-exist']) {
  const { ctx, page, log } = await newPage();
  const res = await page.goto(BASE + p, { waitUntil: 'load' });
  await page.mouse.wheel(0, 600); // first interaction triggers the (stubbed) GTM load
  await page.waitForTimeout(500);
  const expect = p === '/this-does-not-exist' ? 404 : 200;
  check(res.status() === expect, `${p} -> ${res.status()}`);
  const errs = p === '/this-does-not-exist' ? log.errors.filter(e => !/status of 404/.test(e)) : log.errors; // the browser logs the 404 itself
  check(errs.length === 0, `${p} console errors: ${errs.length}`, errs.join(' | '));
  const v = await violations(page);
  check(v.length === 0, `${p} CSP violations: ${v.length}`, v.join(' | '));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check(!overflow, `${p} no horizontal scroll (desktop)`);
  await ctx.close();
}

/* ---------- 2. CSP: allowed vendors really load, unknown hosts are blocked ---------- */
console.log('\n2. Content-Security-Policy allow-list');
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + '/cyber-security');
  const tests = {
    script: ['https://www.googletagmanager.com/gtm.js?id=X', 'https://connect.facebook.net/en_US/fbevents.js', 'https://snap.licdn.com/li.lms-analytics/insight.min.js',
      'https://bat.bing.com/bat.js', 'https://www.clarity.ms/tag/abc', 'https://www.googleadservices.com/pagead/conversion_async.js', 'https://www.google-analytics.com/analytics.js'],
    connect: ['https://www.google-analytics.com/g/collect', 'https://region1.google-analytics.com/g/collect', 'https://stats.g.doubleclick.net/g/collect', 'https://www.facebook.com/tr/',
      'https://px.ads.linkedin.com/wa/', 'https://bat.bing.com/action/0', 'https://script.google.com/macros/s/x/exec', 'https://www.google.co.in/ads/ga-audiences'],
    img: ['https://www.facebook.com/tr?id=1&ev=PageView', 'https://px.ads.linkedin.com/collect?pid=1', 'https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1/', 'https://i.ytimg.com/vi/x/hq.jpg', 'https://www.google.com/pagead/1p-user-list/1'],
    frame: ['https://www.youtube-nocookie.com/embed/abc', 'https://td.doubleclick.net/td/ga/rul', 'https://www.googletagmanager.com/ns.html?id=X'],
  };
  const blocked = { script: ['https://evil.example/x.js'], connect: ['https://evil.example/collect'], img: ['https://evil.example/p.gif'], frame: ['https://evil.example/f'] };
  const attempt = async (kind, url) => page.evaluate(async ([kind, url]) => {
    window.__viol.length = 0;
    if (kind === 'script') { const s = document.createElement('script'); s.src = url; document.head.appendChild(s); }
    if (kind === 'img') { const i = new Image(); i.src = url; }
    if (kind === 'frame') { const f = document.createElement('iframe'); f.src = url; document.body.appendChild(f); }
    if (kind === 'connect') { try { await fetch(url, { mode: 'no-cors' }); } catch (e) {} }
    await new Promise(r => setTimeout(r, 120));
    return window.__viol.slice();
  }, [kind, url]);
  for (const [kind, urls] of Object.entries(tests)) for (const u of urls) { const v = await attempt(kind, u); check(v.length === 0, `${kind}-src allows ${new URL(u).host}`, v.join(' | ')); }
  for (const [kind, urls] of Object.entries(blocked)) for (const u of urls) { const v = await attempt(kind, u); check(v.length > 0, `${kind}-src blocks unknown host ${new URL(u).host}`); }
  await ctx.close();
}

/* ---------- 3. traffic-source classification ---------- */
console.log('\n3. Traffic source classification');
const SCENARIOS = [
  ['Google Ads', '/cyber-security?gclid=AAA&utm_source=google&utm_medium=cpc', undefined, 'google_ads'],
  ['YouTube Ads', '/cyber-security?utm_source=youtube&utm_medium=video&gclid=BBB', undefined, 'youtube_ads'],
  ['Meta Ads (fbclid)', '/cyber-security?fbclid=CCC&utm_source=facebook&utm_medium=paid_social', undefined, 'meta_ads'],
  ['Instagram Ads (utm only)', '/cyber-security?utm_source=instagram&utm_medium=paid_social', undefined, 'meta_ads'],
  ['Microsoft Ads', '/cyber-security?msclkid=DDD', undefined, 'microsoft_ads'],
  ['LinkedIn Ads', '/cyber-security?li_fat_id=EEE', undefined, 'linkedin_ads'],
  ['ChatGPT (utm_source)', '/cyber-security?utm_source=chatgpt.com', undefined, 'chatgpt'],
  ['ChatGPT paid placement', '/cyber-security?utm_source=chatgpt.com&utm_medium=paid_ai', undefined, 'chatgpt_ads'],
  ['ChatGPT (referrer)', '/cyber-security', 'https://chatgpt.com/', 'chatgpt'],
  ['Perplexity (referrer)', GEN, 'https://www.perplexity.ai/search?q=x', 'ai_assistant'],
  ['Gemini (referrer)', GEN, 'https://gemini.google.com/app', 'ai_assistant'],
  ['Claude (referrer)', GEN, 'https://claude.ai/chat/1', 'ai_assistant'],
  ['Google organic', '/', 'https://www.google.co.in/', 'organic_search'],
  ['Direct', '/', undefined, 'direct_or_other'],
];
for (const [name, path, referer, expected] of SCENARIOS) {
  const { ctx, page } = await newPage();
  await page.goto(BASE + path, { referer });
  const r = await page.evaluate(() => ({ plat: window.LP.platform, ai: window.LP.aiReferrer, ctxEvt: window.dataLayer.find(e => e && e.event === 'lp_context'), cookie: document.cookie }));
  check(r.plat === expected, `${name} -> ${r.plat}`, `expected ${expected}`);
  check(r.ctxEvt && r.ctxEvt.traffic_platform === expected, `${name}: lp_context event pushed`);
  await ctx.close();
}
{
  // click IDs are stored together and a new ad click replaces the old ones
  const { ctx, page } = await newPage();
  await page.goto(BASE + '/cyber-security?gclid=OLD&utm_source=google');
  await page.goto(BASE + '/cyber-security?fbclid=NEW&utm_source=facebook');
  const a = await page.evaluate(() => window.LP.getAttribution());
  check(a.fbclid === 'NEW' && a.gclid === '', `new click replaces old click IDs (gclid='${a.gclid}', fbclid='${a.fbclid}')`);
  await page.goto(BASE + '/cyber-security'); // reload with no params: session keeps the Meta classification
  const p = await page.evaluate(() => window.LP.platform);
  check(p === 'meta_ads', `later page view in the same session keeps first source (${p})`);
  await ctx.close();
}

/* ---------- 4. the lead form, start to finish ---------- */
console.log('\n4. Lead form flow (Cyber Security page)');
for (const [label, path, thanks] of [['Cyber Security', '/cyber-security?utm_source=facebook&fbclid=XYZ&kw=hacking', '/cyber-security/thank-you'], ['Gen AI', GEN + '?utm_source=google&gclid=G1', '/generative-ai/thank-you']]) {
  const { ctx, page, log } = await newPage({}, true);
  await page.goto(BASE + path);
  const form = page.locator('form[data-lead-form]').first();
  await form.locator('button[type=submit]').click();
  const errs = await form.locator('.field__err').allTextContents();
  check(errs.filter(Boolean).length >= 3, `${label}: empty submit shows validation errors (${errs.filter(Boolean).length})`);
  await form.locator('input[name=name]').fill('Asha Nair');
  await form.locator('input[name=phone]').fill('9847123456');
  await form.locator('input[name=email]').fill('Asha@Example.com');
  await form.locator('select[name=user_type]').selectOption({ index: 1 });
  await form.locator('button[type=submit]').click();
  const confirm = form.locator('.phone-confirm');
  check(await confirm.isVisible(), `${label}: "is this number correct?" step appears`);
  const posted = page.waitForRequest(r => /script\.google\.com/.test(r.url()) && r.method() === 'POST');
  await confirm.locator('[data-confirm-yes]').click();
  const req = await posted;
  const body = new URLSearchParams(req.postData());
  check(body.get('phone') === '+919847123456', `${label}: phone sent as +91 number`);
  check(body.get('utm_source') === (path.includes('facebook') ? 'facebook' : 'google'), `${label}: utm_source reaches the Sheet payload (${body.get('utm_source')})`);
  check(!body.has('website'), `${label}: honeypot field is not sent`);
  await page.waitForURL(u => u.pathname === thanks, { timeout: 8000 });
  check(true, `${label}: redirected to ${thanks}`);
  const lead = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__dl') || '[]').find(e => e && e.event === 'lead_form_submit'));
  check(!!lead, `${label}: lead_form_submit pushed`);
  await ctx.close();
  if (lead) {
    check(lead.transaction_id && lead.transaction_id === lead.event_id, `${label}: event_id == transaction_id (${lead.event_id}), so Meta/Google dedupe works`);
    check(/^[0-9a-f]{64}$/.test(lead.user_data?.sha256_email_address || ''), `${label}: hashed email for enhanced conversions / Meta advanced matching`);
    check(/^[0-9a-f]{64}$/.test(lead.user_data?.sha256_phone_number || ''), `${label}: hashed phone (Google format, +91...)`);
    const sha = async t => (await import('node:crypto')).createHash('sha256').update(t).digest('hex');
    check(lead.user_data?.sha256_phone_number === await sha('+919847123456'), `${label}: Google phone hash = SHA-256 of +919847123456`);
    check(lead.user_data?.sha256_phone_number_meta === await sha('919847123456'), `${label}: Meta phone hash = SHA-256 of 919847123456 (digits only)`);
    check(lead.user_data?.sha256_email_address === await sha('asha@example.com'), `${label}: email hash = SHA-256 of the lower-cased address`);
    check(!JSON.stringify(lead).includes('Asha') && !JSON.stringify(lead).includes('9847123456'), `${label}: no plain-text personal data in the dataLayer`);
    check(lead.traffic_platform === (path.includes('facebook') ? 'meta_ads' : 'google_ads'), `${label}: traffic_platform on the lead event (${lead.traffic_platform})`);
  }
}

/* ---------- 5. homepage FAQ + tracking attributes ---------- */
console.log('\n5. Homepage');
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + '/');
  const n = await page.locator('.hfaq details').count();
  check(n === 6, `homepage FAQ has ${n} questions`);
  await page.locator('.hfaq summary').first().click();
  await page.waitForFunction(() => window.dataLayer.some(e => e && e.event === 'faq_open'), null, { timeout: 3000 }).catch(() => {}); // 'toggle' fires async
  const evt = await page.evaluate(() => window.dataLayer.find(e => e && e.event === 'faq_open'));
  check(!!evt, 'opening a FAQ pushes faq_open');
  await page.locator('a[data-wa]').first().click({ trial: true });
  const gtmId = await page.evaluate(() => (window.LP_CONFIG || {}).GTM_ID);
  check(gtmId === 'GTM-TFGRSK64', 'homepage loads the same GTM container as the course pages');
  await ctx.close();
}

/* ---------- 6. mobile ---------- */
console.log('\n6. Mobile layout (Pixel 7 size)');
for (const p of ['/', '/cyber-security', GEN, '/refund', '/this-does-not-exist']) {
  const { ctx, page } = await newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(BASE + p);
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(o <= 0, `${p} no horizontal scroll on mobile (overflow ${o}px)`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
