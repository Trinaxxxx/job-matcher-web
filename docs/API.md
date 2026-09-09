# API reference

All endpoints live under `/api`. Requests and responses are JSON unless noted.

**Conventions**

- **Auth** is a session cookie set at login/signup. Routes marked _yes_ return
  `401 { "error": "Unauthorized" }` without a valid session.
- Invalid input returns `400` with an `{ "error": "..." }` message.
- Rate-limited requests return `429`.
- A user can only ever read or modify **their own** rows.

---

## Auth

### `POST /api/auth/signup`
Create an account and start a session.

- **Auth:** none · **Rate limit:** `auth`
- **Body:** `{ "email": string, "password": string }` — password 8–200 chars.
- **Success:** `200 { "ok": true }` and a session cookie.
- **Note (anti-enumeration):** if the email is already registered, the response
  body is **identical** to a fresh signup but **no session cookie** is set and the
  existing account is untouched. This avoids revealing which emails exist.

### `POST /api/auth/login`
- **Auth:** none · **Rate limit:** `auth`
- **Body:** `{ "email": string, "password": string }`
- **Success:** `200 { "ok": true }` and a session cookie.
- **Failure:** `401 { "error": "Wrong email or password" }`. The password check
  runs in constant time (against a dummy hash when the email is unknown) so timing
  doesn't reveal whether an email exists.

### `POST /api/auth/logout`
- **Auth:** session · **Body:** none
- **Success:** `200 { "ok": true }`, session destroyed.

---

## Profile

### `GET /api/profile`
Status flags for the profile page (never returns the raw CV text or Apify key).

- **Auth:** yes
- **Success:**
  ```json
  {
    "answers": { ... } | null,
    "cvFileName": "resume.pdf" | null,
    "hasCvText": true,
    "hasApifyKey": true,
    "hasStrategy": true
  }
  ```

### `POST /api/profile`
Save questionnaire answers and/or the Apify key; rebuilds the scoring strategy.

- **Auth:** yes · **Rate limit:** `general`
- **Body:**
  ```json
  {
    "answers": {
      "targetTitles": "product manager, program manager",
      "skills": "SQL, roadmapping, stakeholder management",
      "industries": "fintech, saas",
      "dealbreakers": "commission-only, door-to-door",
      "locations": "Kuala Lumpur, Singapore",
      "excludeLocations": "",
      "minSalary": "8000",
      "currency": "RM",
      "seniority": "senior",
      "remoteOk": true
    },
    "apifyKey": "apify_api_..."
  }
  ```
  All `answers` fields are optional free text (length-capped; unknown keys are
  stripped). `apifyKey`, if present, is encrypted before storage.
- **Success:** `200 { "ok": true }`

---

## CV

### `POST /api/cv`
Upload a CV; extract its text and update the strategy.

- **Auth:** yes · **Rate limit:** `general` · **Max duration:** 60s
- **Body:** `multipart/form-data` with a `cv` file field.
  - Max **5 MB**. Accepted: **PDF, DOCX, TXT**.
- **Success:** `200 { "ok": true }` (plus parsed filename stored on the profile).
- **Failure:** `400` if no file, too large, or text can't be extracted.

---

## Search

### `POST /api/search`
Scrape fresh jobs with the user's Apify key, score them, and store the results.

- **Auth:** yes · **Rate limit:** `search` (stricter) · **Max duration:** 300s
- **Preconditions:** a saved Apify key **and** a completed profile (CV +
  questionnaire) — otherwise `400` with a message telling the user what's missing.
- **Body:** none required (uses the stored profile/strategy).
- **Behavior:** runs the LinkedIn Actor (worldwide) and, when the location covers
  Malaysia/Singapore, the JobStreet Actor — last 7 days. Jobs are deduped per user
  and upserted.
- **Success:** `200` with a summary of how many jobs were found/scored.

---

## Jobs

### `GET /api/jobs`
- **Auth:** yes
- **Success:** `200 { "jobs": Job[] }` — the user's jobs, top 500, ordered by score
  then recency.

### `PATCH /api/jobs`
Update the status of one job (own rows only).

- **Auth:** yes
- **Body:** `{ "id": string, "status": "New" | "Interested" | "Applied" | "Rejected" }`
- **Success:** `200 { "ok": true }` · **Not found / not yours:** `404`

---

## Export

### `GET /api/export`
Download the user's matches as CSV (opens in Excel / Google Sheets).

- **Auth:** yes · **Rate limit:** `general`
- **Success:** `200`, `Content-Type: text/csv`, attachment `job-matches.csv`.
  Top 1000 jobs by score. Columns: Score, Tier, Title, Company, Location, Salary,
  Status, Source, URL, Posted. Cells are escaped to prevent CSV/formula injection.
