import { describe, expect, it } from "vitest";
import { LARGE_DOC_BYTES, LARGE_TOC_MAX_LEVEL, isLargeDoc } from "../src/limits";
import { render } from "../src/render";
import { buildToc } from "../src/toc";

const HEAD = "# Título\n\n## Seção\n\n### Detalhe\n\nVeja https://exemplo.com.br/pagina para mais.\n\n";

/** Mesmo início do pequeno, mais um bloco de código que leva o texto acima do limiar. */
function bigDoc(): string {
  const line = "const x = 1; // preenchimento\n";
  const n = Math.ceil(LARGE_DOC_BYTES / line.length) + 10;
  return `${HEAD}\`\`\`ts\n${line.repeat(n)}\`\`\`\n`;
}

/** O que `loadDoc` faz: decide o modo pelo texto, renderiza e monta o sumário. */
function open(text: string): { html: string; toc: string[] } {
  const large = isLargeDoc(text);
  const content = document.createElement("div");
  content.innerHTML = render(text, { large });
  const toc = buildToc(content, document.createElement("nav"), large ? LARGE_TOC_MAX_LEVEL : undefined);
  return { html: content.innerHTML, toc: toc.map((t) => t.el.tagName) };
}

describe("isLargeDoc", () => {
  it("conta bytes UTF-8, não unidades UTF-16", () => {
    expect(isLargeDoc("a".repeat(LARGE_DOC_BYTES))).toBe(false);
    expect(isLargeDoc("a".repeat(LARGE_DOC_BYTES + 1))).toBe(true);
    // "ç" = 2 bytes: metade das unidades já passa do limiar.
    expect(isLargeDoc("ç".repeat(LARGE_DOC_BYTES / 2))).toBe(false);
    expect(isLargeDoc("ç".repeat(LARGE_DOC_BYTES / 2 + 1))).toBe(true);
    expect(isLargeDoc("😀".repeat(LARGE_DOC_BYTES / 4 + 1))).toBe(true);
  });
});

describe("modo documento grande", () => {
  it("documento pequeno: URL solta vira link e o sumário vai até h3", () => {
    const { html, toc } = open(HEAD);
    expect(html).toContain('<a href="https://exemplo.com.br/pagina">');
    expect(toc).toEqual(["H1", "H2", "H3"]);
  });

  it("documento acima de 2 MB: URL solta fica texto e o sumário para em h2", () => {
    const text = bigDoc();
    expect(isLargeDoc(text)).toBe(true);
    const { html, toc } = open(text);
    expect(html).toContain("Veja https://exemplo.com.br/pagina para mais.");
    expect(html).not.toMatch(/<a href="http/);
    expect(toc).toEqual(["H1", "H2"]);
    // O título h3 continua no documento, com âncora; só sai do sumário.
    expect(html).toContain('<h3 id="detalhe"');
    // O bloco segue marcado com a linguagem (rótulo e copiar em code.ts), só sem realce.
    expect(html).toContain('<code class="language-ts">');
  }, 30_000);

  it("o modo grande não vaza para o render seguinte (large → normal → large)", () => {
    const src = "Veja https://exemplo.com.br/pagina para mais.";
    expect(render(src, { large: true })).not.toMatch(/<a href="http/);
    expect(render(src)).toContain('<a href="https://exemplo.com.br/pagina">');
    expect(render(src, { large: true })).not.toMatch(/<a href="http/);
    expect(render(src, { large: false })).toContain('<a href="https://exemplo.com.br/pagina">');
  });

  it("link escrito à mão continua link no modo grande", () => {
    expect(render("[site](https://exemplo.com.br/)", { large: true })).toContain('<a href="https://exemplo.com.br/">site</a>');
  });
});
