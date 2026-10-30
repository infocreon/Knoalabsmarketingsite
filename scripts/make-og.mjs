#!/usr/bin/env node
/**
 * Renders the 1200x630 social-share images (Open Graph / Twitter / WhatsApp / LinkedIn previews).
 * Needs Playwright + Chromium:  npm i --no-save playwright && npx playwright install chromium
 *   node scripts/make-og.mjs
 * Output goes to shared/og/. File names carry a version (-v1): /shared/ is cached for a year, so when you change
 * a design, bump the name here AND in the <meta property="og:image"> tags, otherwise social networks keep the old picture.
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const CARDS = [
  { file: 'og-home-v1.jpg', pill: 'LIVE ONLINE COURSES', title: 'Live Online Courses That Get You Job-Ready',
    sub: 'Cyber Security &amp; Ethical Hacking · Generative AI &amp; Agentic AI' },
  { file: 'og-gen-ai-v1.jpg', pill: 'LIVE ONLINE COURSE', title: 'Learn Gen AI &amp; Agentic AI Live Online',
    sub: 'Python to RAG &amp; AI agents · 19 modules · Real capstone project' },
];
const url = p => pathToFileURL(join(ROOT, p)).href;
const html = c => `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Inter;font-weight:400;src:url(${url('shared/fonts/inter-latin-400.woff2')})}
@font-face{font-family:Inter;font-weight:700;src:url(${url('shared/fonts/inter-latin-700.woff2')})}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;font-family:Inter,sans-serif;color:#fff;overflow:hidden;
 background:radial-gradient(70% 90% at 100% 0%,rgba(16,185,129,.28),transparent 65%),#0A3B2A;padding:60px;display:flex;flex-direction:column}
.pill{display:inline-flex;align-items:center;gap:12px;align-self:flex-start;padding:12px 26px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(217,249,157,.35);font-weight:700;font-size:26px;letter-spacing:.02em}
.dot{width:16px;height:16px;border-radius:50%;background:#ff5252}
h1{margin-top:44px;font-size:76px;line-height:1.08;letter-spacing:-.025em;font-weight:700;max-width:1000px}
.sub{margin-top:28px;font-size:34px;color:#D9F99D;font-weight:400;line-height:1.35;max-width:1040px}
.foot{margin-top:auto;display:flex;align-items:center;justify-content:space-between}
.foot img{width:193px;height:50px;object-fit:contain}
.foot span{font-size:26px;color:#BFD6C7}
</style><body><div class="pill"><i class="dot"></i>${c.pill}</div><h1>${c.title}</h1><p class="sub">${c.sub}</p>
<div class="foot"><img src="${url('shared/icons/logo-white.webp')}" alt=""><span>lp.knoalabs.com</span></div></body>`;

mkdirSync(join(ROOT, 'shared/og'), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const tmp = join(tmpdir(), 'og-card.html');
for (const c of CARDS) {
  writeFileSync(tmp, html(c));
  await page.goto(pathToFileURL(tmp).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(ROOT, 'shared/og', c.file), type: 'jpeg', quality: 86 });
  console.log('wrote shared/og/' + c.file);
}
rmSync(tmp, { force: true });
await browser.close();
