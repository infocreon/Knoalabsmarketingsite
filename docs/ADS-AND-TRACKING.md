# Ads and tracking guide: Google Ads, YouTube, Meta, Microsoft, LinkedIn and AI assistants

How visitors from each channel are recognised, measured and reported on these landing pages. **Everything is configured in Google Tag Manager (container `GTM-TFGRSK64`)**: no ad pixel is hard-coded in the pages. The page code only (1) remembers where the visitor came from and (2) pushes clean events to the `dataLayer`.

> Verified in a real browser by `scripts/e2e.mjs`: classification of each source, the full form flow, the `event_id`/`transaction_id` match, hashed personal data, and that the Content-Security-Policy lets each vendor below load (and blocks an unknown host).

---

## 1. What the page does for you

### 1.1 Click IDs and UTMs are captured (90-day first-party cookie `kl_attr`)

| Network | Parameter added by the platform | Stored as |
|---|---|---|
| Google Ads (Search, Display, Performance Max) | `gclid`, `gbraid` (iOS app), `wbraid` (iOS web) | same names |
| Google Ads video / YouTube, DV360 | `gclid`, `dclid` | same names |
| Meta (Facebook, Instagram) | `fbclid` | `fbclid` |
| Microsoft Advertising (Bing) | `msclkid` | `msclkid` |
| LinkedIn | `li_fat_id` | `li_fat_id` |
| TikTok | `ttclid` | `ttclid` |
| Any | `utm_source / medium / campaign / term / content` | same names |

A **new ad click replaces all old click IDs**, so two different clicks are never mixed. Sheet columns are unchanged: the lead form still sends `gclid, gbraid, wbraid, utm_*, kw`. (To send `fbclid`/`msclkid` to the Sheet too, add the field names in `shared/form.js` `HIDDEN` and `fillHidden`, **and** add the matching columns in the Apps Script. I did not do this because I cannot see your Apps Script; an unexpected field could shift columns.)

### 1.2 Traffic source is classified (`traffic_platform`)

Pushed once per page view as the dataLayer event `lp_context`, and added to every lead event:

| `traffic_platform` | Rule (first match wins) |
|---|---|
| `youtube_ads` | `utm_source=youtube`, or a Google click ID arriving from youtube.com |
| `google_ads` | `gclid`/`gbraid`/`wbraid`/`dclid`, or `utm_source=google` with `utm_medium=cpc/ppc/paid` |
| `meta_ads` | `fbclid`, or `utm_source` = facebook / fb / instagram / ig / meta |
| `microsoft_ads` | `msclkid`, or `utm_source=bing` + paid medium |
| `linkedin_ads` | `li_fat_id` or `utm_source=linkedin` |
| `tiktok_ads` | `ttclid` or `utm_source=tiktok` |
| `chatgpt_ads` | `utm_source=chatgpt/chatgpt.com/openai` **and** a paid medium (`paid_ai`, `cpc`, `ad`, `sponsored`) |
| `chatgpt` | `utm_source=chatgpt.com`, or referrer chatgpt.com / openai.com (organic citation) |
| `ai_assistant` | referrer is Perplexity, Gemini, Copilot, Claude, You.com, Poe, Meta AI, Grok, Mistral, DeepSeek, Kagi (`ai_referrer` holds the host) |
| `organic_search` | referrer is Google, Bing, DuckDuckGo, Yahoo, Ecosia, Baidu, Yandex |
| `direct_or_other` | everything else |

The first classification in a browser tab is kept, so reloading the page (no referrer) does not turn a Meta lead into "direct". Add `?debug=1` to any URL to print every event in the browser console.

> **Know the limit for AI traffic.** AI assistants decide themselves whether to send a referrer and a `utm_source`. Reports in October 2026 describe ChatGPT links briefly losing both ([LLM Pulse data study](https://llmpulse.ai/data-studies/chatgpt-utm-tracking), via [Relevant Audience](https://www.relevantaudience.com/analytics/chatgpt-gpt-6-utm-referrer-dropped-direct-traffic/); the cause and permanence were not confirmed by OpenAI in those sources). Treat **organic AI-assistant traffic as a floor, not a total**: some of it will show as Direct. Anything *you* control (paid placements, links you share) should carry your own UTMs; those are always reliable.

### 1.3 Events pushed to `dataLayer`

| Event | When | Useful parameters |
|---|---|---|
| `lp_context` | every page view | `traffic_platform`, `ai_referrer`, `kw`, `lp_page` |
| `lead_form_submit` | **after** the lead is saved to the Sheet (once per session) | `transaction_id`, **`event_id`** (same value), `traffic_platform`, `user_type`, `intent`, `kw`, `form_location`, `user_data.sha256_email_address`, `user_data.sha256_phone_number` (Google format), `user_data.sha256_phone_number_meta` (Meta format) |
| `syllabus_request`, `demo_request` | same moment, for those intents | `user_type`, `kw`, `traffic_platform` |
| `whatsapp_click`, `phone_click` | tap on a WhatsApp / call link | `click_location` |
| `faq_open` | a FAQ is opened | `faq_question` |
| `scroll_75` | 75% scrolled | `percent_scrolled` |
| `video_play` | YouTube facade tapped | `video_id`, `video_location` |
| `phone_confirm_edit`, `dialog_open` | form UX | |

`lead_form_submit` never contains the name, phone or email in plain text: only SHA-256 hashes, and the test recomputes each hash independently to prove the normalisation (lower-cased email; `+919847123456` for Google; `919847123456` for Meta).

---

## 2. GTM recipes (what to create in tagmanager.google.com)

Create **Data Layer Variables** once: `transaction_id`, `event_id`, `traffic_platform`, `kw`, `user_type`, `user_data.sha256_email_address`, `user_data.sha256_phone_number`, `user_data.sha256_phone_number_meta`.
Trigger **"Lead saved"** = Custom Event `lead_form_submit`. (The existing Form-Submission triggers keep working: `#kl-lead-form` is still signalled.)

| Channel | Tag | Trigger | Key settings |
|---|---|---|---|
| **GA4** | GA4 Event `generate_lead` | Lead saved | params: `traffic_platform`, `user_type`, `kw`, `form_location`; mark `generate_lead` as a key event in GA4 |
| **Google Ads** (Search / YouTube / PMax) | Google Ads Conversion Tracking | Lead saved | **Transaction ID = `{{transaction_id}}`** (stops double counting); turn on **Enhanced conversions for leads**, pass the two hashed fields (already SHA-256, Google accepts that) |
| **Google Ads remarketing** (also feeds **YouTube** audiences) | Google Ads Remarketing | All Pages | link the YouTube channel to the Ads account (Ads > Tools > Linked accounts) to build "viewed / visited" audiences |
| **Meta** | Meta Pixel (community template "Facebook Pixel" or custom HTML) | `PageView` on All Pages, **`Lead`** on Lead saved | set the Pixel **eventID = `{{event_id}}`**; advanced matching: `em` = `{{user_data.sha256_email_address}}`, `ph` = **`{{user_data.sha256_phone_number_meta}}`** (Meta normalises phones as digits only, no `+`, so it needs its own hash) |
| **Meta Conversions API** (recommended; browsers block pixels) | server-side GTM, or a Meta partner integration | Lead saved | send the **same `event_id`**: Meta then counts browser + server events once |
| **Microsoft Ads** | UET tag + conversion goal | Lead saved | auto-tagging adds `msclkid` |
| **LinkedIn** | Insight Tag + conversion | Lead saved | |
| **Clarity** | already used | All Pages | |

**Page-path guard that already exists:** the WhatsApp / call conversion triggers only fire on `/Generativeai&Agenticai/` and the cyber pages, so taps on the new homepage push `whatsapp_click` for GA4 but do **not** count as ad conversions. The thank-you page lives outside the GenAI path on purpose (see `page.js`).

### Consent
Consent Mode v2 defaults are in `shared/tracking.js`: India granted, everywhere else denied. If you add a cookie banner, it must call `gtag('consent','update',{...})`. See **section 5** for the Indian data-protection note.

### Loading speed vs. measurement
GTM is loaded on the visitor's first scroll/tap/key or after 3 seconds (`GTM_LOAD: 'interaction'`), which keeps mobile PageSpeed high. Trade-off: a visitor who leaves before either happens is not seen by GA4 / Meta Pixel `PageView`. If Meta shows far fewer PageViews than link clicks, set `GTM_LOAD: 'load'` in the page's `page.js` (you measured ~45 PageSpeed points lost earlier).

---

## 3. Final URL / tracking templates per channel

The pages read `?kw=` (whitelisted: `hacking`, `analyst` on cyber; `agentic`, `certificate` on GenAI) to swap the headline. Keep it. Append UTMs after it.

**Google Ads** (account-level *Final URL suffix*, so every ad inherits it):
```
utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&utm_content={creative}&matchtype={matchtype}&network={network}
```
**YouTube / Google video campaigns** (campaign-level suffix):
```
utm_source=youtube&utm_medium=video&utm_campaign={campaignid}&utm_content={adgroupid}
```
**Meta** (Ad > Tracking > URL parameters; dynamic values in double braces; Meta adds `fbclid` itself):
```
utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&placement={{placement}}
```
**Microsoft Advertising** (tracking template suffix; turn auto-tagging on):
```
utm_source=bing&utm_medium=cpc&utm_campaign={CampaignId}&utm_term={keyword}
```
**LinkedIn:** `utm_source=linkedin&utm_medium=paid_social&utm_campaign=<name>&utm_content=<ad>`
**Paid placements inside AI assistants** (e.g. sponsored results in ChatGPT where the programme is open to you): `utm_source=chatgpt.com&utm_medium=paid_ai&utm_campaign=<name>` → reported as `chatgpt_ads`.
**Links you share yourself** (WhatsApp broadcast, email, QR): `utm_source=whatsapp&utm_medium=broadcast&utm_campaign=<name>`.

Naming rules: lower-case, no spaces (`nov-batch-cyber`), one campaign name used consistently across channels, so GA4 can compare them.

---

## 4. Ad-policy and landing-page quality notes

Not code issues, but they decide whether ads get approved and stay approved. Check the **current** policy pages, as they change.

1. **Unverifiable claims.** The cyber page shows "4.5 star rating" and "500+ students trained"; the GenAI page "4.9 star rating" and "60+ students enrolled". The source for the rating is marked as a to-do in the HTML comment (`GOOGLE_BUSINESS_PROFILE_URL`). Google Ads and Meta both reject or later disapprove claims they cannot verify. Keep proof (Google Business Profile reviews, enrolment records) and link the rating to its source. I deliberately did **not** put ratings or counts into the structured data or `llms-full.txt`.
2. **"Placement" wording.** The pages already say "support, not a job guarantee": keep it that way in ad copy and in AI-assistant answers (the `llms-full.txt` file states it explicitly).
3. **Hacking-related copy.** Use "ethical hacking", "learn legally", "lab environment". Avoid "hack any account", which triggers both ad-policy and web-filter problems.
4. **Landing-page reachability.** An ad whose page does not open for some users wastes budget and can trigger "destination not working". See `REACHABILITY.md`.
5. **Mismatched numbers.** One phone / WhatsApp number (`+91 98957 05599`) everywhere; the audit script checks this.

## 5. Data protection (India)

The form collects name, phone and email and sends hashed identifiers to ad platforms. The Digital Personal Data Protection Act 2023 expects a clear notice and consent for this. **Recommended (needs your legal advice, so I did not change the form copy):** under the submit button add one line such as *"By submitting you agree to be contacted on WhatsApp/phone about this course and to our [Privacy Policy]."* Hashing makes data harder to read but it is still personal data. This is not legal advice.

## 6. Testing checklist before spending on a campaign

1. `node scripts/serve.mjs`, open `/cyber-security?utm_source=facebook&fbclid=test&debug=1`, open the browser console: you should see `traffic source {platform: 'meta_ads'}`.
2. Submit the form with GTM **Preview** on: `lead_form_submit` appears once, with `transaction_id` = `event_id`, and your Google Ads / Meta tags fire on it.
3. In Google Ads: check the conversion status turns "Recording conversions" (can take a day).
4. In Meta Events Manager: *Test events* shows `Lead` with a matching event ID; after server-side is added, "Deduplicated" appears.
5. `node scripts/audit.mjs` and `node scripts/e2e.mjs` is green.
