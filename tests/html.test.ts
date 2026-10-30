import { describe, expect, it } from "vitest";
import { escapeHtml } from "../src/html";

describe("escapeHtml", () => {
  it("escapa os cinco, inclusive aspas simples e duplas", () => {
    expect(escapeHtml(`<a href="x" title='y'>&amp;</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;amp;&lt;/a&gt;");
    expect(escapeHtml("texto comum")).toBe("texto comum");
  });
});
