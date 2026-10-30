/* ==========================================================================
   Knoa Labs LP — shared tracking
   - Consent Mode v2 defaults (set BEFORE GTM loads)
   - GTM loader (async, skipped while the ID is still the placeholder)
   - Click-ID + UTM capture into a 90-day first-party cookie (Google gclid/gbraid/wbraid/dclid, Meta fbclid,
     Microsoft msclkid, LinkedIn li_fat_id, TikTok ttclid)
   - Traffic-source classification (google_ads / youtube_ads / meta_ads / microsoft_ads / linkedin_ads / tiktok_ads /
     chatgpt_ads / chatgpt / ai_assistant / organic_search / direct_or_other) pushed once per page view as the `lp_context` event
   - dataLayer helper: LP.track(event, params, {once})
   - Auto events: whatsapp_click, phone_click, scroll_75, faq_open, video_play
   Reads window.LP_CONFIG (set by /<page>/page.js, which must load first).
   Add ?debug=1 to any URL to log every dataLayer push to the console.
   ========================================================================== */
(function () {
  'use strict';

  var CFG = window.LP_CONFIG || {};
  var w = window, d = document;
  w.dataLayer = w.dataLayer || [];
  function gtag() { w.dataLayer.push(arguments); }
  w.gtag = w.gtag || gtag;

  /* ---------- Debug mode (persists for the tab session) ---------- */
  var params = new URLSearchParams(location.search);
  var DEBUG = false;
  try {
    if (params.get('debug') === '1') sessionStorage.setItem('lp_debug', '1');
    if (params.get('debug') === '0') sessionStorage.removeItem('lp_debug');
    DEBUG = sessionStorage.getItem('lp_debug') === '1';
  } catch (e) { DEBUG = params.get('debug') === '1'; }
  function log() { if (DEBUG) console.log.apply(console, ['%c[LP]', 'color:#0B8F63;font-weight:bold'].concat([].slice.call(arguments))); }

  /* ---------- Consent Mode v2 defaults ----------
     Ads target India only. No consent banner is required for IN today, so IN defaults to granted.
     Everywhere else defaults to denied (cookieless pings only). If a CMP/banner is added later,
     it should call gtag('consent','update',{...}). */
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: 'denied', functionality_storage: 'granted', security_storage: 'granted',
    wait_for_update: 500
  });
  gtag('consent', 'default', {
    region: ['IN'],
    ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted'
  });
  gtag('set', 'ads_data_redaction', false);
  gtag('set', 'url_passthrough', true);

  /* ---------- GTM loader ----------
     GTM costs ~1.5s of main-thread time on mid-range phones, so it is not loaded in <head>.
     LP_CONFIG.GTM_LOAD:
       'interaction' (default) on the first scroll / tap / key, or GTM_FALLBACK_MS (3000) after load.
                     Keeps mobile PageSpeed ~95. Early taps are replayed, so no click conversions are lost.
       'load'        as soon as the page has finished loading. Costs ~45 points of mobile PageSpeed with
                     the current container (LCP ~7.7s in Lighthouse).
       'immediate'   straight away (worst PageSpeed).
     Anything pushed before GTM arrives is queued. WhatsApp / call taps that happen before GTM is ready are
     replayed as gtm.linkClick once it is (see replayEarlyClicks), so "Click - Just Links" triggers still fire.
     All Google Ads conversions are configured in GTM (see TRACKING.md), not in page code. */
  var GTM_ID = CFG.GTM_ID || 'GTM-XXXXXXX';
  var HAS_GTM = /^GTM-[A-Z0-9]+$/.test(GTM_ID) && GTM_ID !== 'GTM-XXXXXXX';
  var GTM_LOAD = CFG.GTM_DELAY === false ? 'immediate' : (CFG.GTM_LOAD || 'interaction');
  var GTM_FALLBACK_MS = CFG.GTM_FALLBACK_MS || 3000;
  var tagsLoaded = false;
  function gtmReady() { return !!(w.google_tag_manager && w.google_tag_manager[GTM_ID]); }
  function loadTags(reason) {
    if (tagsLoaded) return;
    tagsLoaded = true;
    w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    var s = d.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + GTM_ID;
    s.onload = function () { whenReady(replayEarlyClicks); };
    d.head.appendChild(s);
    log('GTM loading (' + reason + ')');
  }
  function whenReady(fn, tries) {
    tries = tries || 0;
    if (gtmReady()) return setTimeout(fn, 50); // let the container attach its listeners
    if (tries < 40) setTimeout(function () { whenReady(fn, tries + 1); }, 100);
  }
  if (HAS_GTM) {
    if (GTM_LOAD === 'immediate') {
      loadTags('immediate');
    } else {
      var evts = ['scroll', 'pointerdown', 'keydown', 'touchstart', 'focusin'];
      var onFirst = function (e) {
        evts.forEach(function (n) { w.removeEventListener(n, onFirst, true); });
        loadTags(e.type);
      };
      evts.forEach(function (n) { w.addEventListener(n, onFirst, { capture: true, passive: true }); });
      var onLoad = function () {
        if (GTM_LOAD === 'load') {
          setTimeout(function () { loadTags('page-load'); }, 0);
        } else {
          setTimeout(function () { loadTags('timeout'); }, GTM_FALLBACK_MS);
        }
      };
      if (d.readyState === 'complete') onLoad(); else w.addEventListener('load', onLoad);
    }
  } else {
    log('GTM not loaded: set LP_CONFIG.GTM_ID.');
  }

  /* Clicks on tracked links (WhatsApp / call, which carry an id for GTM's Click ID triggers) made before GTM
     was ready are replayed with the same variables GTM's own link-click listener would set. Only clicks GTM
     could not have seen are replayed, so nothing is counted twice. */
  var earlyClicks = [];
  function rememberEarlyClick(a) { if (HAS_GTM && a.id && !gtmReady()) earlyClicks.push(a); }
  function replayEarlyClicks() {
    while (earlyClicks.length) {
      var a = earlyClicks.shift();
      w.dataLayer.push({
        event: 'gtm.linkClick', 'gtm.element': a, 'gtm.elementClasses': a.className || '',
        'gtm.elementId': a.id, 'gtm.elementTarget': a.target || '', 'gtm.elementUrl': a.href || ''
      });
      log('replayed early click for GTM:', a.id);
    }
  }

  /* ---------- Attribution capture ---------- */
  // Click IDs: a new ad click from ANY network replaces all stored click IDs, so two clicks are never mixed.
  var CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'dclid', 'fbclid', 'msclkid', 'li_fat_id', 'ttclid'];
  var ATTR_KEYS = CLICK_IDS.concat(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']);
  var COOKIE = 'kl_attr';
  var MAX_AGE = 60 * 60 * 24 * 90; // 90 days

  function readCookie(name) {
    var m = d.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    if (!m) return {};
    try { return JSON.parse(decodeURIComponent(m[1])) || {}; } catch (e) { return {}; }
  }
  function clean(v) { return String(v).replace(/[^\w.\-~+%:|/ ]/g, '').slice(0, 200); }

  var stored = readCookie(COOKIE);
  var fresh = {};
  ATTR_KEYS.forEach(function (k) { var v = params.get(k); if (v) fresh[k] = clean(v); });
  if (Object.keys(fresh).length) {
    // A new ad click replaces the previous click IDs so we never mix two clicks.
    if (CLICK_IDS.some(function (id) { return fresh[id]; })) CLICK_IDS.forEach(function (id) { delete stored[id]; });
    for (var k in fresh) stored[k] = fresh[k];
    stored.ts = Date.now();
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    d.cookie = COOKIE + '=' + encodeURIComponent(JSON.stringify(stored)) + '; Max-Age=' + MAX_AGE + '; Path=/; SameSite=Lax' + secure;
    log('attribution stored', stored);
  }

  // Whitelisted keyword (?kw=) for the H1 swap and lead reporting
  var kwList = CFG.KEYWORDS || [];
  var kwParam = (params.get('kw') || '').toLowerCase();
  var KW = kwList.indexOf(kwParam) > -1 ? kwParam : '';
  try {
    if (KW) sessionStorage.setItem('lp_kw', KW);
    else KW = sessionStorage.getItem('lp_kw') || '';
  } catch (e) {}

  function getAttribution() {
    var a = readCookie(COOKIE);
    var out = {};
    ATTR_KEYS.forEach(function (k) { out[k] = a[k] || ''; });
    out.kw = KW;
    return out;
  }

  /* ---------- Traffic source ----------
     Classifies the visit so ads and AI-assistant traffic can be reported per platform in GA4 / Ads / the Sheet.
     Order matters: a paid click ID beats utm_source, which beats the referrer. First classification wins for the tab
     session, so a reload (which has no referrer) does not turn a Meta lead into "direct". */
  var AI_HOSTS = ['chatgpt.com', 'chat.openai.com', 'openai.com', 'perplexity.ai', 'gemini.google.com', 'bard.google.com',
    'copilot.microsoft.com', 'claude.ai', 'you.com', 'poe.com', 'meta.ai', 'grok.com', 'chat.mistral.ai', 'deepseek.com', 'kagi.com'];
  var SEARCH_HOSTS = ['google.', 'bing.com', 'duckduckgo.com', 'yahoo.', 'ecosia.org', 'baidu.com', 'yandex.'];
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  function hostIn(host, list) { return list.some(function (h) { return host === h || host.slice(-h.length - 1) === '.' + h || (h.slice(-1) === '.' && host.indexOf(h) > -1); }); }
  function classify(a) {
    var src = (a.utm_source || '').toLowerCase(), med = (a.utm_medium || '').toLowerCase();
    var ref = hostOf(d.referrer);
    var out = { platform: 'direct_or_other', ai: '' };
    if (src === 'youtube' || /(^|\.)youtube\.com$/.test(ref) && (a.gclid || a.gbraid || a.wbraid || a.dclid)) out.platform = 'youtube_ads';
    else if (a.gclid || a.gbraid || a.wbraid || a.dclid || (src === 'google' && /cpc|ppc|paid/.test(med))) out.platform = 'google_ads';
    else if (a.fbclid || /^(facebook|fb|instagram|ig|meta)$/.test(src)) out.platform = 'meta_ads';
    else if (a.msclkid || (src === 'bing' && /cpc|ppc|paid/.test(med))) out.platform = 'microsoft_ads';
    else if (a.li_fat_id || src === 'linkedin') out.platform = 'linkedin_ads';
    else if (a.ttclid || src === 'tiktok') out.platform = 'tiktok_ads';
    else if (/^(chatgpt|chatgpt\.com|openai)$/.test(src)) { out.platform = /paid|cpc|ppc|ad|sponsor/.test(med) ? 'chatgpt_ads' : 'chatgpt'; out.ai = 'chatgpt.com'; }
    else if (hostIn(ref, AI_HOSTS)) { out.platform = /chatgpt\.com|openai\.com/.test(ref) ? 'chatgpt' : 'ai_assistant'; out.ai = ref; }
    else if (hostIn(ref, SEARCH_HOSTS)) out.platform = 'organic_search';
    return out;
  }
  var PLAT_KEY = 'lp_platform';
  var traffic = classify(getAttribution());
  try {
    var prev = JSON.parse(sessionStorage.getItem(PLAT_KEY) || 'null');
    if (prev && traffic.platform === 'direct_or_other') traffic = prev;
    else sessionStorage.setItem(PLAT_KEY, JSON.stringify(traffic));
  } catch (e) {}

  /* ---------- dataLayer helper ---------- */
  var ONCE_KEY = 'lp_once_';
  function onceDone(key) { try { return sessionStorage.getItem(ONCE_KEY + key) === '1'; } catch (e) { return false; } }
  function markOnce(key) { try { sessionStorage.setItem(ONCE_KEY + key, '1'); } catch (e) {} }

  /**
   * Push an event. opts.once = key → fires at most once per tab session.
   * opts.callback → called after GTM tags fire (or after opts.timeout ms, default 1500).
   */
  function track(event, data, opts) {
    opts = opts || {};
    var payload = { event: event, lp_page: CFG.PAGE || '' };
    for (var k in (data || {})) payload[k] = data[k];

    if (opts.once && onceDone(opts.once)) {
      log('skipped (already fired this session):', event);
      if (opts.callback) opts.callback();
      return false;
    }
    if (opts.callback) {
      var timeout = opts.timeout || 1500;
      var finished = false;
      var finish = function () { if (!finished) { finished = true; opts.callback(); } };
      if (HAS_GTM) { payload.eventCallback = finish; payload.eventTimeout = timeout; }
      setTimeout(finish, HAS_GTM ? timeout + 100 : 0); // GTM not loaded / blocked
    }
    w.dataLayer.push(payload);
    if (opts.once) markOnce(opts.once);
    log('dataLayer.push', payload);
    return true;
  }

  /* ---------- Contact links from CONFIG ---------- */
  function waUrl(msg) {
    return 'https://wa.me/' + String(CFG.WHATSAPP_NUMBER || '').replace(/\D/g, '') +
      '?text=' + encodeURIComponent(msg || CFG.WHATSAPP_MESSAGE || '');
  }
  function syncContactLinks() {
    d.querySelectorAll('a[data-wa]').forEach(function (a) {
      a.href = waUrl(a.getAttribute('data-wa-msg') === 'thankyou' ? CFG.THANKYOU_WHATSAPP_MESSAGE : CFG.WHATSAPP_MESSAGE);
      a.target = '_blank'; a.rel = 'noopener';
    });
    d.querySelectorAll('a[data-tel]').forEach(function (a) { if (CFG.PHONE_NUMBER) a.href = 'tel:' + CFG.PHONE_NUMBER; });
  }

  /* ---------- Auto events ---------- */
  function bindEvents() {
    // WhatsApp + phone clicks (click_location from data-loc)
    d.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[data-wa], a[data-tel]');
      if (!a) return;
      rememberEarlyClick(a);
      var loc = a.getAttribute('data-loc') || 'unknown';
      track(a.hasAttribute('data-wa') ? 'whatsapp_click' : 'phone_click', { click_location: loc });
    });

    // FAQ opens
    d.querySelectorAll('[data-faq] details').forEach(function (det) {
      det.addEventListener('toggle', function () {
        if (!det.open) return;
        var q = det.querySelector('summary');
        track('faq_open', { faq_question: q ? q.textContent.trim().slice(0, 100) : '' });
      });
    });

    // Scroll depth 75% (once per page view)
    var scrolled = false;
    function onScroll() {
      if (scrolled) return;
      var h = d.documentElement;
      var pct = (h.scrollTop + w.innerHeight) / h.scrollHeight;
      if (pct >= 0.75) { scrolled = true; track('scroll_75', { percent_scrolled: 75 }); w.removeEventListener('scroll', onScroll); }
    }
    w.addEventListener('scroll', onScroll, { passive: true });

    // Lite YouTube facade: iframe only loads on tap
    d.querySelectorAll('[data-yt]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = (btn.getAttribute('data-yt') || '').replace(/[^\w-]/g, '');
        if (!id) return;
        var f = d.createElement('iframe');
        f.className = 'yt-frame';
        f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1&playsinline=1';
        f.title = btn.getAttribute('aria-label') || 'Video';
        f.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
        f.allowFullscreen = true;
        btn.replaceWith(f);
        track('video_play', { video_id: id, video_location: btn.getAttribute('data-loc') || '' });
      });
    });
  }

  w.LP = { track: track, getAttribution: getAttribution, waUrl: waUrl, kw: KW, debug: DEBUG, log: log,
    platform: traffic.platform, aiReferrer: traffic.ai };

  // One context event per page view. In GTM use it as a Custom Event trigger, or read the variables
  // (traffic_platform, ai_referrer, kw) to segment audiences and reports. Nothing fires unless a tag is attached to it.
  w.dataLayer.push({ event: 'lp_context', lp_page: CFG.PAGE || '', traffic_platform: traffic.platform, ai_referrer: traffic.ai, kw: KW });
  log('traffic source', traffic);

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init);
  else init();
  function init() { syncContactLinks(); bindEvents(); }
})();
