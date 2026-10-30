# Knoa Labs landing pages: audit report (30 Oct 2026)

Scope: the whole project zip (`Knoalabsmarketingsite-main`): 7 pages, shared CSS/JS, `vercel.json`, nginx configs, SEO files. Your pasted `index.html` (BIA Kochi, React) was used as the **model for SEO/AEO/GEO structure** (geo meta, FAQ schema, local signals, AI-discovery link). It is a different site and was not changed.

## How this was checked
| Method | Result |
|---|---|
| Read every file; extracted visible text of both course pages | no leaked comments, no placeholder text visible |
| `scripts/audit.mjs` (links, anchors, ids, alt text, titles/descriptions, canonical, OG, JSON-LD validity, FAQ schema = visible text, sitemap, `?v=` consistency, one phone number) | original: 0 real errors, 25 warnings. Now: **0 errors, 0 warnings** |
| Real nginx 1.24 running the new configs (HTTP, HTTPS with TLS 1.3 + HTTP/2, TLS 1.1 refused) | all redirects, headers, hidden paths, `.well-known`, 404 verified |
| Real Chromium (`scripts/e2e.mjs`) with the **production CSP** | **123 checks pass**: no console errors, each ad vendor allowed / unknown host blocked, 14 traffic sources, full form flow, hashes recomputed independently, mobile overflow |
| Lighthouse (local, mobile) | see below |
| `scripts/check-site.mjs` against a local server | 36/36 |

### What I could NOT verify (my environment cannot reach your domain)
Live DNS, the live certificate, your hosting, Google Search Console, GTM container contents, the Apps Script. Statements about those come from your own notes (`DEPLOY.md`) and public reports, and are labelled as such. `check-site.mjs` exists so **you** can verify from the affected network.

## Lighthouse (mobile, local server, GTM unreachable in my sandbox)
| Page | Perf | A11y | Best-pr. | SEO |
|---|---|---|---|---|
| /cyber-security | 100 → 99\* | **97 → 100** | 96 → 96 | 100 → 100 |
| /Generativeai&Agenticai/... | 100 → 99\* | 100 → 100 | 100 → 96\* | 100 → 100 |
| / | 100 → 100 | 100 → 100 | 100 → 100 | 100 → 100 |

\* Noise, not regressions: the only console error is Google Tag Manager failing to download in my sandbox, which appears on or off depending on timing (it was present on the cyber page before any change). Performance was already excellent; I did not trade it away.

## Findings

Severity: **High** = users cannot reach / revenue impact · **Med** = real risk · **Low** = hygiene.  Status: **Fixed** (in this zip) · **You** (needs your action) · **Advice**.

### Availability: "page can't be reached"
| # | Sev | Finding | Status |
|---|---|---|---|
| A1 | **High** | Per your `DEPLOY.md`, 9 stale NS records answer "does not exist". Resolvers pick them at random → intermittent, provider-specific outage. Hosting changes do not fix it. | **You**: delete in GoDaddy. Steps + proof tool in `docs/REACHABILITY.md` |
| A2 | Med | Public reports of Vercel custom domains failing on Jio/Vodafone while `.vercel.app` works; cause unconfirmed. | **Advice**: measure on those SIMs after A1; Cloudflare / DigitalOcean as options |
| A3 | Med | Unknown whether an AAAA (IPv6) record exists without a listener (common on IPv6-first mobile networks). | **You**: `check-site.mjs` shows it |
| A4 | Med | `deploy/*.conf` (server config) would be publicly downloadable on Vercel; `.vercelignore` only excluded `*.md`. | **Fixed** (`.vercelignore` now excludes deploy, docs, scripts, package files) |
| A5 | Low | nginx rule `^/\.` blocked `/.well-known/` (would break security.txt and could interfere with certificate webroot renewals). | **Fixed** |
| A6 | Low | No HSTS on nginx; no custom 404; redirects had no aliases; query strings not kept on redirects. | **Fixed** (HSTS staged: 1 week → 1 year) |
| A7 | Low | Possible "Hacking" web-filter category on campus / office networks. | **Advice** (`REACHABILITY.md` cause 6) |

### Code
| # | Sev | Finding | Status |
|---|---|---|---|
| B1 | Med | CSP allowed only Google + Clarity. Adding a Meta / LinkedIn / Bing pixel in GTM would be **silently blocked**; GTM Preview mode also blocked. | **Fixed**: vendor-based CSP, generated for Vercel **and** nginx from one file (they can no longer drift) |
| B2 | Med | Meta advanced matching would not have matched: only one phone hash (`+91…`); Meta needs digits only. No shared dedupe id. | **Fixed**: `sha256_phone_number_meta`, `event_id` = `transaction_id` |
| B3 | Med | Only Google click IDs captured; a Meta/Bing/LinkedIn click was untraceable beyond UTMs. | **Fixed** (`fbclid, msclkid, li_fat_id, ttclid, dclid`) |
| B4 | Low | Homepage had no analytics, so organic and AI-assistant visits were invisible. | **Fixed** (same GTM container; conversion triggers are path-guarded) |
| B5 | Low | a11y: YouTube button name ≠ visible text; footer phone link 19 px tall. | **Fixed** (97 → 100) |
| B6 | Low | Duplicate 26 KB stylesheet (cyber and GenAI `page.css` identical). | **Advice** (not touched: live ad pages) |
| B7 | Low | `signalFormSuccess` posts a hidden form to `/robots.txt`; harmless but a hidden dependency. | **Advice** (documented in DEPLOY.md) |
| B8 | Info | Checked and fine: no broken links/anchors/assets, no duplicate ids, FAQ schema equals visible text, all images have alt, one phone number, form has honeypot + double-submit block + number confirmation, no secrets in the front-end, `?kw=` is whitelisted (no injection). | n/a |

### SEO / AEO / GEO
| # | Sev | Finding | Status |
|---|---|---|---|
| C1 | Med | Titles 73/74 chars; descriptions 174/220 (truncated in Google). | **Fixed** |
| C2 | Med | GenAI page: no `og:image`, `summary` card. Home + refund: no OG/Twitter at all. | **Fixed** (2 new 1200×630 images) |
| C3 | Med | No `llms.txt`, no AI-bot rules, sitemap missing `/refund`, stale `lastmod`. | **Fixed** |
| C4 | Low | Schema: Organization only; no WebSite/WebPage/Breadcrumb/Course details. | **Fixed** (shared `@id` graph) |
| C5 | Med | Unverifiable on-page claims (4.5★, 500+, 4.9★, 60+): ad-policy risk; rating source is an open TODO in the HTML. | **You** (provide proof / link source). Not marked up in schema on purpose |
| C6 | Med | GenAI URL has `&`, mixed case, doubled word; guessable URLs 404'd. | Aliases **Fixed**; renaming **Advice** (needs GTM + Ads change) |
| C7 | Low | No consent/privacy line near the form (India DPDP Act 2023). | **You / legal** |
| C8 | Info | Reference snippet used `<link rel="llms">`: not a recognised relation → replaced with `rel="alternate"` + `/llms.txt`. Its `og:image` is a LinkedIn CDN URL with an expiring token and will break. | Applied / noted |
| C9 | Low | Favicon linked on every page (48/96 px, ICO, Apple icon). | **Fixed** (standardised on all 7 pages) |

## What changed (files)
**New:** `llms.txt`, `llms-full.txt`, `404.html`, `site.webmanifest`, `.well-known/security.txt`, `2269610a…txt` (IndexNow key), `shared/og/*`, `shared/page-home.js`, `deploy/nginx-lp.knoalabs.com.https.conf`, `scripts/*` (serve, audit, build-headers, check-site, e2e, make-og, indexnow), `docs/*`, `.github/workflows/*`, `package.json`, `START-HERE.md`.
**Changed:** all 7 HTML pages (head, schema, favicon, asset versions), `index.html` (FAQ section), `robots.txt`, `sitemap.xml`, `vercel.json`, `deploy/*`, `shared/tracking.js` (v8), `shared/form.js` (v10), `shared/base.css` (v6), `.vercelignore`, `.gitignore`.
**Untouched:** all visible landing-page copy, layout, form behaviour, URLs, GTM IDs, form endpoints.

## Your to-do list, in order
1. **GoDaddy: delete the 9 stale NS records** (A1). Then run `node scripts/check-site.mjs` on mobile data / another provider.
2. Deploy this zip (`node scripts/audit.mjs` first). Keep Vercel unless A2 persists after step 1.
3. Search Console: submit sitemap, request indexing (home, both courses). Bing Webmaster: add site. `node scripts/indexnow.mjs`.
4. GTM: add the Meta / LinkedIn / Microsoft tags per `docs/ADS-AND-TRACKING.md`; use `{{event_id}}` for Meta, `{{transaction_id}}` for Google.
5. Provide: real social profile URLs, trainer name/LinkedIn, rating source (Google Business Profile), batch dates. Each unlocks specific schema (list in `SEO-AEO-GEO.md` §4).
6. Add a consent line at the form; review ad copy against policy.
7. Renew `security.txt` before 2027-06-30.

## Trade-offs I chose
- `'unsafe-inline'` stays in `script-src`: GTM custom tags and the inline `?kw=` script need it. Removing it requires nonces (needs server-side rendering).
- AI training bots are **allowed** (better GEO). One line in `robots.txt` flips that.
- Fees stay unpublished (your choice); the AI files say so explicitly rather than let assistants guess.
