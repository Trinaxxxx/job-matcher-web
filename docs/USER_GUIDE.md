# User guide

Job Matcher finds fresh job listings, scores them against *your* background, and
shows you the best matches with a plain-English reason for each score. You can then
track which ones you've applied to and export the list.

## 1. Create an account

Go to **Sign up**, enter your email and a password (at least 8 characters). You'll
be logged in automatically.

## 2. Set up your profile

Open the **Profile** page. Three things go here:

### a. Upload your CV
Upload a **PDF, DOCX, or TXT** file (up to 5 MB). The app reads the text and uses it
to understand your experience — frequent, meaningful terms from your CV become
"nice-to-have" signals when scoring jobs.

### b. Answer the questionnaire
The more accurate this is, the better your matches. Fields (all optional, comma- or
line-separated where it's a list):

| Field | What to put | Example |
|---|---|---|
| Target titles | Roles you want | `product manager, program manager` |
| Skills | Your key skills | `SQL, roadmapping, stakeholder management` |
| Industries | Preferred domains | `fintech, saas` |
| Dealbreakers | Words/roles to avoid | `commission-only, door-to-door` |
| Locations | Where you'll work | `Kuala Lumpur, Singapore` |
| Exclude locations | Where you won't | `Penang` |
| Minimum salary | A number | `8000` |
| Currency | Your currency | `RM`, `SGD`, `USD` |
| Seniority | Your level | `intern` / `junior` / `mid` / `senior` / `lead` / `director` |
| Remote OK | Tick if you'll take remote | ✓ |

### c. Add your Apify API key
The app scrapes jobs using **your own** Apify account:

1. Sign in at [apify.com](https://apify.com).
2. Go to **Settings → API & Integrations** and copy your API token.
3. Paste it into the profile page and save.

Your key is **encrypted** before it's stored and is only used to run job searches on
your behalf. (Scraping usage counts against your Apify account.)

## 3. Run a search

Go to the **Dashboard** and click **Run job search**. The app scrapes recent
listings (the last 7 days) from **LinkedIn**, plus **JobStreet** if your locations
include Malaysia or Singapore, scores each one, and saves the results.

A search can take a minute or two — scraping is the slow part.

## 4. Read your results

The **Results** page shows matches ranked by score (0–100), each with a tier:

| Tier | Meaning |
|---|---|
| **Strong match** | 80+ — closely fits your profile |
| **Good match** | 65–79 |
| **Possible** | 50–64 |
| **Weak** | below 50 |

Each row lists **reasons** for its score — e.g. "+22 target role in title",
"−12 salary below your floor" — so you can see *why* it ranked where it did.

## 5. Track and export

- **Status:** mark each job **New → Interested → Applied → Rejected** to keep track.
- **Export:** download all your matches as a **CSV** that opens in Excel or Google
  Sheets.

## Tips

- If a search returns nothing useful, refine your **target titles** and
  **dealbreakers** — they have the biggest effect on scoring.
- Re-run searches periodically; only new listings are added (duplicates are skipped).
- Wrong seniority matches? Set the **seniority** field — it filters out clearly
  entry-level roles when you want mid-level or above.

## Privacy

Your CV text, questionnaire answers, and Apify key are tied to your account. The
Apify key is encrypted at rest. See [DEPLOYMENT.md](DEPLOYMENT.md) for how secrets
are handled.
