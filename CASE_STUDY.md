# From an LLM-orchestrated workflow to a stateless job-intelligence pipeline

**I built a job-matching pipeline, discovered the LLM was doing work that plain code should do, and re-architected it so the model is invoked only where reasoning is genuinely required — then instrumented it so the saving is measured, not asserted.**

The story is deliberately honest about what is *observed*, what is *reasoned*, and what is *measured*. That boundary is the point.

Next.js 16 · React 19 · TypeScript · Prisma/Postgres · Gemini · Vercel
🔗 _[live demo]_ · 💻 _[GitHub]_

---

## 01 · The system as first built

The first version of this pipeline ran entirely inside an AI chat session. From a single prompt, the model:

1. searched for relevant roles, 2. scraped postings, 3. fetched each job description, 4. analysed the JD, 5. compared it to the CV, 6. scored the fit, 7. deduplicated against a Notion database, and 8. wrote the qualifying roles back to Notion.

Every step was a tool call inside one continuous conversation. **The model was the orchestrator, the scorer, and the working memory all at once.**

### Observed facts from a representative run

Every figure below has a named, re-inspectable source — nothing here is estimated:

| Fact | Source |
|---|---|
| LinkedIn scrape returned **199 job records** | Apify run, dataset `1PHz7QjJ6E4wKGEOi`, `itemCount: 199` |
| Raw dataset **~1.6 MB** (1,636,630 bytes) | Apify `inflatedBytes` |
| **20 fields** per record | Apify run summary |
| Scrape completed in **~30 s** | `runTimeSecs: 30.37` |
| Dataset flagged **too large to load whole** into context | `get-dataset-items` warning |
| JDs fetched **one at a time, by offset** | Tool-call sequence |
| **6 of 199** roles passed scoring and were written | `create-pages` calls |

---

## 02 · The measurement gap

The obvious next question — *what did that run cost in tokens?* — has no answer from the chat interface, and I want to be exact about why:

- The chat product **does not expose per-turn or per-session token usage.**
- The API/Console usage dashboard **reads zero** for these runs — not a misconfiguration, but because the dashboard meters API/Console usage only; chat is a separate consumer surface that doesn't report to it.
- There is **no official offline tokenizer**, and `tiktoken`-based estimates run ~1.5–2× off Claude's real counts.

So the honest position is: **the cost is real and structurally diagnosable, but not measured from chat.** Any token number I quoted for the chat run would be a guess dressed as a figure — so I don't.

---

## 03 · Structural diagnosis

These are claims about *how the system works*, defensible as reasoning rather than measurement:

- **Context accumulates across turns.** In one chat session, every tool result stays in context and is re-processed on every later turn. Tokens processed grow super-linearly with tool calls — the 50th scoring step still carries the residue of the previous 49.
- **Full-page HTML is token-heavy.** Fetching whole pages carries far more tokens than the handful of JD fields the scorer actually needs. Poor signal-to-token ratio.
- **The model is used as working memory.** Scraped records, running dedup lists, and scoring notes live in the conversation, not in storage — so everything the pipeline "remembers" is paid for again next turn.
- **The 199 → 6 shape makes the waste concrete.** The full context cost of carrying 199 records was incurred to produce 6 writes — and, because of accumulation, paid repeatedly across the session, not once.

The root cause is **architectural, not a matter of switching products.** Using the model as session-wide working memory is the cost driver; moving to the API alone would not fix it — an API loop that appends every result into each request has the identical problem. The saving comes from the architecture; the API just makes that architecture easier to build and measure.

---

## 04 · The re-architecture

The fix is to make scoring **stateless per job** and reserve the model for judgment:

```
BEFORE — the model is the workflow engine
        one prompt → AI orchestrates all 8 steps
   search → scrape → fetch JD → analyse → score → dedup → write
        every step re-reads the growing transcript

AFTER — conventional code runs the pipeline, AI scores
        scrape → store externally (Postgres)
                     │
              zero-token code:  keyphrase extraction · filters · dedup
                     │  keeps only the shortlist
                     ▼
              AI, one job per call, no history:  fit score + "why"
                     │
                     ▼
                 ranked, explained matches
```

Concretely, in the shipped web app:

- **one job per request, no conversation history carried** — each Gemini call is independent ([ai.ts](src/lib/ai.ts))
- **intermediate state stored externally** in Postgres via Prisma, not in context
- **minimal content per call** — extracted JD fields capped at 6,000 chars, not full-page HTML ([ai.ts](src/lib/ai.ts))
- **the model invoked only where reasoning is required** — a zero-token keyword scorer does the filtering ([strategy.ts](src/lib/strategy.ts), [scoring.ts](src/lib/scoring.ts)); the LLM only judges the survivors
- **the scoring instruction is a stable prefix**, so it caches rather than being rebuilt per call

Under this design the accumulation problem disappears *by construction*: each job's cost is independent of every other's, and the total is the sum of N flat, bounded requests instead of one compounding transcript. **Statelessness also unlocks measurement** — each request returns a `usage` object, so the same change that removes the cost makes the remaining cost visible.

### The strongest metric, phrased honestly

- **AI-dependent workflow stages: 8 → 1.** Deterministic work (search, scrape, fetch, parse, filter, dedup) moved into conventional code; AI is reserved for the fit judgment alone.
- I do **not** claim a headline "X% fewer tokens" for the chat run — see §02, it isn't measurable. The defensible claim is structural: the model went from orchestrating eight stages to scoring one.

---

## 05 · Measured result

Two measurements, at two confidence levels:

**A. The web app (Gemini) — measured now.** I instrumented the search route to log the real funnel and Gemini's reported token usage per run ([route.ts](src/app/api/search/route.ts), [ai.ts](src/lib/ai.ts)). From live runs against `gemini-3.6-flash`:

- **40 jobs scraped → all 40 filtered by zero-token code**, with 38 kept — 100% of triage done by conventional code at no model cost.
- **Each fit judgment is a flat ~3,000-token stateless call** — measured directly from Gemini's `usage` object and consistent across runs (3,267 and 2,917 tokens/call). Because every call is independent (one job in, structured JSON out, no history), this per-job cost does **not** grow with the size of the run — the accumulation curve from §03 is gone by construction.

The significance is the *shape*, not just the size: in the chat prototype, cost compounded with every tool call; here, total model cost is simply `~3k × (jobs that clear the gate)` — a flat sum of bounded, independent requests.

_A note on honesty:_ the free tier caps Gemini at 5 requests/minute, and the app dispatches the shortlist in parallel, so a clean end-to-end "percentage saved" would need either a paid tier or throttled concurrency — I've deliberately **not** quoted a headline percentage, because the measured figure that survives scrutiny is the flat per-job cost above, not a rate-limit-affected ratio.

**B. The Claude-API harness — pending API activation.** A validated harness (`score_with_usage.py`) scores jobs one-per-call against `claude-opus-4-8`, logs the `usage` object to `usage.csv`, and has a free `--count-only` mode. When an API key is activated it produces real input/output/cache tokens per job and a non-zero usage dashboard — the direct before/after against the zero-usage chat screenshot in §02. Until then, this line item is intentionally unfilled; no other part of the case depends on it.

---

## 06 · What I learned

**AI is not necessarily the right tool for every step of an "AI workflow."** The interesting engineering wasn't the model call — it was recognising that the LLM had drifted into being an orchestration and working-memory layer for work that was almost entirely deterministic, and drawing the boundary deliberately: conventional code for predictable operations, the model for semantic judgment.

That is pipeline thinking, cost-awareness, and knowing *when not to use AI* — and it's the instinct I'd bring to building AI systems that have to run more than once.
