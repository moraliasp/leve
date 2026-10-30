import { describe, expect, it } from "vitest";
import { DOC_STYLES, isDocStyle, styleCss, styleForExport } from "../src/doc-style";

// Lidos do repo: `?raw` de .css volta vazio no vitest; sem @types/node, o import é dinâmico e sem tipo.
const fs = (await import("node:fs" as string)) as { readFileSync(p: string, enc: string): string };
const src = (f: string) => {
  const rel = "../src/" + f; // variável, não literal: o Vite reescreve `new URL("literal", import.meta.url)`
  return fs.readFileSync(new URL(rel, import.meta.url).pathname, "utf8");
};
const base = src("markdown.css");
const docCss = src("document.css");
const FILES: Record<string, string> = Object.fromEntries(["editor", "terminal", "livro"].map((id) => [id, src(`doc-styles/${id}.css`)]));

/** Nomes das variáveis declaradas no bloco de seletor exato `sel` (vazio se não houver). */
function tokensOf(css: string, sel: string): Map<string, string> {
  const i = css.indexOf(`\n${sel} {`);
  if (i < 0) return new Map();
  const body = css.slice(i, css.indexOf("}", i));
  return new Map([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const isColor = (v: string) => /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v);
const known = new Set([...tokensOf(base, ":root").keys(), ...tokensOf(docCss, ":root").keys()]);

describe("estilos do documento", () => {
  it("a base declara os dois temas com as mesmas cores", () => {
    const light = tokensOf(base, ":root");
    const dark = tokensOf(base, ':root[data-theme="dark"]');
    const colors = [...light].filter(([, v]) => isColor(v)).map(([k]) => k);
    expect(colors.length).toBeGreaterThan(20);
    expect([...dark.keys()].filter((k) => k !== "md-color-scheme").sort()).toEqual(colors.sort());
  });

  it("todo estilo da lista tem arquivo, e todo arquivo está na lista", () => {
    expect(DOC_STYLES.filter((s) => s !== "github").sort()).toEqual(Object.keys(FILES).sort());
  });

  for (const [id, css] of Object.entries(FILES)) {
    describe(id, () => {
      const light = tokensOf(css, `:root[data-style="${id}"]`);
      const dark = tokensOf(css, `:root[data-style="${id}"][data-theme="dark"]`);

      it("troca as mesmas cores no claro e no escuro (o escuro da base não vaza)", () => {
        const colors = [...light].filter(([, v]) => isColor(v)).map(([k]) => k);
        expect(colors.length).toBeGreaterThan(10);
        expect([...dark.keys()].sort()).toEqual(colors.sort());
        // Toda cor que a base troca no escuro e o estilo troca no claro precisa vir no escuro do estilo.
        for (const k of tokensOf(base, ':root[data-theme="dark"]').keys()) if (light.has(k)) expect(dark.has(k), k).toBe(true);
      });

      it("só usa tokens da base (ou --md-heading, que só um estilo define)", () => {
        for (const k of light.keys()) expect(known.has(k) || k === "md-heading", k).toBe(true);
      });

      it("toda regra fica atrás do próprio data-style", () => {
        const selectors = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+(?=\{)/g) ?? [];
        for (const s of selectors) for (const part of s.split(/,(?![^(]*\))/)) expect(part.trim().startsWith(`:root[data-style="${id}"]`), part).toBe(true);
      });

      it("no exportado, o claro vale em :root e o escuro fica preso ao data-theme", () => {
        const out = styleForExport(css, id as "editor");
        expect(out).not.toContain("data-style");
        expect(out).toContain(":root {");
        expect(out).toContain(':root[data-theme="dark"] {');
      });
    });
  }

  it("GitHub é a base: nada a carregar", async () => {
    expect(await styleCss("github")).toBe("");
    expect(typeof (await styleCss("livro"))).toBe("string");
  });

  it("isDocStyle aceita só os ids da lista", () => {
    expect(isDocStyle("livro")).toBe(true);
    expect(isDocStyle("book")).toBe(false);
    expect(isDocStyle(null)).toBe(false);
  });
});
