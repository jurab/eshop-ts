// Stamps an environment label into the served HTML, so a dev tab is never
// mistaken for production. prod ships ENV_LABEL="" and the documents pass
// through untouched; dev ships "-test" and "eshop" becomes "eshop-test".
//
// The label lives in `vars`, not in the markup, because the two environments
// deploy the *same* assets — public/index.html is byte-identical in both, and
// only the binding differs.

// The token the rewriter keys on. It must actually appear in every document
// below or the stamp silently no-ops; tests/node/branding.test.ts pins that.
export const BRAND = "eshop";

// Documents the worker rewrites. Every path here must also be listed in
// `assets.run_worker_first` in wrangler.jsonc, otherwise the asset server
// answers first and the worker never gets to stamp anything — a failure with
// no error, just an unlabelled dev site. tests/node/branding.test.ts pins that
// too.
export const HTML_DOCUMENTS = ["/", "/index.html", "/admin.html"];

// Only the first occurrence: "eshop admin" -> "eshop-test admin".
export function labelText(text: string, label: string): string {
  return text.replace(BRAND, `${BRAND}${label}`);
}

// Buffers an element's text across chunks before rewriting. HTMLRewriter may
// split a text node at any boundary, so replacing per-chunk would miss a brand
// that straddles two of them.
class LabelHandler {
  private buffer = "";

  constructor(private readonly label: string) {}

  text(chunk: Text) {
    this.buffer += chunk.text;
    if (!chunk.lastInTextNode) {
      chunk.remove();
      return;
    }
    // html: true, because the buffered text is raw source — entities arrive
    // undecoded, so the default (re-escaping) replace turns a pre-escaped
    // "&amp;" into "&amp;amp;". The label itself is trusted config, not input.
    chunk.replace(labelText(this.buffer, this.label), { html: true });
    this.buffer = "";
  }
}

export function labelDocument(res: Response, label: string): Response {
  if (!label) return res;
  return new HTMLRewriter()
    .on("title", new LabelHandler(label))
    .on("a.brand", new LabelHandler(label))
    .transform(res);
}
