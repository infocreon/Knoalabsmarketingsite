#!/usr/bin/env node
/**
 * Static site audit. Zero dependencies. Run: `node scripts/audit.mjs` (or `node scripts/audit.mjs`).
 * Exit code 1 when any ERROR is found, so it can gate CI (see .github/workflows/audit.yml).
 *
 * Checks (per HTML page): title / description length, canonical, lang, viewport, Open Graph + Twitter tags,
 * JSON-LD validity, FAQ schema == visible FAQ text, duplicate ids, image alt/size, broken internal links /
 * assets / #anchors, ?v= cache-bust consistency, noindex on thank-you pages, mixed content.
 * Site-wide: sitemap <-> canonical match, robots.txt, llms.txt, security headers in sync, one phone number.
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ORIGIN = 'https://lp.knoalabs.com';
const SKIP_DIRS = new Set(['node_modules', '.git', 'deploy', 'docs', 'scripts', 'integrations', '.github']);
const findings = [];
const add = (level, page, msg) => findings.push({ level, page, msg });

const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
const norm = s => decode(s).replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const textOf = html => norm(html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' '));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const files = walk(ROOT);
const pages = files.filter(f => f.endsWith('.html') && !/google[0-9a-f]+\.html$/.test(f));
const pagePath = f => '/' + relative(ROOT, f).replace(/\\/g, '/');
const routeOf = f => pagePath(f).replace(/\/?index\.html$/, '').replace(/\.html$/, '') || '/';

// URL path -> existing file (mirrors cleanUrls)
function resolveUrl(pathname) {
  let p = decodeURIComponent(pathname);
  if (p === '/') p = '/index.html';
  for (const t of [p, p + '.html', p.replace(/\/$/, '') + '/index.html']) {
    const abs = join(ROOT, t);
    if (existsSync(abs) && statSync(abs).isFile()) return abs;
  }
  return null;
}

const vRefs = new Map(); // "/shared/base.css" -> Set of ?v values
const phones = new Set();

for (const file of pages) {
  const rel = pagePath(file);
  const route = routeOf(file);
  const html = readFileSync(file, 'utf8');
  const head = (html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
  const meta = (attr, name) => {
    const re = new RegExp(`<meta[^>]*${attr}=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${name}["']`, 'i');
    return decode((head.match(re) || head.match(re2) || [])[1] || '');
  };
  const isThanks = /thank-you/.test(route);
  const noindex = /noindex/i.test(meta('name', 'robots'));
  const isHome = route === '/';
  const isNotFound = rel === '/404.html';

  // ---- basics
  if (!/<html[^>]*\slang=/i.test(html)) add('ERROR', rel, 'missing <html lang>');
  if (!meta('name', 'viewport')) add('ERROR', rel, 'missing viewport meta');
  const title = decode((head.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  if (!title) add('ERROR', rel, 'missing <title>');
  else if (title.length > 70) add('WARN', rel, `title is ${title.length} chars (>70 gets truncated in Google)`);
  const desc = meta('name', 'description');
  if (!noindex) {
    if (!desc) add('ERROR', rel, 'missing meta description');
    else if (desc.length < 70 || desc.length > 170) add('WARN', rel, `meta description is ${desc.length} chars (aim 70-160)`);
  }

  // ---- indexable pages: canonical, social, schema
  if (!noindex && !isNotFound) {
    const canon = (head.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || [])[1];
    if (!canon) add('ERROR', rel, 'missing canonical link');
    else {
      const c = decode(canon);
      const expect = ORIGIN + (route === '/' ? '/' : route);
      if (c !== expect) add('ERROR', rel, `canonical ${c} != expected ${expect}`);
    }
    for (const p of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type']) if (!meta('property', p)) add('WARN', rel, `missing ${p}`);
    if (!meta('name', 'twitter:card')) add('WARN', rel, 'missing twitter:card');
    const og = meta('property', 'og:image');
    if (og) {
      const u = new URL(og);
      if (u.origin === ORIGIN && !resolveUrl(u.pathname)) add('ERROR', rel, `og:image file not found: ${u.pathname}`);
      if (u.origin !== ORIGIN) add('WARN', rel, `og:image is hosted elsewhere (${u.origin}): can disappear or expire`);
    }
    if (!/<script[^>]*application\/ld\+json/i.test(head)) add('WARN', rel, 'no JSON-LD structured data');
    if (!/<h1[\s>]/i.test(html)) add('ERROR', rel, 'no <h1>');
  } else if (isThanks && !noindex) add('ERROR', rel, 'thank-you page must be noindex');

  // ---- JSON-LD validity + FAQ parity
  const visible = textOf(html.replace(/<head[\s\S]*?<\/head>/i, ''));
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1]); } catch (e) { add('ERROR', rel, `invalid JSON-LD: ${e.message}`); continue; }
    const nodes = data['@graph'] || [data];
    for (const n of nodes) {
      if (n['@type'] === 'FAQPage') {
        for (const q of n.mainEntity || []) {
          const name = norm(q.name), ans = norm(q.acceptedAnswer?.text || '');
          if (!visible.includes(name)) add('ERROR', rel, `FAQ schema question not visible on page: "${name.slice(0, 60)}"`);
          else if (!visible.includes(ans)) add('WARN', rel, `FAQ schema answer differs from visible text: "${name.slice(0, 60)}"`);
        }
      }
    }
  }

  // ---- duplicate ids
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  for (const id of new Set(dup)) add('ERROR', rel, `duplicate id="${id}"`);

  // ---- images
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/\salt=/.test(tag)) add('ERROR', rel, `<img> without alt: ${(tag.match(/src=["']([^"']+)/) || [])[1]}`);
    if (!/\swidth=/.test(tag) || !/\sheight=/.test(tag)) add('WARN', rel, `<img> without width/height (layout shift): ${(tag.match(/src=["']([^"']+)/) || [])[1]}`);
  }

  // ---- links / assets
  const refs = [];
  const live = html.replace(/<!--[\s\S]*?-->/g, '');            // ignore commented-out markup
  for (const m of live.matchAll(/\s(?:href|src|poster)=["']([^"']+)["']/gi)) refs.push(m[1]);
  for (const m of live.matchAll(/\s(?:srcset|imagesrcset)=["']([^"']+)["']/gi)) m[1].split(',').forEach(s => refs.push(s.trim().split(/\s+/)[0]));
  for (const raw of new Set(refs)) {
    const ref = decode(raw);
    if (/^(mailto:|javascript:|data:|#$)/.test(ref)) continue;
    if (/^tel:/.test(ref)) { phones.add(ref.replace(/\D/g, '')); continue; }
    if (/^http:\/\//.test(ref) && !/w3\.org/.test(ref)) add('ERROR', rel, `insecure http:// reference: ${ref}`);
    if (/wa\.me\/(\d+)/.test(ref)) phones.add(ref.match(/wa\.me\/(\d+)/)[1]);
    if (/^https?:\/\//.test(ref) && !ref.startsWith(ORIGIN)) continue;
    if (/^https:\/\/wa\.me/.test(ref)) continue;
    // Site links are absolute-path (/x) because clean URLs have no trailing slash; anything else is relative to the file.
    const url = ref.startsWith('/') || ref.startsWith('http') ? new URL(ref, ORIGIN) : new URL(ref, ORIGIN + pagePath(file));
    const target = resolveUrl(url.pathname);
    if (!target) { add('ERROR', rel, `broken internal reference: ${ref}`); continue; }
    if (url.hash && url.hash.length > 1 && target.endsWith('.html')) {
      const tIds = target === file ? ids : [...readFileSync(target, 'utf8').matchAll(/\sid=["']([^"']+)["']/g)].map(m => m[1]);
      if (!tIds.includes(url.hash.slice(1))) add('ERROR', rel, `anchor target missing${target === file ? '' : ' on ' + url.pathname}: ${url.hash}`);
    }
    const v = url.searchParams.get('v');
    if (v !== null) {
      const k = url.pathname;
      if (!vRefs.has(k)) vRefs.set(k, new Map());
      vRefs.get(k).set(v, (vRefs.get(k).get(v) || 0) + 1);
    }
  }
  // JS-built phone numbers etc.
  for (const m of html.matchAll(/\+91[\s-]?(\d{5})[\s-]?(\d{5})/g)) phones.add('91' + m[1] + m[2]);
}

// ---- ?v= consistency (same asset must carry the same version everywhere)
for (const [asset, versions] of vRefs) {
  if (versions.size > 1) add('ERROR', asset, `inconsistent cache-bust versions: ${[...versions.keys()].map(v => '?v=' + v).join(' vs ')}`);
}

// ---- CSS url() references
for (const f of files.filter(f => f.endsWith('.css'))) {
  const css = readFileSync(f, 'utf8');
  for (const m of css.matchAll(/url\((?!["']?data:)["']?([^"')]+)["']?\)/g)) {
    const u = m[1];
    if (/^https?:/.test(u)) { add('WARN', pagePath(f), `CSS pulls external resource: ${u}`); continue; }
    const target = u.startsWith('/') ? join(ROOT, u.split('?')[0]) : join(f, '..', u.split('?')[0]);
    if (!existsSync(target)) add('ERROR', pagePath(f), `CSS url() not found: ${u}`);
  }
}

// ---- sitemap <-> pages
const sm = existsSync(join(ROOT, 'sitemap.xml')) ? readFileSync(join(ROOT, 'sitemap.xml'), 'utf8') : '';
if (!sm) add('ERROR', '/sitemap.xml', 'missing');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => decode(m[1]));
for (const loc of locs) {
  const u = new URL(loc);
  if (u.origin !== ORIGIN) add('ERROR', '/sitemap.xml', `foreign origin: ${loc}`);
  if (!resolveUrl(u.pathname)) add('ERROR', '/sitemap.xml', `URL does not exist: ${loc}`);
}
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const noindex = /<meta[^>]*name=["']robots["'][^>]*noindex/i.test(html);
  const route = routeOf(file);
  if (!noindex && pagePath(file) !== '/404.html') {
    const expected = ORIGIN + (route === '/' ? '/' : route);
    if (!locs.includes(expected)) add('WARN', '/sitemap.xml', `indexable page missing from sitemap: ${expected}`);
  } else if (locs.includes(ORIGIN + route)) add('ERROR', '/sitemap.xml', `noindex page listed in sitemap: ${route}`);
}

// ---- robots / llms / well-known
const robots = existsSync(join(ROOT, 'robots.txt')) ? readFileSync(join(ROOT, 'robots.txt'), 'utf8') : '';
if (!/Sitemap:\s*https:\/\/lp\.knoalabs\.com\/sitemap\.xml/i.test(robots)) add('ERROR', '/robots.txt', 'missing Sitemap line');
if (/^Disallow:\s*\/\s*$/m.test(robots)) add('ERROR', '/robots.txt', 'Disallow: / blocks the entire site');
for (const f of ['llms.txt', 'llms-full.txt', '.well-known/security.txt', 'site.webmanifest', '404.html']) {
  if (!existsSync(join(ROOT, f))) add('WARN', '/' + f, 'missing');
}
if (existsSync(join(ROOT, '.well-known/security.txt'))) {
  const exp = (readFileSync(join(ROOT, '.well-known/security.txt'), 'utf8').match(/^Expires:\s*(.+)$/m) || [])[1];
  if (!exp || new Date(exp) < new Date()) add('ERROR', '/.well-known/security.txt', 'Expires missing or in the past');
  else if (new Date(exp) - new Date() < 60 * 864e5) add('WARN', '/.well-known/security.txt', `expires soon (${exp})`);
}

// ---- one phone number everywhere
if (phones.size > 1) add('WARN', 'site', `multiple phone numbers found: ${[...phones].join(', ')}`);

// ---- header sync
try {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/build-headers.mjs'), '--check'], { encoding: 'utf8' });
  if (r.status !== 0) add('ERROR', 'vercel.json / deploy/security-headers.conf', (r.stdout + r.stderr).trim() || 'headers out of sync');
} catch { /* script not present in an older checkout */ }

// ---- report
const order = { ERROR: 0, WARN: 1 };
findings.sort((a, b) => order[a.level] - order[b.level] || a.page.localeCompare(b.page));
const errors = findings.filter(f => f.level === 'ERROR').length;
const warns = findings.filter(f => f.level === 'WARN').length;
for (const f of findings) console.log(`${f.level.padEnd(5)}  ${f.page}  ${f.msg}`);
console.log(`\n${pages.length} pages, ${locs.length} sitemap URLs checked: ${errors} error(s), ${warns} warning(s).`);
process.exit(errors ? 1 : 0);
