#!/usr/bin/env node
/**
 * "Why can't some people open the site?" diagnostic. Zero dependencies, Node 18+, works on Windows / macOS / Linux.
 *
 *   node scripts/check-site.mjs                      checks https://lp.knoalabs.com
 *   node scripts/check-site.mjs --host lp.knoalabs.com --zone knoalabs.com
 *   node scripts/check-site.mjs --origin http://localhost:4173     content checks only (no DNS / TLS), for local testing
 *   node scripts/check-site.mjs --json                machine-readable output
 *
 * RUN IT FROM THE NETWORK THAT HAS THE PROBLEM (the user's mobile data, home broadband, college Wi-Fi). Results from your
 * office tell you nothing about a Jio / BSNL / Airtel customer. Compare two networks to see what differs.
 *
 * What it checks
 *   1. DNS    every nameserver the zone lists is asked directly. A stale nameserver that answers "does not exist" makes the
 *             site fail at random for some people (a resolver picks one of the listed servers). Also asks 4 public resolvers.
 *   2. IPv4 / IPv6  AAAA record published but nothing listening on IPv6 = "can't be reached" on IPv6-first mobile networks.
 *   3. TCP    ports 80 and 443 reachable on every address.
 *   4. TLS    certificate valid, not expiring, covers the host, full chain sent (a missing intermediate breaks old Android).
 *   5. HTTP   http -> https redirect, HSTS, security headers, compression, key pages, robots/sitemap/llms, 404 behaviour.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i > -1 ? args[i + 1] : dflt; };
const HOST = opt('host', 'lp.knoalabs.com');
const ZONE = opt('zone', HOST.split('.').slice(-2).join('.'));
const ORIGIN = opt('origin', `https://${HOST}`);
const LOCAL = !/^https:\/\//.test(ORIGIN) || /localhost|127\.0\.0\.1/.test(ORIGIN);
const JSON_OUT = args.includes('--json');
const PATHS = ['/', '/cyber-security', '/Generativeai&Agenticai/online-course', '/refund'];
const PUBLIC_RESOLVERS = { 'Google 8.8.8.8': '8.8.8.8', 'Cloudflare 1.1.1.1': '1.1.1.1', 'Quad9 9.9.9.9': '9.9.9.9', 'OpenDNS 208.67.222.222': '208.67.222.222' };

const results = [];
const log = (level, area, msg) => {
  results.push({ level, area, msg });
  if (!JSON_OUT) console.log(`${{ PASS: '  ok ', WARN: ' WARN', FAIL: ' FAIL', INFO: ' info' }[level]}  [${area}] ${msg}`);
};
const section = t => { if (!JSON_OUT) console.log(`\n== ${t}`); };
const errCode = e => e?.code || e?.cause?.code || e?.name || String(e);

async function resolverAt(ip) { const r = new dns.Resolver({ timeout: 4000, tries: 1 }); r.setServers([ip]); return r; }
async function lookup(resolver, name, type) {
  try { return { ok: true, data: await resolver['resolve' + type](name) }; }
  catch (e) { return { ok: false, code: errCode(e) }; }
}

/* ---------------------------------------------------------------- 1. DNS */
async function checkDns() {
  section(`DNS for ${HOST}`);
  // Control: if a well-known name does not resolve either, the problem is this machine / network, not the site.
  try { await dns.lookup('www.google.com'); }
  catch (e) { log('FAIL', 'dns', `control lookup of www.google.com failed (${errCode(e)}): this machine has no working internet / DNS, so no result below says anything about ${HOST}.`); process.exitCode = 1; return { v4: [], v6: [], offline: true }; }
  const sys = new dns.Resolver({ timeout: 4000, tries: 1 });
  const ns = await lookup(sys, ZONE, 'Ns');
  if (!ns.ok) { log('FAIL', 'dns', `cannot read the nameservers of ${ZONE} (${ns.code}). Is the domain registered / delegated?`); return { v4: [], v6: [] }; }
  log('INFO', 'dns', `${ZONE} lists ${ns.data.length} nameserver(s): ${ns.data.join(', ')}`);

  // Ask each listed nameserver directly. All of them must know the host.
  let stale = 0;
  const answers = new Map();
  await Promise.all(ns.data.map(async nsName => {
    const ip = (await lookup(sys, nsName, '4')).data?.[0];
    if (!ip) { stale++; log('FAIL', 'dns', `nameserver ${nsName} does not resolve to an IP at all (dead entry in the delegation)`); return; }
    const r = await resolverAt(ip);
    const a = await lookup(r, HOST, '4');
    const cname = a.ok ? null : await lookup(r, HOST, 'Cname');
    if (a.ok || cname?.ok) { answers.set(nsName, (a.data || cname.data).slice().sort().join(',')); log('PASS', 'dns', `${nsName} (${ip}) answers: ${(a.data || cname.data).join(', ')}`); }
    else { stale++; log('FAIL', 'dns', `${nsName} (${ip}) says the host does not exist (${a.code}). People whose resolver picks this server get "site can't be reached".`); }
  }));
  if (stale) log('FAIL', 'dns', `${stale} of ${ns.data.length} nameservers fail. Delete the stale NS records at the registrar (see docs/REACHABILITY.md, step 1).`);
  else log('PASS', 'dns', `all ${ns.data.length} nameservers answer`);
  if (new Set(answers.values()).size > 1) log('WARN', 'dns', 'nameservers return different addresses for the same host: ' + JSON.stringify([...answers]));

  // Public resolvers, A and AAAA
  const v4 = new Set(), v6 = new Set();
  for (const [label, ip] of Object.entries(PUBLIC_RESOLVERS)) {
    const r = await resolverAt(ip);
    const [a, aaaa] = await Promise.all([lookup(r, HOST, '4'), lookup(r, HOST, '6')]);
    if (a.ok) { a.data.forEach(x => v4.add(x)); log('PASS', 'dns', `${label}: A ${a.data.join(', ')}`); }
    else log('FAIL', 'dns', `${label} cannot resolve ${HOST} (${a.code})`);
    if (aaaa.ok) aaaa.data.forEach(x => v6.add(x));
  }
  // The resolver of the network this script runs on (what the visitor on THIS network gets)
  try { const s = await dns.lookup(HOST, { all: true }); log('INFO', 'dns', `this network's resolver returns: ${s.map(x => x.address).join(', ')}`); }
  catch (e) { log('FAIL', 'dns', `this network's own resolver cannot resolve ${HOST} (${errCode(e)}). This is the "page can't be reached" case.`); }

  const caa = await lookup(sys, ZONE, 'Caa');
  if (caa.ok) log('INFO', 'dns', `CAA records: ${caa.data.map(c => c.issue || c.issuewild || '').join(', ')} (certificate authority must be allowed here)`);
  return { v4: [...v4], v6: [...v6] };
}

/* ------------------------------------------------------------- 2/3 TCP */
function tcp(host, port, family) {
  return new Promise(res => {
    const t0 = Date.now();
    const s = net.connect({ host, port, family, timeout: 6000 }, () => { s.destroy(); res({ ok: true, ms: Date.now() - t0 }); });
    s.on('error', e => res({ ok: false, code: errCode(e) }));
    s.on('timeout', () => { s.destroy(); res({ ok: false, code: 'TIMEOUT' }); });
  });
}
async function checkTcp({ v4, v6 }) {
  section('IPv4 / IPv6 and ports');
  if (!v4.length) log('FAIL', 'net', 'no IPv4 address to test');
  for (const ip of v4) for (const port of [80, 443]) {
    const r = await tcp(ip, port, 4);
    log(r.ok ? 'PASS' : 'FAIL', 'net', `IPv4 ${ip}:${port} ${r.ok ? `connected in ${r.ms} ms` : 'failed: ' + r.code}`);
  }
  if (!v6.length) log('INFO', 'net', 'no AAAA (IPv6) record published. That is fine, and safer than a broken one.');
  for (const ip of v6) for (const port of [80, 443]) {
    const r = await tcp(ip, port, 6);
    if (r.ok) log('PASS', 'net', `IPv6 [${ip}]:${port} connected in ${r.ms} ms`);
    else if (['ENETUNREACH', 'EHOSTUNREACH', 'EADDRNOTAVAIL'].includes(r.code)) log('INFO', 'net', `IPv6 [${ip}]:${port} not testable from this machine (no IPv6 here: ${r.code})`);
    else log('FAIL', 'net', `IPv6 [${ip}]:${port} failed (${r.code}). The AAAA record points at a server that is not listening: delete the AAAA record or enable IPv6 on the server.`);
  }
}

/* ----------------------------------------------------------------- 4 TLS */
function tlsProbe(host, ip, versionOpts = {}) {
  return new Promise(res => {
    const s = tls.connect({ host: ip, port: 443, servername: host, ALPNProtocols: ['h2', 'http/1.1'], rejectUnauthorized: false, timeout: 8000, ...versionOpts }, () => {
      const cert = s.getPeerCertificate(true);
      res({ ok: true, authorized: s.authorized, authError: s.authorizationError, protocol: s.getProtocol(), alpn: s.alpnProtocol, cert, identityErr: tls.checkServerIdentity(host, cert) });
      s.end();
    });
    s.on('error', e => res({ ok: false, code: errCode(e) }));
    s.on('timeout', () => { s.destroy(); res({ ok: false, code: 'TIMEOUT' }); });
  });
}
async function checkTls({ v4 }) {
  section('HTTPS certificate');
  const ip = v4[0];
  if (!ip) return;
  const r = await tlsProbe(HOST, ip);
  if (!r.ok) { log('FAIL', 'tls', `TLS handshake failed (${r.code})`); return; }
  const days = Math.floor((new Date(r.cert.valid_to) - Date.now()) / 864e5);
  log(days < 0 ? 'FAIL' : days < 14 ? 'WARN' : 'PASS', 'tls', `certificate for ${r.cert.subject?.CN}, issued by ${r.cert.issuer?.O || r.cert.issuer?.CN}, expires ${r.cert.valid_to} (${days} days)`);
  log(r.identityErr ? 'FAIL' : 'PASS', 'tls', r.identityErr ? `certificate does not cover ${HOST}: ${r.identityErr.message}` : `certificate covers ${HOST}`);
  log(r.authorized ? 'PASS' : 'FAIL', 'tls', r.authorized ? 'chain is complete and trusted' : `chain NOT trusted (${r.authError}). If it says "unable to get local issuer certificate" the server is not sending the intermediate: use fullchain.pem.`);
  log(r.protocol === 'TLSv1.3' || r.protocol === 'TLSv1.2' ? 'PASS' : 'WARN', 'tls', `negotiated ${r.protocol}, ALPN ${r.alpn || 'none'}`);
  const old = await tlsProbe(HOST, ip, { maxVersion: 'TLSv1.1', minVersion: 'TLSv1' });
  log(old.ok ? 'WARN' : 'PASS', 'tls', old.ok ? 'server still accepts TLS 1.0/1.1 (disable: ssl_protocols TLSv1.2 TLSv1.3;)' : 'TLS 1.0/1.1 refused');
}

/* ------------------------------------------------------------- 5 HTTP */
async function get(url, init = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'accept-encoding': 'gzip, br', 'user-agent': 'knoalabs-check-site/1.0' }, ...init });
    return { ok: true, status: r.status, headers: r.headers, ms: Date.now() - t0, text: init.method === 'HEAD' ? '' : await r.text() };
  } catch (e) { return { ok: false, code: errCode(e), ms: Date.now() - t0 }; }
}
async function checkHttp() {
  section(`HTTP(S) ${ORIGIN}`);
  if (!LOCAL) {
    const r = await get(`http://${HOST}/cyber-security?gclid=test`);
    if (!r.ok) log('FAIL', 'http', `http://${HOST} failed (${r.code}). Port 80 must answer so the redirect to HTTPS can happen.`);
    else if ([301, 308].includes(r.status) && /^https:\/\//.test(r.headers.get('location') || '') && /cyber-security\?gclid=test/.test(r.headers.get('location')))
      log('PASS', 'http', `http -> https redirect keeps path and ?gclid (${r.status})`);
    else log('FAIL', 'http', `http://${HOST} returned ${r.status} ${r.headers?.get('location') || ''}, expected a 301/308 to https with the query string kept`);
  }
  for (const p of PATHS) {
    const r = await get(ORIGIN + p);
    if (!r.ok) { log('FAIL', 'http', `${p} failed (${r.code})`); continue; }
    log(r.status === 200 ? 'PASS' : 'FAIL', 'http', `${p} -> ${r.status} in ${r.ms} ms${r.headers.get('content-encoding') ? ' (' + r.headers.get('content-encoding') + ')' : ' (not compressed)'}`);
    if (r.status === 200 && p === '/') {
      const h = n => r.headers.get(n);
      if (!LOCAL) log(h('strict-transport-security') ? 'PASS' : 'WARN', 'headers', h('strict-transport-security') ? `HSTS: ${h('strict-transport-security')}` : 'no Strict-Transport-Security header');
      for (const n of ['content-security-policy', 'x-content-type-options', 'referrer-policy', 'permissions-policy'])
        log(h(n) ? 'PASS' : 'WARN', 'headers', h(n) ? `${n} present` : `${n} MISSING`);
      for (const [n, re] of [['canonical', /<link rel="canonical"/], ['JSON-LD', /application\/ld\+json/], ['og:image', /og:image"/]])
        log(re.test(r.text) ? 'PASS' : 'WARN', 'seo', `homepage has ${n}: ${re.test(r.text)}`);
    }
  }
  for (const p of ['/cyber-security/thank-you', '/generative-ai/thank-you']) {
    const r = await get(ORIGIN + p, { method: 'GET' });
    if (!r.ok) { log('FAIL', 'http', `${p} failed (${r.code})`); continue; }
    const noindex = /noindex/i.test(r.headers.get('x-robots-tag') || '') || /noindex/i.test(r.text);
    log(r.status === 200 && noindex ? 'PASS' : 'FAIL', 'http', `${p} -> ${r.status}, noindex: ${noindex} (Google Ads conversion URL must stay 200 + noindex)`);
  }
  const nf = await get(ORIGIN + '/this-page-should-not-exist-' + Date.now());
  log(nf.ok && nf.status === 404 ? 'PASS' : 'FAIL', 'http', `unknown URL -> ${nf.status ?? nf.code} (must be a real 404, not a 200 "soft 404")`);
  const hidden = await get(ORIGIN + '/deploy/DEPLOY.md');
  log(hidden.ok && hidden.status === 404 ? 'PASS' : 'FAIL', 'http', `internal file /deploy/DEPLOY.md -> ${hidden.status ?? hidden.code} (must be 404)`);

  section('Crawler and AI discovery files');
  const robots = await get(ORIGIN + '/robots.txt');
  if (robots.ok && robots.status === 200) {
    log(/^Disallow:\s*\/\s*$/m.test(robots.text) ? 'FAIL' : 'PASS', 'robots', /^Disallow:\s*\/\s*$/m.test(robots.text) ? 'robots.txt blocks the whole site' : 'robots.txt does not block the site');
    log(/Sitemap:/i.test(robots.text) ? 'PASS' : 'WARN', 'robots', 'Sitemap line ' + (/Sitemap:/i.test(robots.text) ? 'present' : 'missing'));
    for (const bot of ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'AdsBot-Google', 'facebookexternalhit'])
      log(new RegExp('User-agent:\\s*' + bot, 'i').test(robots.text) ? 'PASS' : 'WARN', 'robots', `${bot} has an explicit rule`);
  } else log('FAIL', 'robots', `robots.txt -> ${robots.status ?? robots.code}`);
  for (const p of ['/sitemap.xml', '/llms.txt', '/llms-full.txt', '/.well-known/security.txt', '/site.webmanifest', '/favicon.ico']) {
    const r = await get(ORIGIN + p);
    log(r.ok && r.status === 200 ? 'PASS' : 'FAIL', 'files', `${p} -> ${r.status ?? r.code}${r.ok ? ' ' + (r.headers.get('content-type') || '') : ''}`);
  }
  const sm = await get(ORIGIN + '/sitemap.xml');
  if (sm.ok && sm.status === 200) {
    for (const loc of [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'))) {
      const u = LOCAL ? ORIGIN + new URL(loc).pathname + new URL(loc).search : loc;
      const r = await get(u);
      log(r.ok && r.status === 200 ? 'PASS' : 'FAIL', 'sitemap', `${loc} -> ${r.status ?? r.code}`);
    }
  }
}

/* ------------------------------------------------------------------ run */
const ips = LOCAL ? { v4: [], v6: [] } : await checkDns();
if (ips.offline) { if (!JSON_OUT) console.log('\nStopped: fix this machine\'s internet connection and run again.'); process.exit(1); }
if (!LOCAL) { await checkTcp(ips); await checkTls(ips); }
await checkHttp();

const count = l => results.filter(r => r.level === l).length;
if (JSON_OUT) console.log(JSON.stringify({ host: HOST, origin: ORIGIN, results }, null, 2));
else console.log(`\nSummary: ${count('PASS')} ok, ${count('WARN')} warnings, ${count('FAIL')} failures.` +
  (count('FAIL') ? '\nFix the FAIL lines first, top to bottom. DNS problems explain "works for me, not for them".' : ''));
process.exit(count('FAIL') ? 1 : 0);
