import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND, HTML_DOCUMENTS, labelText } from "../../src/lib/branding";

const ROOT = path.resolve(__dirname, "../..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

// Same naive comment strip as envs.test.ts: no string literal in wrangler.jsonc
// contains "//" (the assertions below would break loudly if one appeared).
function readWranglerConfig() {
  return JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, "")) as {
    assets: { run_worker_first: string[] };
    vars: Record<string, string>;
    env?: Record<string, { vars?: Record<string, string> }>;
  };
}

const config = readWranglerConfig();
const envNames = Object.keys(config.env ?? {});

// The env label is stamped into the HTML by the worker, which only sees the
// HTML because `run_worker_first` claims it. Every failure mode here is silent:
// nothing errors, the dev site just looks exactly like production.
describe("environment label", () => {
  it("run_worker_first claims every document the worker rewrites", () => {
    for (const doc of HTML_DOCUMENTS) {
      expect(config.assets.run_worker_first, `${doc} would be served straight from the asset server`).toContain(doc);
    }
  });

  // The rewriter keys on the literal brand token. Rename the brand in the
  // markup and the stamp finds nothing to replace — no error, no label.
  it.each(HTML_DOCUMENTS.filter((d) => d !== "/"))("public%s still contains the brand token", (doc) => {
    const html = read(path.join("public", doc));
    expect(html).toMatch(new RegExp(`<title>[^<]*${BRAND}`));
    expect(html).toMatch(new RegExp(`class="brand"[^>]*>[^<]*${BRAND}`));
  });

  it("production ships an empty label", () => {
    expect(config.vars.ENV_LABEL, "production would render as eshop<label>").toBe("");
  });

  it.each(envNames)("env.%s ships a non-empty label", (envName) => {
    expect(config.env![envName].vars?.ENV_LABEL, `env.${envName} is indistinguishable from production`).toBeTruthy();
  });

  it("labels only the first occurrence of the brand", () => {
    expect(labelText("eshop admin", "-test")).toBe("eshop-test admin");
    expect(labelText("eshop — eshop", "-test")).toBe("eshop-test — eshop");
  });

  it("is a no-op for text that does not mention the brand", () => {
    expect(labelText("catalog", "-test")).toBe("catalog");
  });
});
