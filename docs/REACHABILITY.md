# "This site can't be reached": runbook

Symptom: `lp.knoalabs.com` opens for some people and shows **"This site can't be reached"** (or `DNS_PROBE_FINISHED_NXDOMAIN`, `ERR_CONNECTION_TIMED_OUT`, `ERR_SSL_PROTOCOL_ERROR`) for others, usually depending on their internet provider.

That pattern ("works here, not there") is almost never a bug in the page code. The HTML, CSS and JS in this project load fine; the problem is on the path **between the visitor and the server**. This file lists the possible causes, most likely first, and how to prove or rule out each one.

> **What I could and could not check.** I audited the code and server configs and tested them locally (real nginx 1.24, real Chromium). I could **not** query your live DNS, certificate or hosting from my environment (the network there blocks it). So the causes below are ranked from the evidence in your own `deploy/DEPLOY.md` plus public reports, and **`scripts/check-site.mjs` is the tool that proves which one is true from the affected network.**

---

## Step 0. Prove it (10 minutes)

On a computer or phone that **has the problem** (the visitor's mobile data, home broadband, college Wi-Fi), run:

```bash
node scripts/check-site.mjs            # needs Node 18+: https://nodejs.org
```

Run it again from a network that works. The lines that differ are your answer. It tests, in order: every nameserver, four public DNS resolvers, IPv4 and IPv6, ports 80/443, the TLS certificate and chain, the http-to-https redirect, security headers, all pages, robots/sitemap/llms files, and the 404 behaviour. `FAIL` lines come with the fix.

No Node? On any network, open `https://dnschecker.org/#A/lp.knoalabs.com`: red crosses in a region mean DNS answers differ by location, which is cause 1.

---

## Cause 1. Stale nameserver records (most likely) — **you must fix this in GoDaddy**

Your own notes (`deploy/DEPLOY.md`) record that the `knoalabs.com` DNS zone still lists **9 old nameservers** (3 DigitalOcean, 6 `dns-parking.com`) that answer *"lp.knoalabs.com does not exist"*. Only `ns35` / `ns36.domaincontrol.com` (GoDaddy) are correct.

Why this causes "only some people":

1. A visitor's internet provider asks *one of the listed nameservers*, chosen more or less at random.
2. If it picks a correct one, the site works. If it picks a stale one, it gets "does not exist" and **caches that answer** (for minutes to hours) for every customer of that provider.
3. So: intermittent, provider-specific, and "fixes itself, then breaks again". Exactly the symptom reported. DNS people call these *lame delegations*; they are a well-known cause of random failures ([APNIC: the prevalence, persistence, and perils of lame delegations](https://blog.apnic.net/2021/03/16/the-prevalence-persistence-perils-of-lame-nameservers/)).

Moving hosting (Vercel to DigitalOcean) does **not** fix this, because DNS is resolved before the server is ever contacted. The note in `DEPLOY.md` is right.

**Fix**

1. GoDaddy > My Products > `knoalabs.com` > **DNS** > Records. Delete the extra **NS** records so only the GoDaddy pair remains (steps are in `Knoalabs-DNS-Fix-for-Developer-v2.pdf`, which was not in the zip I received).
2. GoDaddy > **Nameservers** (domain settings): confirm only GoDaddy's two nameservers are set.
3. Wait. Nameserver changes can take up to 48 hours to disappear everywhere.
4. Re-run `node scripts/check-site.mjs`. The `[dns]` section must show **every nameserver answering** and no FAIL.

---

## Cause 2. Hosting-network reachability on Indian mobile networks (possible, unproven)

The Vercel community has repeated reports of custom domains that time out or fail on **Jio** and **Vodafone** (India) while the same project's `*.vercel.app` address works: [Dec 2024 thread](https://community.vercel.com/t/website-not-accessible-on-jio-and-vodafone-mobile-networks/3683), [Jio thread](https://community.vercel.com/t/custom-domain-fails-on-jio-india-vercel-app-host-works/49668), [Oct 2026 roundup of about a dozen similar threads](https://community.vercel.com/t/custom-domain-times-out-while-vercel-app-works-the-ip-is-not-the-difference/50939). **The cause is not confirmed**: theories are filtering of the hostname (TLS server name) on the provider's network, or specific IP addresses. One user fixed it by changing the A record to a different Vercel IP; that is a single observation, not a tested fix.

India's providers are also documented to block sites at the DNS and TLS level ([OONI: Investigating TLS blocking in India](https://ooni.org/post/2020-tls-blocking-india/)), so check [OONI Explorer](https://explorer.ooni.org) for `lp.knoalabs.com` if a specific provider keeps failing.

**What to do (in this order, only after Cause 1 is fixed)**

1. Test on a Jio SIM and a Vodafone-Idea SIM for 48 hours with `check-site.mjs`.
2. If the **TCP** or **TLS** line fails on an address: that network is dropping traffic to that IP or hostname.
3. Options, cheapest first: (a) Put the domain behind **Cloudflare** (free plan, orange-cloud proxy): visitors then connect to Cloudflare's addresses, which most providers do not block. (b) Move to the DigitalOcean droplet already prepared in `deploy/`: a different address range. (c) Ask the provider; give them the `check-site` output.

None of these is guaranteed. The honest position: fix DNS first, measure, then decide.

---

## Cause 3. IPv6 (AAAA) record with nothing listening

Many mobile networks in India (Jio, Airtel 5G) are IPv6-first. If DNS has an **AAAA** record but the server does not listen on IPv6, those visitors see "can't be reached" while IPv4 users are fine.

- `check-site.mjs` prints the AAAA record(s) and tries to connect.
- Vercel handles IPv6 itself. On DigitalOcean you must **enable IPv6 on the droplet** *and* keep `listen [::]:80;` / `listen [::]:443 ssl;` in nginx (both provided in `deploy/`). If you do not want IPv6, **delete the AAAA record**.

## Cause 4. Certificate problems (padlock, expiry, chain)

- Expired certificate: browsers refuse with a full-page warning. Let's Encrypt certificates last 90 days and certbot renews them automatically about a month before expiry; renewal needs port 80 open and `/.well-known/acme-challenge/` reachable (the nginx configs allow it). Test: `sudo certbot renew --dry-run`.
- Missing intermediate certificate: works on laptops, fails on older Android phones. Always use `fullchain.pem`, never `cert.pem` (the HTTPS config in `deploy/` does).
- Wrong hostname on the certificate (e.g. only `knoalabs.com`): `check-site` flags it.
- A **CAA** DNS record that does not allow your certificate authority blocks issuance.

## Cause 5. HSTS lock-in (a risk to avoid, not a cause today)

HSTS tells browsers "only ever use HTTPS for this site" for a set time. If the certificate later breaks, those browsers **cannot** click through, which turns a certificate slip into a total outage. The nginx header is therefore set to **1 week** (`max-age=604800`). Raise it in `scripts/build-headers.mjs` (`HSTS`) only after HTTPS has been trouble-free on all networks:

| After | max-age | value |
|---|---|---|
| deploy | 1 week | 604800 (current) |
| 2 clean weeks | 1 month | 2592000 |
| 2 more clean weeks | 1 year | 31536000 |

Do not add `includeSubDomains` or `preload` unless **every** `*.knoalabs.com` host is HTTPS-only. Vercel sends its own HSTS header; nothing to do there.

## Cause 6. Web-filter category ("Hacking") on school, college and office networks

Content filters (FortiGuard, Cisco Umbrella/OpenDNS, Palo Alto, school networks) assign sites to categories and block some, such as "Hacking" or "Security risk". A site about *ethical hacking* can be mis-filed. This affects only people **behind such a filter** (students on campus Wi-Fi, a plausible audience for these courses), not a whole provider.

Check and request re-categorisation as **Education / Training**:
- [Google Safe Browsing status](https://transparencyreport.google.com/safe-browsing/search) (also confirm there is no warning)
- [Cisco Talos reputation lookup](https://talosintelligence.com/reputation_center)
- [FortiGuard web filter lookup](https://www.fortiguard.com/webfilter)

Wording that helps on the pages: "learn ethically", "legal", "lab environment". Avoid "hack any account / WhatsApp / Instagram" style copy. This is also what Google Ads and Meta policy reviewers look for.

---

## Monitoring so you hear first, not the students

1. **GitHub Actions** (`.github/workflows/uptime.yml`, included): runs `check-site.mjs` every 6 hours from GitHub's servers and emails you when DNS, certificate or any page fails. It runs from the US, so it will **not** see an Indian provider problem; it does catch expiring certificates, broken deploys and DNS regressions.
2. A free multi-location uptime monitor (UptimeRobot, Better Stack or similar): add `https://lp.knoalabs.com/cyber-security`, keyword check on "Knoa Labs", alert to your phone.
3. **Google Search Console** > Settings > Crawl stats and Page indexing: "Server connectivity" and "DNS" errors show here first.
4. **Google Ads**: "Destination not working" disapprovals and a sudden rise in clicks without sessions in GA4 are the paid-traffic symptom. Fix before spending more.

## What to tell a visitor who cannot open the link (copy for WhatsApp)

> Please try opening the link on mobile data or another Wi-Fi. If it still does not open, set your phone's Private DNS to `dns.google` (Android: Settings > Network & internet > Private DNS; the menu name varies by phone), or message us here and we will register you directly.

(That is a stop-gap for individual users; the real fix is Cause 1.)
