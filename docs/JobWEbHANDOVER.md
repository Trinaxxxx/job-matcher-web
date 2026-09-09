# Job Matcher Web — Project Handover

**As of:** 2026-09-09
**Branch:** `security/harden-abcH` (not pushed to any remote)
**Working tree:** several uncommitted feature changes present (guest mode, locations, AI rescore, profile link)

---

## What this project is

A Next.js 16 web app that matches a user's CV against scraped job postings. Users sign in, upload a CV + answer a questionnaire, provide their **own Apify API key**, run a LinkedIn scrape, get keyword-scored/ranked results, and export to Excel/CSV. An optional Gemini AI re-rank layer exists but is a deferred/placeholder path. Auth is hand-rolled (bcrypt + `jose` JWT session cookie).

## Overall status

The app **works end-to-end locally except the live Apify scrape step** (needs a real Apify key + one real run to confirm). Security hardening is largely done and committed. A batch of feature work (guest mode, single-location, profile tweaks, AI rescore) is **implemented but uncommitted** on the branch. The big planned feature — **invite-only signup + guest demo** — is **decided and planned but only partially built** (guest mode landed; invites not yet).

---

## Session-by-session status

### Security track (mostly done, committed)

| Session | Status | Notes |
|---|---|---|
| **Web app security** | Shipped | Added Upstash rate limiting (login/signup/search), security headers/CSP in `next.config.ts`, `.env.example`. Committed as `7eb1933`. |
| **npm audit** | Done | 0 runtime vulns; 3 high are Prisma CLI build-time only — deliberately **not** force-fixed (would downgrade Prisma). Then ran a full source security audit (findings A–H). |
| **Security audit findings** | Shipped | Fixed enumeration, login timing, session TTL (30→7d), CV magic-bytes. Committed as `74fd39d`. 26/26 tests pass. |
| **Database migrations baseline** | Shipped | Prisma `0_init` baseline committed as `c21fbff`; resolved a pooler/migration-tracking snag. |

### Feature track (implemented, uncommitted)

| Session | Status | Notes |
|---|---|---|
| **Guest mode access** | Built & verified, uncommitted | `POST /api/auth/guest` + "Continue as guest" button; `isGuest` column + migration applied to DB. |
| **Locations field / single-location scraping** | Built & verified, uncommitted | Relabeled "Preferred locations"→"Location"; scrape now uses only first location. |
| **Apify API key link in profile** | Built, uncommitted | Step 3 now links to https://apify.com/. |
| **Gemini re-rank decision** | Partial | AI rescore implemented; produced `docs/HANDOVER_AI_RESCORE_AND_SCRAPE_QA.md`. Surfaced 3 real defects (below). |

### Advisory / planning (no code, decisions captured)

| Session | Status |
|---|---|
| **Web app development fundamentals** | Docs completed & accurate; decided **not** to write a fluffy VISION doc — lean north-star in `OPEN_QUESTIONS.md` instead. Decisions captured for guest/invite/APAC/migrations. |
| **App functionality testing** | Paused — hit a recurring Supabase idle-connection drop; recommended switching local to session connection (port 5432 / `DIRECT_URL`). Also correctly flagged parallel-session edits. |
| **Job search run limits** | Answered: 50-job cap per run (hardcoded), then filtered/deduped; ≤6 title keywords. |
| **Organization name brainstorm** | Non-code. Landed on brand name **"Makeshift"** (with "Labs/Studio" as trust-context variant). |

---

## Known defects / open issues (highest value first)

1. **Scraper field mapping is a guess** — job **titles missing** and **links not clickable** because `src/lib/apify.ts` guesses the `worldunboxer/rapid-linkedin-scraper` output keys. **Needs one real Apify run** to read actual field names. *(Biggest, most concrete blocker to a working demo.)*
2. **Results ignore profile/filters (by design)** — the keyword scorer is a *ranker, not a filter*; every non-excluded job is saved with no score floor, location only adds +8. Fix: add a minimum keep-score and enforce preferred location post-scrape.
3. **AI path untested** — 3/3 tests only cover the no-key early return; the whole Gemini path (model call, merge, catch) is unmocked. Verify `@ai-sdk/google@^4` + `ai@^7` pairing (failures are silently swallowed).
4. **Supabase idle-connection drops** locally — switch local `.env.local` to the session connection (5432) for stability.

---

## Action items / next steps

### Immediate (housekeeping)
- [ ] **Commit the uncommitted feature work** on `security/harden-abcH` (guest mode, location changes, profile link, AI rescore) — currently at risk of being lost.
- [ ] Decide on pushing the branch to GitHub (repo is **local-only**, no remote, `gh` not logged in — needs interactive `gh auth login` by you). Confirm secrets are gitignored before any push.

### To get a working demo
- [ ] Get an **Apify key**, run one real scrape, capture actual dataset field names → fix `src/lib/apify.ts` mapping (fixes defect #1).
- [ ] Add a **score floor + location enforcement** (defect #2).
- [ ] Switch local DB to session connection to stop idle crashes.

### Planned feature — invite-only + guest demo (decided, guest half done)
- [ ] Build remaining pieces: `Invite` model + migration, invite-gated signup, admin invite endpoint, `isAdmin` flag seeded for `petrina.kinzel@gmail.com`, expired-guest cleanup.
- Decisions locked:
  - Invites **bind to a specific email**, single-use, admin-created.
  - Guest = **real throwaway account**, **30 min** TTL, action-capped, can export Excel/CSV, **data auto-deleted on expiry**.
  - **Extend existing auth** (migrate to Auth.js/Clerk only when you need password reset / social login / instant revocation).
  - Admin = `isAdmin` flag on `User`, seeded for `petrina.kinzel@gmail.com`.

### Pre-launch config (from security review — no code, all env)
- [ ] Set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` in prod (rate limiting **silently disables** without them).
- [ ] Set strong random `AUTH_SECRET` + `ENCRYPTION_KEY` (⚠️ changing `ENCRYPTION_KEY` orphans all stored Apify keys); use managed Postgres (Neon), TLS only.
- [ ] When wiring Gemini for real: treat scraped text as untrusted (prompt-injection), constrain/validate output, cap tokens.

### Lower priority
- [ ] Add mocked-model AI tests (defect #3).
- [ ] APAC job sources (isolated to `apify.ts`).
- [ ] Guest cleanup cron + "browsing as guest" banner.
- [ ] Optional admin UI page for invites.

---

## Reference docs (in-repo)

- `docs/OPEN_QUESTIONS.md` — decisions / north-star
- `docs/HANDOVER_AI_RESCORE_AND_SCRAPE_QA.md` — AI rescore + scrape QA detail
- `docs/DEPLOYMENT.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/USER_GUIDE.md`, `docs/CONTRIBUTING.md`

## Commit history (branch `security/harden-abcH`)

```
c21fbff Baseline Prisma migrations (0_init) from existing schema
74fd39d Harden auth & CV upload: enumeration, timing, session TTL, magic bytes
7eb1933 Harden API: IP-spoof-safe rate limiting, CSV injection, input validation
d827912 Initial Job Matcher web app (Gemini/hosted edition)
640a8ad Initial commit from Create Next App
```
