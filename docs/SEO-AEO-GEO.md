# SEO, AEO, GEO and AX: what is in place and how to keep it working

| Term | Means | Goal |
|---|---|---|
| **SEO** | Search Engine Optimisation | Rank in Google / Bing results |
| **AEO** | Answer Engine Optimisation | Be the quoted answer (featured snippet, voice assistants, "People also ask", AI Overviews) |
| **GEO** | Generative Engine Optimisation | Be recommended and cited by ChatGPT, Claude, Perplexity, Gemini, Copilot |
| **AX** | Agent experience (read here as *agent* experience; the same work also improves UX) | Let AI agents and tools read the site, understand it and act on it correctly |

**Honest limit:** nobody can guarantee a ranking, a snippet or an AI citation, and no AI provider publishes its ranking rules. What this work does is remove every technical reason you could be skipped, make your facts unambiguous, and give the engines something accurate to quote. Results take weeks, not days.

---

## 1. What is implemented

### Crawling and discovery
| File | What it does |
|---|---|
| `robots.txt` | Four explicit groups: search + ad-review bots (Googlebot, AdsBot-Google, Bingbot, facebookexternalhit, LinkedInBot...), **AI search/answer bots** (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot...), **AI training bots** (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot...), everyone else. All allowed; thank-you pages disallowed. Ad-review bots matter: if Google Ads' AdsBot or Meta's crawler cannot read the page, ads get "destination not working". |
| `sitemap.xml` | 4 indexable URLs with accurate `lastmod` (the thank-you pages are correctly absent). |
| `llms.txt` | Short, link-based summary for language models ([llmstxt.org](https://llmstxt.org) format). |
| `llms-full.txt` | Complete plain-text facts: both courses, all modules, schedule, prerequisites, what is included **and what is not claimed** (no price, no placement %). Written only from your public pages. |
| `<link rel="alternate" type="text/plain" href="/llms.txt">` | Points tools at the summary from every page. (The reference snippet used `rel="llms"`; that is not a recognised link type, so I used the standard `rel="alternate"`.) |
| `.well-known/security.txt` | Standard security contact. **Expires 2027-06-30**: renew it (the audit warns 60 days before). |
| `site.webmanifest` | Name, icons, theme colour. |
| Favicon links (all 7 pages) | `favicon.ico` (16/32/48), `favicon-48x48.png`, `favicon-96x96.png`, `apple-touch-icon.png` (180). Google shows the icon next to your result in search only if: it is linked from the **homepage**, its size is a multiple of 48 px (48 and 96 are), the file is crawlable (robots.txt allows `Googlebot-Image`), and the URL stays stable. After deploy: Search Console > URL Inspection > Request indexing for `/`. The icon in results usually updates within days to a few weeks; Google does not let you force it. |
| `2269610a3c0f91f5197f6dd813ad5a22.txt` + `scripts/indexnow.mjs` | IndexNow key + submit script: tells Bing/Copilot/DuckDuckGo/Yandex a page changed within minutes. |
| `404.html` | Real 404 (not a "soft 404"), `noindex`, with links to both courses. |
| Short URL aliases | `/gen-ai`, `/genai`, `/generative-ai`, `/agentic-ai`, `/cyber`, `/cybersecurity`, `/ethical-hacking` permanently redirect (query string kept) to the real pages. AI assistants and people guess these. |

> **About llms.txt.** As of my knowledge, no major AI provider has publicly confirmed that it reads `llms.txt` when ranking or citing. It is cheap, harmless insurance that helps agents and tools that *do* fetch it. The things that demonstrably matter are a crawlable site, accurate structured data and clear, quotable facts, all of which are done.

### On-page SEO (every indexable page)
- Titles ≤ 66 characters, descriptions 150 to 152 characters (were 73/74 and 174/220: Google cuts at about 60 and 155). Keywords kept: *live online*, *cyber security*, *ethical hacking*, *Gen AI*, *Agentic AI*, *certificate*.
- `canonical` on each page; `hreflang="en-IN"` + `x-default`.
- `robots`: `max-image-preview:large, max-snippet:-1, max-video-preview:-1` (lets Google and AI Overviews show full snippets and large images).
- Open Graph + Twitter cards with a 1200×630 image on **every** page (GenAI and home had none; share previews on WhatsApp, LinkedIn and X were blank).
- `geo.region` / `geo.placename` (Kerala / Kozhikode) as in your reference. Coordinates are omitted on purpose: these are online courses and I will not guess a latitude.
- Homepage gained a real heading structure, a visible 6-question FAQ and GTM measurement.

### Structured data (JSON-LD, validated as parseable JSON by the audit)
| Page | Graph |
|---|---|
| all | `Organization` + `EducationalOrganization` (one shared `@id`, address, `areaServed: India`, `ContactPoint` for admissions) → `WebSite` → `WebPage` (with `primaryImageOfPage`, `dateModified`) → `BreadcrumbList` |
| `/cyber-security`, `/Generativeai&Agenticai/online-course` | `Course` (with `coursePrerequisites`, `educationalCredentialAwarded`, `audience`, `courseWorkload`, `image`, `hasCourseInstance`) + `FAQPage` |
| `/` | `CollectionPage` + `ItemList` of both `Course`s + `FAQPage` |

The audit script verifies that **every FAQ question and answer in the schema also appears word for word on the page** (a Google requirement; mismatches risk a manual action).

**Deliberately not added:**
- `AggregateRating` / `Review`: the on-page ratings (4.5★, 4.9★) have no linked, verifiable source. Marking them up without one violates Google's guidelines and risks losing rich results.
- `offers` / price: no fee is published.
- Trainer name: the page does not name the trainer (see to-do 3).

### AEO (being the answer)
- FAQs are real questions in the words people type ("Is there a placement guarantee?", "Do I need an IT or coding background?"), answered in 1 to 3 sentences, on the page **and** in `FAQPage` schema **and** in `llms-full.txt`.
- The comparison table (live vs Udemy/YouTube vs big institutes) is a good extractable table already present on the cyber page.
- Facts are stated identically everywhere (3–4 months, 12 / 19 modules, +91 98957 05599). Answer engines trust agreement between sources.

### GEO (being cited by AI assistants)
- AI search bots are explicitly allowed, and `llms-full.txt` gives them an unambiguous, correctly-hedged fact sheet ("not stated: price, placement percentage, exact start date"). That last section prevents an assistant from inventing "95% placement" about you.
- Traffic from assistants is classified (`traffic_platform = chatgpt / ai_assistant / chatgpt_ads`) so you can see it in GA4. See the limits in `ADS-AND-TRACKING.md` section 1.2.

### AX (agent experience)
- Every form field has a `<label>`, `autocomplete` token (`name`, `tel-national`, `email`), `inputmode` and an `aria-describedby` error line: agents and password/autofill managers can complete it. Validation errors are announced text, not just colour.
- Contact is machine-readable: `tel:` / `mailto:` links, a deterministic WhatsApp deep link with a pre-filled message, `ContactPoint` in JSON-LD.
- Stable element ids and `data-*` hooks (`#enquire`, `#faq`, `data-lead-form`) for tools and tests.
- Accessibility: Lighthouse accessibility **97 → 100** on the cyber page: the YouTube button's accessible name now contains its visible text (WCAG 2.5.3) and footer contact links meet the 24 px target size (WCAG 2.5.8). `skip to content` link, one `<h1>`-level heading per page, `<dialog>` for modals.

---

## 2. Do these once (15 minutes, high value)

1. **Google Search Console**: the property is already verified (`google9ecbfd1f9448cc0b.html`). Open *Sitemaps* → submit `https://lp.knoalabs.com/sitemap.xml`. Then *URL Inspection* → request indexing for the 4 URLs.
2. **Bing Webmaster Tools** (bing.com/webmasters): add the site (import from Search Console). Bing's index feeds Copilot and is one of the sources used by ChatGPT search.
3. **IndexNow**: after every content deploy run `node scripts/indexnow.mjs` from a computer with internet.
4. **Rich Results Test** (search.google.com/test/rich-results) on `/cyber-security`: expect *Course* and *FAQ* detected, no errors. Do the same for the GenAI page and `/`.
5. **Social preview check**: paste each URL into WhatsApp (to yourself), LinkedIn Post Inspector and the Facebook Sharing Debugger ("Scrape again"). Previews are cached, so re-scrape after any image change.
6. **Google Business Profile**: if you have a verified profile, link it from the page and `sameAs` (see to-do 2). It is the strongest local and review signal.

## 3. Keep it correct (when you change content)

| You change... | Also update |
|---|---|
| a FAQ answer | the same text in the page's `FAQPage` JSON-LD (the audit fails if they differ) and in `llms-full.txt` |
| modules, duration, schedule | the page, `Course` JSON-LD, `llms.txt`, `llms-full.txt`, the home FAQ |
| price / start date / batch | page text first; only then add `offers` / `startDate` to the schema |
| a page | `lastmod` in `sitemap.xml` and `dateModified` in its `WebPage` schema, then `node scripts/indexnow.mjs` |
| a CSS/JS file in `shared/` | bump the `?v=` number in **every** page (the audit fails if versions differ) |
| the OG image | new file name (`-v2`) in `scripts/make-og.mjs` and the `og:image` / `twitter:image` tags, otherwise networks keep the old picture |
| the tracking number | all pages + `page.js` + GTM triggers (the audit flags mixed numbers) |

Run `node scripts/audit.mjs` before every deploy. It takes one second.

## 4. What would help most next (needs content or decisions from you)

1. **Verified reviews** with a public source (Google Business Profile, Trustpilot). Then add `AggregateRating` honestly. This is the single biggest trust signal for both users and AI assistants.
2. **Real social profiles** (YouTube, LinkedIn, Instagram, Facebook) → add to `sameAs` in the `Organization` schema on all pages. Entity consistency across the web is how assistants decide "this is the same Knoa Labs".
3. **Name the trainer** (with consent) + LinkedIn link + `Person` schema (`name`, `jobTitle`, `sameAs`, `knowsAbout`). Named, credentialed instructors are the core of E-E-A-T for course content.
4. **Real batch dates** (`startDate`) and, if you are comfortable publishing, a fee range: pages with a price outperform "ask on WhatsApp" in both search and AI answers.
5. **Content depth**: 4 to 6 genuine articles / guides on `knoalabs.com` (for example "SOC analyst vs pentester", "Roadmap to CEH", "RAG vs fine-tuning") interlinked with these landing pages. Landing pages alone rarely rank; the blog is where informational queries and AI citations come from.
6. **Third-party mentions** (college partnerships, LinkedIn posts, YouTube demo class): AI assistants weigh what *others* say about you.
7. **Consider a clean GenAI URL.** `/Generativeai&Agenticai/online-course` has an `&`, mixed case and a doubled word. It works, but it breaks when pasted into some SMS/WhatsApp/form tools, looks untrustworthy, and is harder for people and models to guess. It cannot be renamed casually: Google Ads and GTM triggers depend on it. Safe path: pick a clean URL, serve the page there, 301 the old URL to it, update the GTM Page Path triggers and the ad final URLs on the same day, then monitor.
8. **One stylesheet.** `cyber-security/page.css` and `Generativeai&Agenticai/online-course/page.css` are byte-for-byte identical (26 KB). Move to `shared/page.css` (and bump versions) to halve maintenance. Not done here to avoid touching live ad pages without a visual regression review.
