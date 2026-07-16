import { Hono } from "hono";
import * as Sentry from "@sentry/cloudflare";
import type { Bindings } from "./types";
import type { UserRow } from "./db/schema";
import { withSentry } from "./lib/sentry";
import { HTML_DOCUMENTS, labelDocument } from "./lib/branding";
import authRoutes from "./routes/auth";
import productsRouter from "./routes/products";
import ordersRouter from "./routes/orders";
import { admin } from "./routes/admin";
import supportRouter from "./routes/support";

type Env = { Bindings: Bindings; Variables: { user?: UserRow } };

const app = new Hono<Env>();

app.route("/api/auth", authRoutes);
app.route("/api", productsRouter);
app.route("/api", ordersRouter);
app.route("/api/admin", admin);
app.route("/api/support", supportRouter);

// The HTML documents are claimed by `assets.run_worker_first`, so they arrive
// here instead of going straight out of the asset server. We fetch the asset
// ourselves (ASSETS.fetch bypasses run_worker_first, so this does not recurse)
// and stamp the environment label into it. In production ENV_LABEL is "" and
// labelDocument hands the response back untouched.
for (const path of HTML_DOCUMENTS) {
  app.get(path, async (c) => labelDocument(await c.env.ASSETS.fetch(c.req.raw), c.env.ENV_LABEL));
}

// Only reached for keys with no matching static asset under public/media/.
app.get("/media/:key{.+}", async (c) => {
  if (!c.env.MEDIA) return c.json({ detail: "not found" }, 404);

  const key = c.req.param("key");
  const object = await c.env.MEDIA.get(key);
  if (!object) return c.json({ detail: "not found" }, 404);

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

app.onError((err, c) => {
  if (c.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }
  console.error(err);
  return c.json({ detail: "internal server error" }, 500);
});

export default withSentry(app);
