#!/usr/bin/env node
/**
 * Local static server that behaves like production (vercel.json): clean URLs, redirects,
 * response headers (CSP etc.), the 404 page. Zero dependencies.
 *
 *   node scripts/serve.mjs            -> http://localhost:4173
 *   PORT=8080 node scripts/serve.mjs
 *
 * Use it to test the Content-Security-Policy before deploying: open the browser console and look
 * for "Refused to load ..." messages.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
const PORT = Number(process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json',
};

// vercel.json "source" pattern -> RegExp. Supports :name segments and (...) groups, which is all this site uses.
function patternToRegExp(src) {
  const re = src.split(/(\([^)]*\))/).map((part, i) =>
    i % 2 ? part : part.replace(/[.+?^${}|[\]\\]/g, '\\$&').replace(/:\w+/g, '[^/]+')).join('');
  return new RegExp('^' + re + '/?$');
}
const redirects = (CONFIG.redirects || []).map(r => ({ ...r, re: patternToRegExp(r.source) }));
const headerRules = (CONFIG.headers || []).map(h => ({ ...h, re: patternToRegExp(h.source) }));

function fileFor(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const abs = join(ROOT, clean);
  if (!abs.startsWith(ROOT)) return null;
  const tries = [abs, abs + '.html', join(abs, 'index.html')];
  for (const t of tries) { if (existsSync(t) && statSync(t).isFile()) return t; }
  return null;
}

const HIDDEN = /(^\/(deploy|docs|scripts|integrations|node_modules|\.github)\/|\.md$|^\/package(-lock)?\.json$|^\/vercel\.json$)/;

export function startServer(port = PORT) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p = url.pathname;
    const send = (status, headers = {}, body = '') => { res.writeHead(status, headers); res.end(body); };
    const applyHeaders = () => {
      for (const rule of headerRules) if (rule.re.test(p)) for (const h of rule.headers) res.setHeader(h.key, h.value);
    };

    for (const r of redirects) {
      if (r.re.test(p)) return send(r.statusCode || (r.permanent ? 308 : 307), { Location: r.destination });
    }
    // cleanUrls + trailingSlash:false
    if (/\/index\.html$/.test(p)) return send(308, { Location: (p.replace(/\/?index\.html$/, '') || '/') + url.search });
    if (/\.html$/.test(p) && p !== '/google9ecbfd1f9448cc0b.html') return send(308, { Location: p.replace(/\.html$/, '') + url.search });
    if (p.length > 1 && p.endsWith('/')) return send(308, { Location: p.slice(0, -1) + url.search });

    const f = HIDDEN.test(p) ? null : fileFor(p);
    applyHeaders();
    if (!f) {
      const nf = join(ROOT, '404.html');
      res.setHeader('Content-Type', MIME['.html']);
      res.writeHead(404);
      return res.end(existsSync(nf) ? readFileSync(nf) : 'Not found');
    }
    res.setHeader('Content-Type', MIME[extname(f)] || 'application/octet-stream');
    res.writeHead(200);
    createReadStream(f).pipe(res);
  });
  return new Promise(ok => server.listen(port, () => ok(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().then(() => console.log(`Serving ${ROOT}\n  http://localhost:${PORT}/`));
}
