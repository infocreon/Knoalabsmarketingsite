/* ==========================================================================
   /Generativeai&Agenticai/online-course — page CONFIG
   Loaded BEFORE /shared/tracking.js and /shared/form.js (all `defer`, order matters).

   WHY THIS URL: the existing GTM triggers (container GTM-TFGRSK64) for the Gen AI campaign fire on
     - Form Submission ....... Page Path contains  Generativeai&Agenticai
     - Call (Click - Links) .. Click URL contains tel:+919895705599            AND Page Path contains /Generativeai&Agenticai/
     - WhatsApp (Click-Links)  Click URL contains https://wa.me/919895705599   AND Page Path contains /Generativeai&Agenticai/
   The LP project strips trailing slashes, so the page sits one level deeper (/online-course) to keep
   "/Generativeai&Agenticai/" inside the path. Do NOT rename this folder or GTM stops counting leads.

   The thank-you page lives OUTSIDE that path (/generative-ai/thank-you) on purpose: WhatsApp/call taps there
   come from people who already submitted the form, so they must not fire a second conversion.
   ========================================================================== */
window.LP_CONFIG = {
  PAGE: 'gen-ai',
  PAGE_NAME: 'Live Online Generative AI & Agentic AI Course',
  // Shown in the Sheet 'Source' column as '<SOURCE_LABEL> - Hero / Final CTA / Fees / Syllabus / Compare'
  SOURCE_LABEL: 'Landing page Online Gen AI',

  // Google Tag Manager container (same container as /cyber-security)
  GTM_ID: 'GTM-TFGRSK64',

  // Dedicated GenAI Apps Script (Sheet "Knoa Labs — GenAI Leads New", code: integrations/google-sheet-genai.gs).
  // Same URL is used by the old ads.knoalabs.com page (JSON + secret), so never create a new deployment.
  FORM_ENDPOINT: 'https://script.google.com/macros/s/AKfycbzh4V6Lvduhe6dt_0NCmIJCb7DOqE3_Qz5ThcMaYEGYBIFtSxoECec8X5EhEZ-LBS8j/exec',

  // Contact: calls + WhatsApp on 98957 05599 (changed 2026-09-25). GTM Call/WhatsApp triggers must match this number.
  WHATSAPP_NUMBER: '919895705599',
  PHONE_NUMBER: '+919895705599',
  WHATSAPP_MESSAGE: 'Hi Knoa Labs, I want the fees and next batch details for the Live Online Gen AI & Agentic AI course.',
  THANKYOU_WHATSAPP_MESSAGE: 'Hi Knoa Labs, I just enquired about the Live Online Gen AI & Agentic AI course. Please share fees and next batch details.',

  // Absolute paths (clean URLs, no trailing slash)
  THANK_YOU_URL: '/generative-ai/thank-you',

  // ?kw= whitelist. The H1 swap happens in the inline <head> script of index.html (before paint)
  // via html[data-kw] + CSS. Keep all three lists in sync (here, index.html <head>, page.css).
  //   ?kw=agentic      → Agentic AI ad group
  //   ?kw=certificate  → AI certification / "with certificate" keywords
  KEYWORDS: ['agentic', 'certificate']
};
