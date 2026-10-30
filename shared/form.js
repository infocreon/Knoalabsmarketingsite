/* ==========================================================================
   Knoa Labs LP — shared lead form handler
   Works on every <form data-lead-form data-location="..."> on the page.
   - Visible fields: name, phone (10-digit Indian mobile), email (validated when present), user_type
   - Honeypot, junk-number rejection, double-submit block
   - "Is this number correct?" step before saving (shows +91 XXXXX XXXXX with Yes / Edit)
   - Hidden attribution fields (gclid, gbraid, wbraid, UTMs, kw, intent, page, landing URL, timestamp)
   - POST to LP_CONFIG.FORM_ENDPOINT (Google Apps Script), then redirect to LP_CONFIG.THANK_YOU_URL
   - dataLayer: lead_form_submit (once per session, success only) + syllabus_request / demo_request
   - Enhanced conversions: SHA-256 of +91XXXXXXXXXX pushed as user_data.sha256_phone_number (Google format) and of
     91XXXXXXXXXX as user_data.sha256_phone_number_meta (Meta format); email as user_data.sha256_email_address
   - CTA buttons with [data-open-form="enquiry|syllabus|demo"] open the modal form (#lead-modal)
   ========================================================================== */
(function () {
  'use strict';

  var CFG = window.LP_CONFIG || {};
  var d = document;
  var LP = window.LP || { track: function () {}, getAttribution: function () { return {}; }, log: function () {} };

  var PHONE_RE = /^[6-9]\d{9}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  var JUNK = ['1234567890', '9876543210', '9123456789', '9999999999', '9898989898', '9000000000'];
  var HIDDEN = ['gclid', 'gbraid', 'wbraid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'kw', 'page', 'landing_url', 'timestamp', 'form_location', 'source'];
  // Sheet "Source" = <SOURCE_LABEL> - <form name> (<where the form/button is>), e.g.
  // "Landing page Online Cyber Security - Demo Class Form (Hero)"
  var LOCATION_LABELS = { hero: 'Hero', final: 'Final CTA', fees: 'Fees', curriculum: 'Curriculum', compare: 'Compare',
    projects: 'Projects', enquiry: 'Popup', seat: 'Fees', syllabus: 'Syllabus', demo: 'Demo', modal: 'Popup', cta: 'Button' };
  var FORM_NAMES = { enquiry: 'Enquiry Form', syllabus: 'Syllabus Form', demo: 'Demo Class Form' };
  function sourceLabel(form) {
    var loc = (form.getAttribute('data-location') || '').replace(/^(modal|demo)_/, '');
    var intent = (form.elements.intent && form.elements.intent.value) || 'enquiry';
    return (CFG.SOURCE_LABEL || CFG.PAGE || '') + ' - ' + (FORM_NAMES[intent] || 'Enquiry Form') +
      ' (' + (LOCATION_LABELS[loc] || loc || 'Form') + ')';
  }

  var MODAL_COPY = {
    enquiry: { title: 'Get Fees & Batch Details', sub: 'Fee structure and batch timings on WhatsApp.', btn: 'Get Fees & Batch Details' },
    seat: { title: 'Reserve your seat', sub: 'Share your details and our advisor will confirm your seat and the fee on WhatsApp.', btn: 'Get Fees & Batch Details' },
    syllabus: { title: 'Download the full syllabus', sub: 'Get the PDF instantly on the next page, plus a copy on WhatsApp.', btn: 'Get the Syllabus PDF' },
    demo: { title: 'Join a free 45-minute live demo class', sub: 'We’ll WhatsApp you the next demo date and joining link.', btn: 'Book My Free Demo Seat' }
  };

  /* ---------- Helpers ---------- */
  function digits(v) { return String(v || '').replace(/\D/g, ''); }
  function normalisePhone(v) {
    var n = digits(v);
    if (n.length === 12 && n.indexOf('91') === 0) n = n.slice(2);
    if (n.length === 11 && n.charAt(0) === '0') n = n.slice(1);
    return n;
  }
  function isJunk(n) {
    if (JUNK.indexOf(n) > -1) return true;
    if (/^(\d)\1{9}$/.test(n)) return true;
    var distinct = {};
    for (var i = 0; i < n.length; i++) distinct[n[i]] = 1;
    return Object.keys(distinct).length < 3; // e.g. 9898989898, 9999900000
  }
  function sha256Hex(str) {
    if (!window.crypto || !crypto.subtle || !window.TextEncoder) return Promise.resolve('');
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }).catch(function () { return ''; });
  }
  function setError(form, name, msg) {
    var input = form.elements[name];
    if (!input) return;
    var err = d.getElementById(input.getAttribute('aria-describedby'));
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (err) err.textContent = msg || '';
  }

  /* ---------- Hidden fields ---------- */
  function ensureHidden(form) {
    HIDDEN.concat(['intent']).forEach(function (name) {
      if (!form.elements[name]) {
        var i = d.createElement('input');
        i.type = 'hidden'; i.name = name;
        if (name === 'intent') i.value = 'enquiry';
        form.appendChild(i);
      }
    });
    fillHidden(form);
  }
  function fillHidden(form) {
    var a = LP.getAttribution();
    ['gclid', 'gbraid', 'wbraid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'kw']
      .forEach(function (k) { form.elements[k].value = a[k] || ''; });
    form.elements.page.value = CFG.PAGE || '';
    form.elements.landing_url.value = location.href.split('#')[0].slice(0, 500);
    form.elements.timestamp.value = new Date().toISOString();
    var loc = form.getAttribute('data-location') || '';
    form.elements.form_location.value = loc;
    form.elements.source.value = sourceLabel(form);
  }

  /* ---------- Validation ---------- */
  function validate(form) {
    var ok = true;
    var name = form.elements.name.value.trim();
    var phone = normalisePhone(form.elements.phone.value);
    var type = form.elements.user_type.value;
    var emailEl = form.elements.email;
    var email = emailEl ? emailEl.value.trim().toLowerCase() : '';

    if (name.length < 2 || !/[a-zA-Zऀ-ൿ]/.test(name)) { setError(form, 'name', 'Please enter your name.'); ok = false; }
    else setError(form, 'name', '');

    if (!PHONE_RE.test(phone) || isJunk(phone)) { setError(form, 'phone', 'Enter a valid 10-digit mobile number.'); ok = false; }
    else setError(form, 'phone', '');

    if (emailEl) {
      if ((emailEl.required || email) && !EMAIL_RE.test(email)) { setError(form, 'email', 'Enter a valid email address.'); ok = false; }
      else setError(form, 'email', '');
    }

    if (!type) { setError(form, 'user_type', 'Please choose one option.'); ok = false; }
    else setError(form, 'user_type', '');

    if (!ok) {
      var first = form.querySelector('[aria-invalid="true"]');
      if (first) first.focus();
    }
    return ok ? { name: name.slice(0, 60), phone: phone, email: email.slice(0, 120), user_type: type } : null;
  }

  /* ---------- Submit ---------- */
  function send(body) {
    var endpoint = CFG.FORM_ENDPOINT || '';
    if (!/^https:\/\//.test(endpoint)) {
      if (/^(localhost|127\.0\.0\.1)$|\.vercel\.app$/.test(location.hostname)) {
        // Not configured yet: simulate success so the flow can be tested locally / on previews.
        console.warn('[LP] FORM_ENDPOINT not set in page.js — lead NOT saved (simulated success).');
        return new Promise(function (r) { setTimeout(function () { r({ ok: true, simulated: true }); }, 400); });
      }
      // Live domain without an endpoint: never fake a success. Hand the enquiry to WhatsApp instead.
      return Promise.resolve({ ok: false, error: 'no_endpoint' });
    }
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 15000);
    // form-urlencoded = "simple" CORS request: no preflight, Apps Script returns readable JSON.
    return fetch(endpoint, { method: 'POST', body: body, signal: ctrl && ctrl.signal, redirect: 'follow' })
      .then(function (res) { return res.json(); })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function onSubmit(e) {
    e.preventDefault();
    // Keep GTM's Form Submission trigger from seeing raw (unvalidated, unsaved) submits.
    // It fires only for the success form below, after the lead is saved.
    e.stopPropagation();
    var form = e.currentTarget;
    var btn = form.querySelector('[type="submit"]');
    var status = form.querySelector('.form-status');
    if (form.dataset.busy === '1') return; // double-submit block
    if (status) status.textContent = '';

    var data = validate(form);
    if (!data) return;

    var intent = form.elements.intent.value || 'enquiry';
    var redirect = function () {
      try {
        sessionStorage.setItem('lp_lead_name', data.name.split(' ')[0]);
        sessionStorage.setItem('lp_lead_intent', intent);
      } catch (err) {}
      // Only the (non-personal) intent goes in the URL.
      location.href = (CFG.THANK_YOU_URL || './thank-you') + (intent !== 'enquiry' ? '?intent=' + encodeURIComponent(intent) : '');
    };

    // Honeypot: bots get a fake success, nothing is sent or tracked.
    if (form.elements.website && form.elements.website.value) { LP.log('honeypot hit'); redirect(); return; }

    // Number check: show the number back and save only after "Yes" (cuts mistyped numbers)
    if (form.dataset.confirmedPhone !== data.phone) { showConfirm(form, data.phone); return; }

    form.dataset.busy = '1';
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    var label = btn.textContent;
    btn.dataset.label = label;
    btn.textContent = 'Sending…';

    fillHidden(form);
    var body = new URLSearchParams(new FormData(form));
    body.set('phone', '+91' + data.phone);
    body.set('name', data.name);
    if (form.elements.email) body.set('email', data.email);
    body.delete('website');

    send(body).then(function (res) {
      if (res && res.error === 'no_endpoint') {
        var sel = form.elements.user_type;
        var msg = (CFG.WHATSAPP_MESSAGE || 'Hi Knoa Labs') + '\nName: ' + data.name +
          (data.email ? '\nEmail: ' + data.email : '') +
          '\nI am: ' + sel.options[sel.selectedIndex].text;
        LP.track('whatsapp_click', { click_location: 'form_fallback' });
        location.href = LP.waUrl ? LP.waUrl(msg) : 'https://wa.me/' + CFG.WHATSAPP_NUMBER + '?text=' + encodeURIComponent(msg);
        return;
      }
      if (!res || res.ok !== true) throw new Error((res && res.error) || 'Bad response');

      signalFormSuccess(form, intent);
      // Google wants the phone as E.164 with a plus (+919847123456). Meta wants digits only, country code first, no plus
      // (919847123456). Same number, two normalisations, so each platform's matching works. Email is lower-cased for both.
      return Promise.all([sha256Hex('+91' + data.phone), data.email ? sha256Hex(data.email) : '', sha256Hex('91' + data.phone)]).then(function (hashes) {
        var ud = {};
        if (hashes[0]) ud.sha256_phone_number = hashes[0];
        if (hashes[1]) ud.sha256_email_address = hashes[1];
        if (hashes[2]) ud.sha256_phone_number_meta = hashes[2];
        var kw = form.elements.kw.value || '';
        // One id per lead. Google Ads uses it as transaction_id; Meta (Pixel + Conversions API) uses the same value as
        // event_id, so a browser event and a server event for the same lead are counted once.
        var leadId = 'kl-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        var plat = LP.platform || '';
        if (intent === 'syllabus') LP.track('syllabus_request', { user_type: data.user_type, kw: kw, traffic_platform: plat });
        if (intent === 'demo') LP.track('demo_request', { user_type: data.user_type, kw: kw, traffic_platform: plat });
        LP.track('lead_form_submit', {
          user_type: data.user_type, intent: intent, kw: kw, form_location: form.getAttribute('data-location') || '',
          transaction_id: leadId, event_id: leadId, traffic_platform: plat,
          user_data: (ud.sha256_phone_number || ud.sha256_email_address) ? ud : undefined
        }, { once: 'lead_form_submit', callback: redirect, timeout: 1500 });
      });
    }).catch(function (err) {
      LP.log('submit failed', err);
      form.dataset.busy = '0';
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.textContent = label;
      if (status) status.textContent = 'Sorry, that didn’t go through. Please try again, or WhatsApp us.';
    });
  }

  /* ---------- Confirm number ----------
     Replaces the submit button with "We'll WhatsApp you on +91 XXXXX XXXXX. Is this correct?" [Yes] [Edit].
     "Yes" stores the confirmed number on the form and submits again; changing the number resets it. */
  function prettyPhone(n) { return '+91 ' + n.slice(0, 5) + ' ' + n.slice(5); }
  function hideConfirm(form) {
    var box = form.querySelector('.phone-confirm');
    if (box) box.hidden = true;
    form.querySelector('[type="submit"]').hidden = false;
  }
  function showConfirm(form, phone) {
    var btn = form.querySelector('[type="submit"]');
    var box = form.querySelector('.phone-confirm');
    if (!box) {
      box = d.createElement('div');
      box.className = 'phone-confirm';
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'Confirm your mobile number');
      box.innerHTML = '<p class="phone-confirm__q">We’ll WhatsApp you on <strong data-confirm-number></strong>Is this number correct?</p>' +
        '<div class="phone-confirm__actions">' +
        '<button type="button" class="btn btn--primary" data-confirm-yes>Yes, it’s correct</button>' +
        '<button type="button" class="btn btn--outline" data-confirm-edit>Edit number</button></div>';
      btn.parentNode.insertBefore(box, btn);
      box.querySelector('[data-confirm-yes]').addEventListener('click', function () {
        form.dataset.confirmedPhone = box.getAttribute('data-phone');
        hideConfirm(form);
        if (form.requestSubmit) form.requestSubmit(btn);
        else btn.click();
      });
      box.querySelector('[data-confirm-edit]').addEventListener('click', function () {
        hideConfirm(form);
        LP.track('phone_confirm_edit', { form_location: form.getAttribute('data-location') || '' });
        form.elements.phone.focus();
        form.elements.phone.select();
      });
    }
    box.setAttribute('data-phone', phone);
    box.querySelector('[data-confirm-number]').textContent = prettyPhone(phone);
    box.hidden = false;
    btn.hidden = true;
    box.querySelector('[data-confirm-yes]').focus();
  }

  /* ---------- GTM Form Submission signal ----------
     GTM's "Form Submission" trigger listens for native submit events. The visible forms stop theirs (see onSubmit),
     and once the Apps Script confirms the save we submit a tiny hidden form instead. It posts nothing useful:
     it targets a hidden iframe and loads /robots.txt, so the page never navigates and GTM settings
     ("Wait for tags" / "Check validation") work either way. Form ID: kl-lead-form, Form Classes: kl-lead-<intent>. */
  function signalFormSuccess(form, intent) {
    try {
      var sink = d.getElementById('kl-sink');
      if (!sink) {
        sink = d.createElement('iframe');
        sink.name = sink.id = 'kl-sink';
        sink.title = 'hidden';
        sink.tabIndex = -1;
        sink.setAttribute('aria-hidden', 'true');
        sink.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
        d.body.appendChild(sink);
      }
      var f = d.createElement('form');
      f.id = 'kl-lead-form';
      f.className = 'kl-lead-' + intent;
      f.method = 'get';
      f.action = '/robots.txt';
      f.target = 'kl-sink';
      f.setAttribute('data-location', form.getAttribute('data-location') || '');
      f.style.display = 'none';
      d.body.appendChild(f);
      if (f.requestSubmit) f.requestSubmit();
      else f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      LP.log('GTM form-success signal sent (#kl-lead-form)');
      setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 3000);
    } catch (err) { LP.log('form-success signal failed', err); }
  }

  /* ---------- Modal ---------- */
  function initModal() {
    var modal = d.getElementById('lead-modal');
    if (!modal) return;
    var form = modal.querySelector('form');
    var title = modal.querySelector('[data-modal-title]');
    var sub = modal.querySelector('[data-modal-sub]');
    var btn = form.querySelector('[type="submit"]');

    d.addEventListener('click', function (e) {
      var trigger = e.target.closest && e.target.closest('[data-open-form]');
      if (!trigger) return;
      e.preventDefault();
      var key = trigger.getAttribute('data-open-form');
      var copy = MODAL_COPY[key] || MODAL_COPY.enquiry;
      // "seat" is a normal enquiry in reporting
      form.elements.intent.value = (key === 'syllabus' || key === 'demo') ? key : 'enquiry';
      form.setAttribute('data-location', 'modal_' + (trigger.getAttribute('data-loc') || key));
      title.textContent = copy.title;
      sub.textContent = copy.sub;
      btn.textContent = copy.btn;
      if (typeof modal.showModal === 'function') modal.showModal();
      else { // very old browsers: scroll to the hero form instead
        var hero = d.getElementById('enquire');
        if (hero) hero.scrollIntoView();
        return;
      }
      setTimeout(function () { form.elements.name.focus(); }, 30);
    });
    modal.querySelector('[data-modal-close]').addEventListener('click', function () { modal.close(); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.close(); }); // backdrop tap
  }

  /* ---------- Extra dialogs (e.g. the separate demo-class form) ----------
     Any element with data-open-dialog="<dialog id>" opens that dialog. Its form's data-location becomes
     "<data-loc-prefix>_<button data-loc>" so the Sheet shows which button was used. */
  function initDialogs() {
    d.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-open-dialog]');
      if (!t) return;
      var dlg = d.getElementById(t.getAttribute('data-open-dialog'));
      if (!dlg || typeof dlg.showModal !== 'function') return; // old browsers follow the link to the hero form
      e.preventDefault();
      var f = dlg.querySelector('form[data-lead-form]');
      if (f) f.setAttribute('data-location', (dlg.getAttribute('data-loc-prefix') || 'dialog') + '_' + (t.getAttribute('data-loc') || 'cta'));
      dlg.showModal();
      LP.track('dialog_open', { dialog: dlg.id, click_location: t.getAttribute('data-loc') || '' });
      setTimeout(function () { if (f && f.elements.name) f.elements.name.focus(); }, 30);
    });
    d.querySelectorAll('dialog').forEach(function (dlg) {
      if (dlg.id === 'lead-modal') return; // handled by initModal
      dlg.querySelectorAll('[data-modal-close]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); }); // backdrop tap
    });
  }

  /* ---------- Init ---------- */
  function init() {
    d.querySelectorAll('form[data-lead-form]').forEach(function (form) {
      ensureHidden(form);
      form.addEventListener('submit', onSubmit);
      // Keep only digits in the phone box, clear errors as the user fixes them
      var ph = form.elements.phone;
      ph.addEventListener('input', function () {
        var v = ph.value.replace(/[^\d+ ]/g, '');
        if (v !== ph.value) ph.value = v;
        if (ph.getAttribute('aria-invalid') === 'true' && PHONE_RE.test(normalisePhone(v))) setError(form, 'phone', '');
        if (form.dataset.confirmedPhone && normalisePhone(v) !== form.dataset.confirmedPhone) delete form.dataset.confirmedPhone;
        hideConfirm(form); // a changed number must be confirmed again
      });
      // Clear errors while typing ('input'), never on blur ('change' on text fields): removing an error line
      // on blur shifts the submit button mid-tap and the tap misses it. The select only fires 'change' on pick.
      ['name', 'email'].forEach(function (n) {
        if (!form.elements[n]) return;
        form.elements[n].addEventListener('input', function () {
          if (form.elements[n].getAttribute('aria-invalid') === 'true' && form.elements[n].value.trim()) setError(form, n, '');
        });
      });
      form.elements.user_type.addEventListener('change', function () { if (form.elements.user_type.value) setError(form, 'user_type', ''); });
    });
    initModal();
    initDialogs();
    // bfcache: re-enable buttons when the user comes back from the thank-you page
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      d.querySelectorAll('form[data-lead-form]').forEach(function (f) {
        f.dataset.busy = '0';
        var b = f.querySelector('[type="submit"]');
        b.disabled = false; b.removeAttribute('aria-busy');
        if (b.dataset.label) b.textContent = b.dataset.label;
      });
    });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init);
  else init();
})();
