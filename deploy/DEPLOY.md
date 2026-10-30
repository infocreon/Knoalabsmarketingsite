# Deploying lp.knoalabs.com

Static site: plain HTML/CSS/JS. **No build step, no database.** Developer tools in `scripts/` are optional and are never published.

Two supported hosts: **Vercel** (current; `vercel.json`) and **DigitalOcean + nginx** (`deploy/`). Both serve identical URLs, redirects and security headers, generated from one source (`scripts/build-headers.mjs`).

## Before every deploy (1 minute)

```bash
node scripts/audit.mjs            # links, SEO tags, schema, sitemap, versions, headers in sync -> must say 0 errors
node scripts/e2e.mjs              # optional, needs: npm i --no-save playwright && npx playwright install chromium
```

Changed a CSS/JS file in `shared/`? Bump its `?v=` number in **every** page (the audit enforces this: files there are cached for a year).
Changed the allowed ad/analytics vendors? Edit `VENDORS` in `scripts/build-headers.mjs`, run `node scripts/build-headers.mjs`.

## DigitalOcean App Platform (build error "Downloading Node ... exit status 22")
This is a **static site: there is nothing to build.** If App Platform auto-detects Node (it does whenever a `package.json` exists in the repo), the build fails. This project no longer contains a `package.json`. In the App Platform component set: **Type = Static Site**, **Build command = empty**, **Output directory = `/`** (the repo root). Redirects, headers and clean URLs from `vercel.json` / nginx do **not** apply on App Platform static sites, so for full behaviour use the droplet + nginx route below, or Vercel.

## Vercel

Push to the connected branch. `.vercelignore` keeps docs, scripts and server configs out of the public deployment. Check afterwards: `node scripts/check-site.mjs`.

## DigitalOcean (nginx)

### 1. Server (one time)
```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx git
sudo git clone https://github.com/infocreon/Knoalabsmarketingsite.git /var/www/lp.knoalabs.com
sudo cp /var/www/lp.knoalabs.com/deploy/nginx-lp.knoalabs.com.conf /etc/nginx/sites-available/lp.knoalabs.com
sudo ln -s /etc/nginx/sites-available/lp.knoalabs.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
Different folder? Change `root` and every `include` path in the config. Enable **IPv6** on the droplet (or delete the AAAA record later): see `docs/REACHABILITY.md`, cause 3.

### 2. Test BEFORE changing DNS
```bash
curl -sI -H "Host: lp.knoalabs.com" http://<droplet-ip>/cyber-security                          # 200
curl -sI -H "Host: lp.knoalabs.com" http://<droplet-ip>/cyber-security/thank-you                # 200 + X-Robots-Tag: noindex
curl -sI -H "Host: lp.knoalabs.com" http://<droplet-ip>/cyber-security.html                     # 301 -> /cyber-security
curl -sI -H "Host: lp.knoalabs.com" "http://<droplet-ip>/Generativeai&Agenticai/online-course"  # 200
curl -sI -H "Host: lp.knoalabs.com" "http://<droplet-ip>/gen-ai?gclid=x"                         # 301, query kept
curl -sI -H "Host: lp.knoalabs.com" http://<droplet-ip>/privacy                                 # 302 -> knoalabs.com/privacy-policy/
curl -sI -H "Host: lp.knoalabs.com" http://<droplet-ip>/README.md                               # 404
curl -sI -H "Host: lp.knoalabs.com" http://<droplet-ip>/deploy/DEPLOY.md                        # 404
curl -sI -H "Host: lp.knoalabs.com" http://<droplet-ip>/llms.txt                                # 200 text/plain
```
(All of these were run against nginx 1.24 with this exact config during the audit.)

### 3. Switch DNS (GoDaddy)
Replace the `lp` record: delete `CNAME lp -> cname.vercel-dns.com`, add `A lp -> <droplet-ip>` (TTL 600). Keep every other record. Wait until `nslookup lp.knoalabs.com 8.8.8.8` shows the droplet IP.

### 4. HTTPS
Either let certbot edit the config:
```bash
sudo certbot --nginx -d lp.knoalabs.com --redirect
sudo certbot renew --dry-run          # proves automatic renewal works
```
or use `deploy/nginx-lp.knoalabs.com.https.conf` (full TLS block with IPv6, HTTP/2, TLS 1.2+1.3 only, OCSP stapling). Use one, not both.

### 5. Updating later
`cd /var/www/lp.knoalabs.com && sudo git pull` (no restart). If `deploy/security-headers.conf` changed: `sudo nginx -t && sudo systemctl reload nginx`.

## Do not change
- URLs `/cyber-security`, `/cyber-security/thank-you`, `/Generativeai&Agenticai/online-course`, `/generative-ai/thank-you`: Google Ads and GTM depend on them.
- `/google9ecbfd1f9448cc0b.html` (Search Console verification) and `/2269610a3c0f91f5197f6dd813ad5a22.txt` (IndexNow key).
- `robots.txt` must keep existing: the lead form's GTM success signal submits a hidden form to it.

## Still open: stale nameservers
Hosting on DigitalOcean does not fix "site not opening on some networks". The `knoalabs.com` DNS in GoDaddy still lists 9 old nameservers (3 DigitalOcean, 6 dns-parking.com) that answer "lp.knoalabs.com does not exist". Delete those 9 NS records (keep ns35/ns36.domaincontrol.com). Full explanation, proof and the other possible causes: `docs/REACHABILITY.md`.
