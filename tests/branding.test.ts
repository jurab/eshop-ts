import { describe, expect, it } from "vitest";
import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import worker from "../src/index";
import type { Bindings } from "../src/types";

const testEnv = env as unknown as Bindings;

// Serves a document through the real worker with a given ENV_LABEL, against the
// real public/ assets. This is the half that proves the rewriter actually fires
// on the real markup — tests/node/branding.test.ts pins the config around it.
async function fetchDocument(path: string, label: string): Promise<string> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost${path}`), { ...testEnv, ENV_LABEL: label }, ctx);
  await waitOnExecutionContext(ctx);
  expect(res.status).toBe(200);
  return await res.text();
}

describe("environment label in the served HTML", () => {
  it.each(["/", "/index.html", "/admin.html"])("labels the brand and title of %s", async (path) => {
    const html = await fetchDocument(path, "-test");

    expect(html).toMatch(/<title>eshop-test/);
    expect(html).toMatch(/class="brand"[^>]*>eshop-test</);
  });

  // Production ships ENV_LABEL="", and must be byte-for-byte the asset.
  it("leaves the document untouched when the label is empty", async () => {
    const labelled = await fetchDocument("/", "");

    expect(labelled).toMatch(/<title>eshop —/);
    expect(labelled).not.toMatch(/eshop-/);
  });

  it("does not label anything but the brand", async () => {
    const html = await fetchDocument("/", "-test");

    expect(html).toMatch(/<a href="#\/">catalog<\/a>/);
    expect(html).toMatch(/desk gear/);
  });
});
