/* ==========================================================================
   /cyber-security — page CONFIG
   Loaded BEFORE /shared/tracking.js and /shared/form.js (all `defer`, order matters).
   Every value marked [PLACEHOLDER] / [CONFIRM] is listed in CONTENT-CHECKLIST.md.
   ========================================================================== */
window.LP_CONFIG = {
  PAGE: 'cyber-security',
  PAGE_NAME: 'Live Online Cyber Security Course',
  // Shown in the Sheet 'Source' column as '<SOURCE_LABEL> - Hero / Final CTA / Fees / Syllabus / Compare'
  SOURCE_LABEL: 'Landing page Online Cyber Security',

  // Google Tag Manager container. While it is 'GTM-XXXXXXX' GTM is not loaded.
  GTM_ID: 'GTM-TFGRSK64',

  // Google Apps Script web app URL (see /integrations/google-sheet.gs). Must start with https://
  // Deployment 'LP leads v3' on the copied leads Sheet (12 Oct 2026; the old Sheet had no deploy access).
  FORM_ENDPOINT: 'https://script.google.com/macros/s/AKfycbyqtlHdq2gqf6W4rPbBRqu9dJtTpzh_jxAAh2GFVznUbKqZB6I1FzJ-0nfVaksOZU2VDg/exec',

  // Contact. Digits only for WhatsApp (country code first). [CONFIRM] Taken from the current ads page.
  WHATSAPP_NUMBER: '919895705599', // all contact numbers updated to 98957 05599 (Oct 2026)
  PHONE_NUMBER: '+919895705599',
  WHATSAPP_MESSAGE: 'Hi Knoa Labs, I want the fees and next batch details for the Live Online Cyber Security course.',
  THANKYOU_WHATSAPP_MESSAGE: 'Hi Knoa Labs, I just enquired about the Live Online Cyber Security course. Please share fees and next batch details.',

  // Absolute paths: clean URLs have no trailing slash, so relative paths would break.
  THANK_YOU_URL: '/cyber-security/thank-you',
  SYLLABUS_URL: '/cyber-security/assets/knoa-labs-cyber-security-syllabus-v5.pdf',

  // ?kw= whitelist. The H1 swap itself happens in the inline <head> script of index.html (before paint)
  // via html[data-kw] + CSS. Keep both lists in sync.
  KEYWORDS: ['hacking', 'analyst'],

  // Google Ads conversions: configured in GTM only (see TRACKING.md). Link IDs / the success form match those triggers.
};
