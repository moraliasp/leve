import { describe, expect, it } from "vitest";

// `?raw` de .css volta vazio no vitest; sem @types/node, o import é dinâmico e sem tipo.
async function css(): Promise<string> {
  const fs = (await import("node:fs" as string)) as { readFileSync(p: string, enc: string): string };
  return fs.readFileSync("src/styles.css", "utf8");
}

// Corpo do bloco `{...}` que começa em `open` (conta chaves).
function block(src: string, open: number): string {
  const start = src.indexOf("{", open);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start + 1, i);
  }
  return "";
}

describe("janela estreita (#52)", () => {
  it("abaixo de 720 px o sumário é sobreposição (position: absolute) e só abre com toc-peek", async () => {
    const src = await css();
    const at = src.search(/@media\s*\(max-width:\s*719px\)/);
    expect(at).toBeGreaterThan(-1);
    const media = block(src, at);
    const toc = media.match(/(?:^|\n)\s*\.toc \{([^}]*)\}/)?.[1] ?? "";
    expect(toc).toMatch(/position:\s*absolute/);
    expect(toc).toMatch(/display:\s*none/);
    expect(media).toMatch(/body\.toc-peek \.toc[^{]*\{[^}]*display:\s*block/);
    expect(media).toMatch(/#body \{[^}]*position:\s*relative/);
    // Sem z-index o sumário fica atrás de #main (position: relative, depois no DOM): "aberto" e invisível.
    expect(toc).toMatch(/z-index:\s*[1-9]\d*/);
  });

  it("o ponto de corte do CSS é o mesmo do matchMedia em main.ts", async () => {
    const fs = (await import("node:fs" as string)) as { readFileSync(p: string, enc: string): string };
    const main = fs.readFileSync("src/main.ts", "utf8");
    const bp = (await css()).match(/@media\s*\((max-width:\s*\d+px)\)/)?.[1];
    expect(bp).toBeTruthy();
    expect(main).toContain(`matchMedia("(${bp})")`);
  });

  it("a media query vem depois da regra base do .toc (senão a base vence)", async () => {
    const src = await css();
    expect(src.search(/@media\s*\(max-width:\s*719px\)/)).toBeGreaterThan(src.indexOf("\n.toc {"));
  });

  it("não quebra palavra à força e mantém a contenção do documento", async () => {
    const src = await css();
    expect(src).not.toMatch(/word-break:\s*break-all/);
    const rule = src.match(/\.markdown-body \{[^}]*\}/)?.[0] ?? "";
    expect(rule).toMatch(/contain:\s*layout/);
  });
});
