# Shared Apify Backend — Work Plan, Pricing & Roadmap

_Last updated: 2026-09-11 · Scope: invite/guest-only, small scale (~5–20 users)_

## 1. What you're building — and what's changing

**Goal:** users never touch Apify. They sign in to *your* app, click Search, and
you (the app owner) run the scrape on **one Apify account you own and pay for**.
Each user gets a usage "profile" — but that profile lives in *your* database, not
in Apify. To Apify, all traffic is one customer: you.

> There is no way to auto-provision a personal Apify account from someone's Gmail.
> Apify has no consumer OAuth/"Sign in with Apify" flow. So the only model that
> matches "no one visits Apify's site" is **shared account, you pay**. This plan
> assumes that.

**This is a migration, not a greenfield build.** Today the code is wired for the
*opposite* model — each user brings their own key:

| Piece | Today (bring-your-own-key) | Target (shared account) |
|---|---|---|
| Token source | `user.apifyKeyEnc` decrypted per request | `process.env.APIFY_TOKEN` (server-only) |
| `src/lib/apify.ts` | `scrapeJobs(token, params)` | `scrapeJobs(params)` — token from env |
| `src/app/api/search/route.ts` | 400s if no user key | never needs a user key |
| Onboarding step 3 | "Add your Apify API key" | removed (or hidden behind an admin/BYO toggle) |
| Cost control | per-user rate limit only | rate limit **+ per-user monthly quota + global spend guard** |
| Landing copy | "Runs on your own Apify key" | "Nothing to set up — just search" |

Keep the `apifyKeyEnc` column and crypto — they become an optional
**bring-your-own-key override** for power users later (Phase 5), not the default.

---

## 2. How it works (architecture)

```
User (email/guest login)                    YOUR SERVER                         Apify
        │                                        │                                │
        │  POST /api/search  ───────────────────▶│                                │
        │                                        │ 1. auth (getUserId)            │
        │                                        │ 2. rate limit (per-user + IP)  │
        │                                        │ 3. quota check (this user this │
        │                                        │    month) + global spend guard │
        │                                        │ 4. scrapeJobs(params) ────────▶│  run actor
        │                                        │                                │  (your APIFY_TOKEN)
        │                                        │ 5. record usage (roles, $est)  │◀── results
        │  ◀─────────────── results ─────────────│    against user + global month │
```

Three layers of cost defence, all server-side, all things you've **already built
once** (for Gemini) and can mirror:

1. **Rate limit** (`lib/ratelimit.ts`) — bursts. _Exists._
2. **Per-user monthly quota** (new `lib/apifyQuota.ts`) — fairness / one user can't
   drain the budget. _Mirror of `budget.ts`._
3. **Global monthly spend guard** (extend `lib/budget.ts`) — hard ceiling so total
   spend can't exceed your target no matter what. _Pattern exists._

---

## 3. Real cost model (pricing verified from the actor pages, 2026-09-11)

Both actors your code calls use **pay-per-event** pricing — you're charged a fixed
price per result, *not* for compute/proxies. That makes cost easy to predict.

| Source | Actor | Price |
|---|---|---|
| LinkedIn | `worldunboxer/rapid-linkedin-scraper` | **$0.45 / 1,000 results** ($0.00045/role) |
| JobStreet | `blackfalcondata/jobstreet-scraper` | **$0.01/run + $0.002/result** (~$2.00 / 1,000) |

**Apify plan:** Free = **$5/month** of included usage (pay-per-event charges draw
from this credit). Starter = **$19/month** (includes $19 usage).

Your search config today is `maxResults: 20` per source. LinkedIn runs always;
JobStreet only when the location matches MY/SG.

**Cost per search:**

| User region | Sources run | Roles/search | Cost/search |
|---|---|---|---|
| Non-SEA | LinkedIn only | ~20 | **~$0.01** |
| SEA (MY/SG) | LinkedIn + JobStreet | ~40 | **~$0.06** |

Use **$0.06/search** as your planning worst case (your app is SEA-focused).

---

## 4. The free envelope + per-user caps

"Free" = keep **total** monthly Apify usage under the **$5 Free-plan credit**.
That $5 is shared across *all* users, so you enforce it as a global cap and divide
it into per-user allowances.

At $0.06/search (SEA worst case): **$5 ÷ $0.06 ≈ 83 searches/month total**, free.

Recommended launch caps:

| Tier | Allowance | Roles/month | Cost/user/mo |
|---|---|---|---|
| **Guest** (unverified taste) | 1 search, lifetime | ~40 | ~$0.06 once |
| **Invited** (default) | 8 searches / month | ~320 | ~$0.48 |
| **Global hard cap** | $5 / month (stay on Free) | — | $0 out of pocket |

**Headline: ~10 invited users × 8 searches/month = ~$4.80/month → fits inside the
free $5.** You can run a small invited beta for **$0**.

---

## 5. Budget analysis (small scale)

Worst case = every user is SEA (both scrapers), full quota used ($0.06/search):

| Users | Searches/user/mo | Total/mo | Roles/user/mo | Monthly cost | Plan |
|---|---|---|---|---|---|
| 5 | 12 | 60 | ~480 | **$3.60** | Free ✅ |
| 10 | 8 | 80 | ~320 | **$4.80** | Free ✅ (just) |
| 15 | 6 | 90 | ~240 | **$5.40** | Free +$0.40, or trim to 5/user |
| 20 | 8 | 160 | ~320 | **$9.60** | Starter $19 (headroom) |
| 20 | 4 | 80 | ~160 | **$4.80** | Free ✅ |

Reality is cheaper: non-SEA users cost ~$0.01/search, and most users won't burn
their full quota. **Realistic small-scale spend: $0–$5/month on Free, or $19/month
on Starter once you pass ~15 active SEA users.** The global guard means you can
*never* be surprised — scraping stops when the month's cap is hit.

**Two levers if you outgrow free:** lower per-user searches, or upgrade to Starter
($19 → ~316 SEA searches/mo → comfortably 20–40 users).

---

## 6. Tier design (guest vs invited)

You already have `User.isGuest`. Build on it rather than a full billing system:

- **Guest** — created without an invite (or a "try it" button). 1 lifetime search,
  results not persisted long. Enough to feel the product; near-zero cost.
- **Invited** — created via an invite code. 8 searches/month, full persistence.
- **Owner/admin** — you. Unlimited, plus a usage dashboard.

No money changes hands yet. If usage ever justifies charging, the per-user meter
you build in Phase 2 is exactly what a paid tier would read from — so charging
later is a config change, not a rebuild.

---

## 7. Implementation plan (phased, file-by-file)

### Phase 0 — Config & safety (½ day)
- Add `APIFY_TOKEN` to Vercel env (Production + Preview), server-only.
- Set a **hard monthly usage limit in the Apify console** as a backstop ($5 or $19).
- Add env vars: `APIFY_MONTHLY_BUDGET_USD`, `APIFY_USER_MONTHLY_SEARCHES`,
  `APIFY_GUEST_LIFETIME_SEARCHES`.

### Phase 1 — Flip to the shared token (½ day)
- `lib/apify.ts`: change `scrapeJobs(token, params)` → `scrapeJobs(params)`, read
  `process.env.APIFY_TOKEN` internally. Throw a clear error if unset.
- `api/search/route.ts`: delete the `apifyKeyEnc` lookup + the 400 "add your key"
  branch; call `scrapeJobs({ keywords, location, maxResults })`.
- Onboarding/Profile: remove (or feature-flag) the Apify-key step; drop the
  dashboard "Connect a scraping key" checklist item.
- Landing copy: replace "runs on your own Apify key" messaging.
- _No schema change — `apifyKeyEnc` stays nullable for Phase 5._

### Phase 2 — Per-user monthly quota + global guard (1 day)
- New `lib/apifyQuota.ts` (mirror `budget.ts`): Redis key
  `budget:apify:user:{userId}:{YYYY-MM}` counting searches (or roles); helpers
  `userQuotaAvailable(userId, isGuest)` and `recordUserSearch(userId, roles, costEst)`.
- Extend `lib/budget.ts` with a **global** Apify bucket
  `budget:apify:global:{YYYY-MM}` and `apifyBudgetAvailable()` /
  `recordApifySpend(costEst)`, capped by `APIFY_MONTHLY_BUDGET_USD`.
- `api/search/route.ts`: after rate limit, check global guard **and** per-user
  quota; on fail return a friendly 429 ("You've used your searches for this month").
  After a successful scrape, record `raw.length` roles + `$est` against both buckets.
- Cost estimate helper: `estimateCost(roles, ranJobStreet)` using the Section 3 rates.
- Unit tests mirroring `budget.test.ts` / `ratelimit.test.ts`.

### Phase 3 — Invite / guest gating (1 day)
- Invite codes: simplest is an env allowlist (`INVITE_CODES=...`) checked at
  signup, or a small `InviteCode` table (code, maxUses, uses, expiresAt).
- Signup sets `isGuest=false` when a valid code is presented, `true` otherwise
  (or block guest signup entirely if you want invite-only).
- Quota lookups already branch on `isGuest` from Phase 2.

### Phase 4 — Usage visibility (½ day)
- Owner-only `/admin/usage`: month-to-date global spend vs cap, per-user search
  counts, top consumers. Reads the Redis buckets — no new storage.
- Optional: surface "X of 8 searches left this month" to each user on the dashboard.

### Phase 5 — Optional bring-your-own-key override (later)
- Re-expose the Apify-key field for users who *want* to pay their own way; if
  `apifyKeyEnc` is set, use it and skip their quota. Best of both models.

---

## 8. Roadmap / milestones

| Milestone | Phases | Effort | Outcome |
|---|---|---|---|
| **M1 — Shared scraping live** | 0–1 | ~1 day | Users search with zero setup; cost on your account, guarded only by rate limit + Apify console cap |
| **M2 — Budget-safe** | 2 | ~1 day | Hard global $5 cap + per-user monthly quota; spend can't surprise you |
| **M3 — Invite-only beta** | 3 | ~1 day | Controlled access; guests get a taste, invited users get full quota |
| **M4 — Observability** | 4 | ~½ day | You can see spend + per-user usage at a glance |
| **M5 — BYO-key option** | 5 | later | Power users offload their own cost |

**Recommended first ship: M1 + M2 together** (~2 days). Never expose shared
scraping without the budget guard — M1 alone means an uncapped bill.

---

## 9. Risks & guardrails

- **Runaway spend** → global guard (M2) + hard cap in Apify console. Two independent
  ceilings; the console one works even if Redis is down (the app guard fails *open*
  by design, so the console cap is the real backstop — set it).
- **Guest-account amplification** → the per-IP search limiter already exists;
  keep it, and make guest signup itself rate-limited/invite-gated.
- **Actor price changes** → both are pay-per-event; re-check the actor pages
  quarterly and update `estimateCost`. A price hike can't overspend past the caps.
- **Redis absent in prod** → `budget.ts`/`ratelimit.ts` already warn loudly and
  fail open; the Apify console cap covers this gap.
- **Terms** → running one paid account on behalf of your invited users is fine;
  *auto-creating* Apify accounts for them would not be. This plan does the former.
```
