# Start here

1. Read `docs/AUDIT-REPORT.md` (findings, what changed, your to-do list).
2. **The "page can't be reached" problem is most likely DNS, not code**: `docs/REACHABILITY.md`. Prove it with `node scripts/check-site.mjs` from the affected network.
3. Deploy: `deploy/DEPLOY.md`. Before deploying: `node scripts/audit.mjs`.
4. Ads (Google, YouTube, Meta, Microsoft, LinkedIn, AI assistants): `docs/ADS-AND-TRACKING.md`.
5. SEO / AEO / GEO / AX: `docs/SEO-AEO-GEO.md`.

Local preview with production headers: `node scripts/serve.mjs` then open http://localhost:4173
