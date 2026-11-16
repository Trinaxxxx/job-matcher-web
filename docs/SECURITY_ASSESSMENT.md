# Security Assessment

Audit of `job-matcher-web` against the 17-point web-app security checklist.
Date: 2026-11-16 · Branch: `a11y-fixes-and-search-queue-scaffold`

**Stack:** Next.js 16 (App Router), Prisma + Postgres (Neon), custom auth
(bcrypt + `jose` JWT in an httpOnly cookie), Upstash rate limiting, Inngest
background queue, Zod validation, AES-256-GCM for secrets at rest.

Overall this is a **strong** security posture for an app of this size — ownership
isolation, headers, encryption-at-rest, and anti-enumeration are all done well.
The findings below are mostly hardening and operational gaps, not open holes.

---

## Priority findings (worth acting on)

### 1. Rate limiting fails *open* in production — High
`src/lib/ratelimit.ts`: if `UPSTASH_REDIS_REST_URL`/`_TOKEN` are unset, every
limiter is `null` and `checkRateLimit` returns `true` (allow). Production only
emits a `console.warn`. A deploy that forgets the Upstash vars silently loses
all brute-force, credential-stuffing, and Apify-cost protection with no hard
signal. **Fix:** in `NODE_ENV === "production"`, throw on startup (or fail the
limited requests closed) when Upstash is not configured. (Checklist 1, 14)

### 2. Inngest signing/event keys are undocumented — Medium
`src/app/api/inngest/route.ts` exposes a public `serve()` endpoint; the worker
trusts `event.data.userId`. Inngest validates this endpoint with
`INNGEST_SIGNING_KEY` and `inngest.send()` needs `INNGEST_EVENT_KEY`, but
neither appears in `.env.example`. A deploy missing them either can't run or
(worse, depending on SDK mode) accepts unsigned invocations. **Fix:** add both
to `.env.example` and require them in production. (Checklist 2, 4)

### 3. Zod high-severity advisory — Medium (partially fixed)
GHSA-mrhx-c7xc-m3w5 (memory exhaustion on oversized constrained collections).
Our **direct** zod — the input-validation layer, the part on the real attack
surface — is already on the patched line (`4.6.7`); the declared range is now
pinned to `^4.6.6` so a fresh install can't regress. The remaining `npm audit`
hit is a **transitive** copy nested under `inngest@4.26.2`, which depends on
`zod ^3.25.0`. The fix never landed on zod's 3.x line (tops out at the affected
`3.25.76`), and no `inngest` release uses zod v4, so this can't be cleared
without breaking the queue. **Tracked upstream**: upgrade `inngest` once it
moves to zod ≥4.6.6. Exposure is low — it validates Inngest's own internal
schemas, not user-facing request bodies. (Checklist 13)

### 4. CSP allows `unsafe-inline` **and** `unsafe-eval` — Medium
`next.config.ts` `script-src` includes both. `unsafe-eval` meaningfully weakens
XSS containment and is usually not required by Next App Router at runtime.
**Fix:** drop `unsafe-eval` and verify; longer-term move to nonce-based inline
scripts to also drop `unsafe-inline`. (Checklist 6, 9)

---

## Checklist walkthrough

**1. Authentication** — Partial. bcrypt(10) + stateless JWT, httpOnly/secure/
sameSite=lax cookie, 7-day expiry. Timing-equalized login (`DUMMY_PASSWORD_HASH`)
and anti-enumeration signup are excellent. **Gaps:** no MFA, no password-reset
flow, no email verification, and sessions can't be revoked before expiry
(documented tradeoff). Not Clerk, but the custom implementation is sound.

**2. Middleware protection** — N/A by design (no `middleware.ts`). Every route
handler and protected page calls `getUserId()` / `redirect("/login")` itself —
defense at the handler, which is robust. A thin middleware pass would add
defense-in-depth but isn't required.

**3. RBAC** — Adequate for scope. No role hierarchy, but there's no admin
surface: every record carries a `userId` FK and all queries are scoped to the
caller. `isGuest` is the only role flag. Least-privilege holds via ownership.

**4. Sensitive data handling** — Strong. Secrets in env (`AUTH_SECRET`,
`ENCRYPTION_KEY`, DB URL), `.env*` git-ignored, no secrets client-side. User
Apify keys encrypted at rest with AES-256-GCM (`src/lib/crypto.ts`). See #2 for
the one documentation gap.

**5. Error handling** — Strong. User-facing messages are generic ("Wrong email
or password", "Something went wrong"); detail stays server-side. Login/signup
leak no enumeration signal.

**6. Input validation** — Strong. Zod schemas on every JSON body with `.strip()`
and length caps (`apifyKey` max 500, password 8–200). CV upload capped at 5 MB
and type-checked. See #3 (zod CVE) and #4 (CSP). Minor: password policy is
length-only — consider a breached-password (HIBP k-anonymity) check.

**7. Database security** — Strong. Prisma everywhere, no raw SQL, so no
injection surface. Cross-tenant writes use `updateMany({ where: { id, userId }})`
— no IDOR. `onDelete: Cascade` keeps orphans out. Row-Level Security isn't on
(app-layer scoping covers it); enabling Postgres RLS would be belt-and-braces.

**8. Hosting** — Good (Vercel + Neon assumed): managed TLS, DDoS, patching.

**9. Secure communications** — Strong. HSTS (2yr, preload, includeSubDomains),
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, Referrer-Policy,
Permissions-Policy, `frame-ancestors 'none'`. CSP present — see #4.

**10. Logging & monitoring** — Weak. Only `console.log/warn`; no structured
logs, no alerting, no tamper-resistant store. Add an error/monitoring sink
(Sentry, Vercel Observability) and alert on auth-failure and 429 spikes.

**11. Security testing & audits** — Partial. Vitest unit tests exist and cover
security-relevant libs (auth, ratelimit, csv). No SAST/DAST in CI. Consider
CodeQL and a scheduled `npm audit` gate.

**12. Backup & DR** — Platform-level (Neon PITR). No app-defined/ tested
restore plan documented.

**13. Dependency management** — Partial. SECURITY.md cites Dependabot, but
`npm audit` currently reports 7 vulns (2 high) — see #3. Wire audit into CI.

**14. Rate limiting & anti-abuse** — Partial/strong where enabled. Per-user +
per-IP sliding windows on auth and search, with good `x-forwarded-for` spoofing
notes (`clientKey`). **Gaps:** fails open (#1), and no CAPTCHA/bot verification
(Vercel BotID is an easy add on signup/guest/demo).

**15. Data privacy compliance** — Partial (improved). **Resolved:** a
`DELETE /api/account` endpoint now gives users GDPR/CCPA erasure (deletes the
user + all owned rows via `onDelete: Cascade`, then clears the session), surfaced
as a confirm-gated "Delete my account" control on the Profile page; and a
scheduled reaper (`GET /api/cron/reap-guests`, bearer-guarded by `CRON_SECRET`,
run daily via `vercel.json`) deletes guest/demo accounts older than
`GUEST_TTL_DAYS` (default 7), bounding PII growth. **Still open:** no privacy
policy, consent management, or self-service data *export* path.

**16. Incident response & awareness** — Partial. SECURITY.md defines private
disclosure and SLAs (good). No internal IR runbook / tabletop (team-process,
out of code scope).

**17. IaC security** — N/A. No Terraform/CloudFormation in repo; infra is
Vercel/Neon dashboards.

---

## Also worth noting
- **CSRF:** no anti-CSRF token, but state-changing routes are JSON POST/PATCH
  behind a `SameSite=lax` cookie (cross-site POST sends no cookie), and no
  mutating GET exists. Acceptable; a token would be defense-in-depth.
- **CSV injection:** already neutralized (`src/lib/csv.ts` prefixes `=+-@` cells).
- **SSRF:** scrapers hit fixed hosts (`api.apify.com`, Himalayas) with the user's
  own token; no user-controlled fetch URLs.

## Suggested order of work
1. Fail-closed rate limiting in prod (#1)
2. Document + require Inngest keys (#2)
3. `zod >= 4.6.6` + CI `npm audit` gate (#3, 13)
4. Drop `unsafe-eval` from CSP (#4)
5. ~~Guest-account reaper + data-deletion endpoint (#15)~~ — shipped
6. Error monitoring + auth/429 alerts (#10)
