import { describe, expect, it } from "vitest";
import { render } from "../src/render";
import { decorateCodeBlocks } from "../src/code";
import { makeTabbable } from "../src/a11y";
import { cloneContent } from "../src/export";
import { ALERT_COLORS, MERMAID_MAX_WIDTH, mermaidToImages, toRichHtml } from "../src/rich";

/** `#content` como o app deixa: render, botões de copiar, tabindex, imagens locais marcadas. */
function content(md: string): HTMLElement {
  const el = document.createElement("div");
  el.id = "content";
  el.innerHTML = render(md);
  decorateCodeBlocks(el);
  makeTabbable(el);
  for (const img of el.querySelectorAll<HTMLImageElement>("img[src]")) {
    const src = img.getAttribute("src") ?? "";
    if (/^(https?:|data:)/.test(src)) continue;
    img.dataset.localSrc = src;
    img.src = "asset://localhost/abs/" + src;
  }
  return el;
}

/** Fragmento colado, reaberto como DOM para conferir elemento a elemento. */
function richOf(md: string, prep?: (root: HTMLElement) => void) {
  const root = cloneContent(content(md));
  prep?.(root);
  const { html, oversized } = toRichHtml(root);
  const doc = document.createElement("div");
  doc.innerHTML = html;
  return { html, oversized, dom: doc };
}

const style = (el: Element | null | undefined): string => el?.getAttribute("style") ?? "";

describe("Copiar como texto formatado", () => {
  it("fragmento com estilo inline: sem <style>, <script>, class, id, on* nem data-*", () => {
    const el = content("# Título\n\ntexto **forte**\n\n```js\nconst a = 1;\n```");
    el.insertAdjacentHTML("beforeend", '<script>alert(1)</script><p onclick="x()" data-x="1">p</p><style>p{}</style><link rel="stylesheet" href="x.css">');
    const { html } = toRichHtml(cloneContent(el));
    expect(html.startsWith('<meta charset="utf-8"><div style="font-family:')).toBe(true);
    expect(html).not.toMatch(/<script|<style|<link|onclick|\sclass=|\sid=|\sdata-|tabindex|<button/i);
    expect(html).toContain("<strong>forte</strong>");
  });

  it("títulos com tamanho e peso; h1/h2 com filete", () => {
    const { dom } = richOf("# Um\n\n## Dois\n\n### Três");
    expect(style(dom.querySelector("h1"))).toMatch(/font-size:2em/);
    expect(style(dom.querySelector("h1"))).toMatch(/border-bottom:1px solid/);
    expect(style(dom.querySelector("h2"))).toMatch(/font-size:1\.5em/);
    expect(style(dom.querySelector("h3"))).toMatch(/font-size:1\.25em;?/);
    expect(style(dom.querySelector("h3"))).not.toMatch(/border-bottom/);
  });

  it("tabela com borda e padding nas células, alinhamento da coluna preservado", () => {
    const { dom } = richOf("| a | b |\n|---|--:|\n| 1 | 2 |");
    expect(style(dom.querySelector("table"))).toMatch(/border-collapse:collapse/);
    const th = dom.querySelector("th")!;
    expect(style(th)).toMatch(/border:1px solid #d1d9e0;padding:6px 13px;font-weight:600/);
    const td = dom.querySelectorAll("td")[1];
    expect(style(td)).toMatch(/border:1px solid/);
    // `text-align:right` do Markdown vem depois do estilo base e vence.
    expect(style(td)).toMatch(/text-align:\s*right$/);
  });

  it("bloco de código: fundo, fonte mono, cores do realce inline e sem rótulo nem botão", () => {
    const el = content("```js\nconst a = 1;\n```");
    // Realce já feito (como `highlightAll` deixa).
    el.querySelector("pre code")!.innerHTML = '<span class="hljs-keyword">const</span> a = <span class="hljs-number">1</span>;';
    const { html } = toRichHtml(cloneContent(el));
    const dom = document.createElement("div");
    dom.innerHTML = html;
    const pre = dom.querySelector("pre")!;
    expect(style(pre)).toMatch(/background-color:#f6f8fa/);
    expect(style(pre)).toMatch(/font-family:ui-monospace/);
    expect(style(pre)).toMatch(/white-space:pre-wrap/);
    expect(style(pre.querySelector("code"))).toMatch(/background-color:transparent/);
    expect(style(pre.querySelector("span"))).toBe("color:#d73a49");
    expect(pre.textContent).toBe("const a = 1;");
    expect(dom.querySelector(".code-tools, button")).toBeNull();
    expect(dom.textContent).not.toContain("js");
  });

  it("código inline em mono com fundo", () => {
    const { dom } = richOf("use `x()` aqui");
    expect(style(dom.querySelector("p code"))).toMatch(/font-family:ui-monospace.*background-color:#eff1f3/);
  });

  it("callout: borda e título na cor do tipo; recolhível vira bloco aberto", () => {
    const { dom } = richOf("> [!WARNING]\n> Cuidado aqui.\n\n> [!TIP]- Dobrável\n> Escondido.");
    const [warn, tip] = Array.from(dom.querySelector(":scope > div")!.children);
    expect(style(warn)).toContain(`border-left:4px solid ${ALERT_COLORS.warning}`);
    expect(style(warn.firstElementChild)).toContain(`color:${ALERT_COLORS.warning}`);
    expect(warn.textContent).toContain("Cuidado aqui.");
    expect(style(tip)).toContain(`border-left:4px solid ${ALERT_COLORS.tip}`);
    expect(dom.querySelector("details, summary")).toBeNull();
    expect(tip.textContent).toContain("Escondido.");
  });

  it("links: absolutos ficam (com cor), âncora interna e caminho relativo viram texto", () => {
    const { dom } = richOf("[site](https://example.com) [mail](mailto:a@b.c) [sec](#um) [pdf](docs/a.pdf) [nota](outra.md)");
    const hrefs = Array.from(dom.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["https://example.com", "mailto:a@b.c"]);
    expect(style(dom.querySelector("a"))).toMatch(/color:#0969da/);
    expect(dom.textContent).toContain("sec");
    expect(dom.textContent).toContain("pdf");
    expect(dom.textContent).toContain("nota (outra.md)");
  });

  it("listas com recuo; tarefa vira ☐/☑ sem <input>", () => {
    const { dom } = richOf("- um\n- dois\n\n1. a\n2. b\n\n- [ ] fazer\n- [x] feito");
    expect(style(dom.querySelector("ul"))).toMatch(/padding-left:2em/);
    expect(style(dom.querySelector("ol"))).toMatch(/padding-left:2em/);
    expect(dom.querySelector("input")).toBeNull();
    expect(dom.textContent).toContain("☐ fazer");
    expect(dom.textContent).toContain("☑ feito");
  });

  it("fórmula: a fonte TeX como texto, sem o HTML do KaTeX", () => {
    const { dom } = richOf("Inline $a^2+b^2$ e bloco:\n\n$$\n\\sum_{i=1}^n\n  i\n$$");
    // Como o app deixa depois do KaTeX: fonte em `data-src`, desenho dentro.
    expect(dom.textContent).toContain("$a^2+b^2$");
    expect(dom.textContent).toContain("$$\\sum_{i=1}^n i$$");
    const rendered = cloneContent(content("$x$"));
    const m = rendered.querySelector<HTMLElement>(".math")!;
    m.dataset.src = "x";
    m.innerHTML = '<span class="katex"><math><mi>x</mi></math><span class="katex-html">x</span></span>';
    const { html } = toRichHtml(rendered);
    expect(html).not.toMatch(/katex|<math/);
    expect(html).toContain("$x$");
  });

  it("Mermaid: vira <img> PNG limitado em largura; sem imagem, a fonte com rótulo", async () => {
    const md = "```mermaid\ngraph TD; A-->B\n```";
    const root = cloneContent(content(md));
    const pre = root.querySelector<HTMLElement>("pre.mermaid")!;
    pre.dataset.src = "graph TD; A-->B";
    pre.innerHTML = '<svg viewBox="0 0 1000 500"><style>.x{}</style><g/></svg>';
    await mermaidToImages(root, async () => ({ data: "data:image/png;base64,AAAA", width: 1000, height: 500 }));
    const { dom } = { dom: Object.assign(document.createElement("div"), { innerHTML: toRichHtml(root).html }) };
    const img = dom.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    expect(img.getAttribute("width")).toBe(String(MERMAID_MAX_WIDTH));
    expect(img.getAttribute("height")).toBe(String(MERMAID_MAX_WIDTH / 2));
    expect(img.getAttribute("alt")).toBe("Diagrama Mermaid");
    expect(dom.querySelector("svg, style")).toBeNull();

    const failed = cloneContent(content(md));
    failed.querySelector<HTMLElement>("pre.mermaid")!.dataset.src = "graph TD; A-->B";
    failed.querySelector<HTMLElement>("pre.mermaid")!.innerHTML = '<svg viewBox="0 0 10 10"></svg>';
    await mermaidToImages(failed, async () => {
      throw new Error("canvas sujo");
    });
    const out = document.createElement("div");
    out.innerHTML = toRichHtml(failed).html;
    expect(out.querySelector("svg, img")).toBeNull();
    expect(out.textContent).toContain("Diagrama Mermaid (fonte):");
    expect(out.querySelector("pre code")!.textContent).toBe("graph TD; A-->B");
  });

  it("front matter vira tabela aberta, sem <details>", () => {
    const { dom } = richOf("---\ntitle: Nota\ntags: [a, b]\n---\n\n# Corpo");
    expect(dom.querySelector("details, summary")).toBeNull();
    expect(style(dom.querySelector("th"))).toMatch(/font-family:ui-monospace/);
    expect(dom.textContent).toContain("Nota");
  });

  it("seleção parcial: o fragmento recortado sai com os mesmos estilos", () => {
    const el = content("# Título\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nfim");
    document.body.appendChild(el);
    const range = document.createRange();
    range.setStartBefore(el.querySelector("table")!);
    range.setEndAfter(el.querySelector("p")!);
    const root = document.createElement("article");
    root.appendChild(range.cloneContents());
    el.remove();
    const dom = document.createElement("div");
    dom.innerHTML = toRichHtml(root).html;
    expect(dom.querySelector("h1")).toBeNull();
    expect(style(dom.querySelector("td"))).toMatch(/border:1px solid/);
    expect(dom.textContent).toContain("fim");
  });

  it("imagem local embutida em data URI e remota bloqueada fica bloqueada", () => {
    const root = cloneContent(content("![logo](img/a.png)\n\n![](https://x.example/y.png)"));
    root.querySelectorAll("img")[1].replaceWith(
      Object.assign(document.createElement("img"), { alt: "remota" }),
    );
    const last = root.querySelectorAll("img")[1];
    last.setAttribute("data-remote", "");
    last.setAttribute("data-remote-src", "https://x.example/y.png");
    const { html } = toRichHtml(root, { "img/a.png": { data: "data:image/png;base64,QQ==", tooBig: false } });
    expect(html).toContain('src="data:image/png;base64,QQ=="');
    expect(html).not.toContain("x.example/y.png");
    expect(html).toContain("x.example");
  });
});
