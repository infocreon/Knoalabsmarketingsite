/* ==========================================================================
   / (homepage) — page CONFIG for /shared/tracking.js
   The homepage has no lead form. It loads GTM so organic, AI-assistant (ChatGPT, Perplexity, Gemini, Claude ...)
   and direct visits are measured: tracking.js pushes `lp_context` with traffic_platform / ai_referrer on every view.
   WhatsApp / phone taps on this page push whatsapp_click / phone_click events. The Google Ads conversion triggers in
   GTM are limited to the course pages by Page Path, so homepage taps do not count as ad conversions.
   ========================================================================== */
window.LP_CONFIG = {
  PAGE: 'home',
  PAGE_NAME: 'Knoa Labs Live Online Courses (home)',
  GTM_ID: 'GTM-TFGRSK64',
  WHATSAPP_NUMBER: '919895705599',
  PHONE_NUMBER: '+919895705599',
  WHATSAPP_MESSAGE: 'Hi Knoa Labs, I want the fees and next batch details for your live online courses.',
  KEYWORDS: []
};
