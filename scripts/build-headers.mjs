#!/usr/bin/env node
/**
 * Single source of truth for the site's security headers (incl. the Content-Security-Policy).
 * Generates BOTH hosting configs so they can never drift apart:
 *   - vercel.json  -> the headers rule with source "/(.*)"
 *   - deploy/security-headers.conf -> included by every nginx location
 *
 *   node scripts/build-headers.mjs           write both files
 *   node scripts/build-headers.mjs --check   exit 1 if either file is out of date (used by scripts/audit.mjs and CI)
 *
 * To allow a new ad / analytics vendor, add its hosts to VENDORS below and run the script. Nothing else to edit.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/* Hosts each vendor needs, per CSP directive. Keep vendors you do not use out of the list: every extra host widens the policy. */
const VENDORS = {
  'Google Tag Manager + GA4': {
    script: ['https://www.googletagmanager.com', 'https://*.googletagmanager.com', 'https://tagmanager.google.com', 'https://www.google-analytics.com', 'https://*.google-analytics.com'],
    connect: ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'],
    img: ['https://*.google-analytics.com', 'https://*.googletagmanager.com', 'https://ssl.gstatic.com', 'https://www.gstatic.com'],
    frame: ['https://www.googletagmanager.com'],
    style: ['https://tagmanager.google.com'],
  },
  'Google Ads + YouTube remarketing': {
    script: ['https://www.googleadservices.com', 'https://googleads.g.doubleclick.net', 'https://*.doubleclick.net', 'https://www.google.com', 'https://pagead2.googlesyndication.com'],
    connect: ['https://*.doubleclick.net', 'https://www.google.com', 'https://www.google.co.in', 'https://www.googleadservices.com', 'https://pagead2.googlesyndication.com'],
    img: ['https://*.doubleclick.net', 'https://www.google.com', 'https://www.google.co.in', 'https://www.googleadservices.com', 'https://pagead2.googlesyndication.com'],
    frame: ['https://td.doubleclick.net', 'https://*.doubleclick.net'],
  },
  'YouTube embeds (lite facade)': {
    img: ['https://i.ytimg.com'],
    frame: ['https://www.youtube-nocookie.com', 'https://www.youtube.com'],
  },
  'Microsoft Clarity + Bing UET': {
    script: ['https://www.clarity.ms', 'https://*.clarity.ms', 'https://bat.bing.com'],
    connect: ['https://*.clarity.ms', 'https://c.bing.com', 'https://bat.bing.com'],
    img: ['https://*.clarity.ms', 'https://c.bing.com', 'https://bat.bing.com'],
  },
  'Meta (Facebook / Instagram) Pixel': {
    script: ['https://connect.facebook.net'],
    connect: ['https://www.facebook.com', 'https://connect.facebook.net'],
    img: ['https://www.facebook.com'],
  },
  'LinkedIn Insight Tag': {
    script: ['https://snap.licdn.com'],
    connect: ['https://px.ads.linkedin.com', 'https://px4.ads.linkedin.com'],
    img: ['https://px.ads.linkedin.com', 'https://px4.ads.linkedin.com'],
  },
  'Lead form (Google Apps Script)': {
    connect: ['https://script.google.com', 'https://script.googleusercontent.com'],
    form: ['https://script.google.com'],
  },
};

const uniq = a => [...new Set(a)];
const pick = key => uniq(Object.values(VENDORS).flatMap(v => v[key] || []));

const CSP = [
  ["default-src", ["'self'"]],
  ["script-src", ["'self'", "'unsafe-inline'", ...pick('script')]],   // 'unsafe-inline': inline <head> scripts + GTM custom HTML tags
  ["connect-src", ["'self'", ...pick('connect')]],
  ["img-src", ["'self'", 'data:', ...pick('img')]],
  ["frame-src", ["'self'", ...pick('frame')]],
  ["style-src", ["'self'", "'unsafe-inline'", ...pick('style')]],
  ["font-src", ["'self'"]],
  ["worker-src", ["'self'", 'blob:']],                                 // Clarity compresses its payload in a blob: worker
  ["form-action", ["'self'", ...pick('form')]],
  ["base-uri", ["'self'"]],
  ["object-src", ["'none'"]],
  ["frame-ancestors", ["'self'"]],
  ["upgrade-insecure-requests", []],
].map(([d, v]) => [d, ...v].join(' ')).join('; ');

/* Headers sent on every response. HSTS is nginx-only: Vercel already sends its own Strict-Transport-Security. */
const COMMON = [
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['X-Frame-Options', 'SAMEORIGIN'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'],
  ['Content-Security-Policy', CSP],
];
const HSTS = ['Strict-Transport-Security', 'max-age=604800'];   // 1 week. Raise to 31536000 once HTTPS is proven on every network (see docs/REACHABILITY.md).

function render() {
  const vercelPath = join(ROOT, 'vercel.json');
  const vercel = JSON.parse(readFileSync(vercelPath, 'utf8'));
  const rule = vercel.headers.find(h => h.source === '/(.*)');
  if (!rule) throw new Error('vercel.json has no headers rule with source "/(.*)"');
  rule.headers = COMMON.map(([key, value]) => ({ key, value }));
  const vercelOut = JSON.stringify(vercel, null, 2) + '\n';

  const nginxOut =
`# GENERATED by scripts/build-headers.mjs from the same source as vercel.json. Do not edit by hand:
# change VENDORS / COMMON in that script and run \`node scripts/build-headers.mjs\`.
# Included in every nginx location, because a location that sets its own add_header drops the server-level ones.
${[...COMMON, HSTS].map(([k, v]) => `add_header ${k} "${v}" always;`).join('\n')}
`;
  return { vercelPath, vercelOut, nginxPath: join(ROOT, 'deploy/security-headers.conf'), nginxOut };
}

const out = render();
const read = p => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

if (process.argv.includes('--check')) {
  const stale = [];
  if (read(out.vercelPath) !== out.vercelOut) stale.push('vercel.json');
  if (read(out.nginxPath) !== out.nginxOut) stale.push('deploy/security-headers.conf');
  if (stale.length) { console.error(`Out of date: ${stale.join(', ')}. Run: node scripts/build-headers.mjs`); process.exit(1); }
  console.log('Security headers are in sync (vercel.json = nginx).');
} else {
  writeFileSync(out.vercelPath, out.vercelOut);
  writeFileSync(out.nginxPath, out.nginxOut);
  console.log('Wrote vercel.json (headers) and deploy/security-headers.conf');
  console.log(`CSP is ${CSP.length} characters, ${Object.keys(VENDORS).length} vendor groups.`);
}
