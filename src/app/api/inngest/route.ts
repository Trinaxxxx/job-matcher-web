import { serve } from "inngest/next";
import { inngest, searchWorker } from "@/lib/inngest";

// Inngest endpoint. Local dev: run `npx inngest-cli dev` and it discovers this
// route. Production: register the deployed URL with your Inngest app.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [searchWorker],
});
