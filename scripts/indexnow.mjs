#!/usr/bin/env node
/**
 * IndexNow: tells Bing (and so Microsoft Copilot, DuckDuckGo and the Bing index that ChatGPT search draws on), Yandex,
 * Seznam and Naver that pages changed, so they are re-crawled in minutes instead of days. Google does not use IndexNow:
 * for Google use Search Console > URL Inspection > Request indexing.
 *
 *   node scripts/indexnow.mjs            submit every URL in sitemap.xml
 *   node scripts/indexnow.mjs --dry-run  show what would be sent
 *
 * The key file https://lp.knoalabs.com/2269610a3c0f91f5197f6dd813ad5a22.txt (contents = the key) proves you own the site. It is public by design.
 * Run after every deploy that changes content. Needs internet access, so run it from your own computer or CI.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOST = 'lp.knoalabs.com';
const KEY = '2269610a3c0f91f5197f6dd813ad5a22';
const urls = [...readFileSync(join(ROOT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
const body = { host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls };

if (process.argv.includes('--dry-run')) { console.log(JSON.stringify(body, null, 2)); process.exit(0); }
const res = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
// 200 / 202 = accepted. 403 = key file not reachable yet (deploy first). 422 = URLs do not belong to the host.
console.log(`IndexNow responded ${res.status} ${res.statusText} for ${urls.length} URLs`);
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
