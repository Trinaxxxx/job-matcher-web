import { Inngest } from "inngest";
import { prisma } from "@/lib/db";
import { runSearchPipeline, SearchError, type SearchParams } from "@/lib/pipeline";

// Inngest client. In local dev `npx inngest-cli dev` discovers the /api/inngest
// route automatically; in production INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY are
// read from the environment by the SDK.
export const inngest = new Inngest({ id: "job-matcher-web" });

// Event payload for a requested search.
export type SearchRequested = {
  name: "search/requested";
  data: { runId: string; userId: string; params: SearchParams };
};

// The background worker. One run per user at a time (concurrency key = userId),
// and the whole run retries once on an unexpected failure. SearchError failures
// are user-facing and terminal (no retry) — they're recorded on the run.
//
// NOTE (prototype): the pipeline executes as a single unit, so a retry re-runs
// the scrape too. Upserts are idempotent, but a retry would re-charge Apify.
// Next refinement: decompose runSearchPipeline into step.run() stages so only the
// failed stage retries. Tracked in docs/QUEUE_MIGRATION_SPEC.md.
export const searchWorker = inngest.createFunction(
  {
    id: "run-search",
    triggers: [{ event: "search/requested" }],
    concurrency: { key: "event.data.userId", limit: 1 },
    retries: 1,
    // Idempotency: a duplicate send for the same run won't double-execute.
    idempotency: "event.data.runId",
  },
  async ({ event }) => {
    const { runId, userId, params } = event.data;

    const setStatus = (status: string, data: Record<string, unknown> = {}) =>
      prisma.searchRun.update({ where: { id: runId }, data: { status, ...data } }).catch(() => {});

    try {
      const stats = await runSearchPipeline(userId, params, async (stage, partial) => {
        // Map pipeline stages onto run status + persist partial funnel stats.
        await setStatus(stage, partial ?? {});
      });

      await setStatus("done", {
        scraped: stats.scraped,
        kept: stats.kept,
        outsideRadius: stats.outsideRadius,
        gated: stats.gated,
        aiReviewed: stats.aiReviewed,
        strongFit: stats.strongFit,
        aiTokens: stats.aiTokens,
        saved: stats.saved,
      });
      return { ok: true, ...stats };
    } catch (e) {
      const message =
        e instanceof SearchError
          ? e.message
          : "Something went wrong while searching. Please try again.";
      await setStatus("failed", { error: message });
      // SearchError is terminal (don't retry a bad postcode); rethrow others so
      // Inngest retries per the function config.
      if (!(e instanceof SearchError)) throw e;
      return { ok: false, error: message };
    }
  }
);
