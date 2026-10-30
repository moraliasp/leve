import { beforeAll, describe, expect, it } from "vitest";
import { decorateCodeBlocks } from "../src/code";
import { makeTabbable } from "../src/a11y";
import { EXPORT_IMAGE_MAX_BYTES, cloneContent } from "../src/export";
import { ALERT_COLORS, MERMAID_MAX_WIDTH, docRange, mermaidToImages, plainText, richCopyJob, safeHref, toRichHtml, withPngDensity } from "../src/rich";
import { render, renderMermaid, type MermaidLike } from "../src/render";
import { loadRemote } from "../src/remote-ui";
import { loadYaml } from "../src/yaml";

// Front matter e dados de nó do Mermaid leem o `yaml`, que o app carrega sob demanda (src/yaml.ts).
beforeAll(() => loadYaml());

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
    expect(pre.textContent).toBe("const a = 1;\n");
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
    expect(hrefs).toEqual(["https://example.com/", "mailto:a@b.c"]);
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
    expect(out.querySelector("pre code")!.textContent).toBe("graph TD; A-->B\n");
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

  it("links: allowlist por new URL; esquema fora de http(s)/mailto vira texto (segunda camada, DOM montado à mão)", () => {
    // Montado à mão: o DOMPurify do render já tiraria alguns destes; aqui se exercita `links()`.
    const hrefs = [
      "ftp://h/x",
      "tel:123",
      "http:foo",
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,x",
      "file:///etc/passwd",
      "asset://x",
      "vbscript:x",
      "https:\\\\evil.com",
      "HTTPS://ok.com",
      "http://a.example/p?q=1",
      "mailto:a@b.c",
    ];
    const root = document.createElement("article");
    for (const h of hrefs) {
      const a = document.createElement("a");
      a.setAttribute("href", h);
      a.textContent = `t-${h}`;
      root.appendChild(a);
    }
    const out = document.createElement("div");
    out.innerHTML = toRichHtml(root).html;
    const kept = Array.from(out.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(kept).toEqual(["https://ok.com/", "http://a.example/p?q=1", "mailto:a@b.c"]);
    // O texto dos links recusados fica.
    expect(out.textContent).toContain("t-ftp://h/x");
    expect(out.textContent).toContain("t-tel:123");
    expect(safeHref("http:foo")).toBeNull();
    expect(safeHref(" HTTPS://ok.com ")).toBe("https://ok.com/");
  });

  it("imagem remota: bloqueada não leva o src remoto; carregada pelo leitor leva (como no Exportar HTML)", () => {
    const md = "![a](https://img.example/a.png)\n\n![b](https://img.example/b.png)";
    const el = content(md);
    const [, second] = el.querySelectorAll<HTMLElement>("[data-remote]");
    // O leitor carregou só a segunda.
    loadRemote(second);
    const { html } = toRichHtml(cloneContent(el));
    expect(html).not.toContain("https://img.example/a.png");
    expect(html).toContain("img.example");
    expect(html).toContain('src="https://img.example/b.png"');
  });

  it("htmlLabels: a tela desenha com rótulos HTML, a cópia sem (config entregue ao Mermaid)", async () => {
    const configs: Record<string, unknown>[] = [];
    const mock: MermaidLike = {
      initialize: (c) => void configs.push(c),
      render: async () => ({ svg: '<svg viewBox="0 0 10 10"></svg>' }),
    };
    const page = content("```mermaid\ngraph TD; A-->B\n```");
    await renderMermaid(page, false, mock);
    expect(configs[configs.length - 1]?.htmlLabels).toBe(true);

    const c = content("```mermaid\ngraph TD; A-->B\n```");
    document.body.appendChild(c);
    await richCopyJob({ content: c, range: null, source: "src", large: true, readImages: async () => ({}), mermaid: mock });
    c.remove();
    expect(configs[configs.length - 1]?.htmlLabels).toBe(false);
  });
});

describe("Copiar como texto formatado: seleção e limite (richCopyJob)", () => {
  const md = "# Título\n\nAntes do código.\n\n```js\nconst a = 1;\n```\n\n- um\n- dois\n\nFim.";
  const job = (c: HTMLElement, range: Range | null, images: Record<string, { data: string | null; tooBig: boolean }> = {}) =>
    richCopyJob({ content: c, range, source: md, large: true, readImages: async () => images });

  it("seleção fora do documento: docRange devolve null e copia o documento inteiro com a fonte", async () => {
    const c = content(md);
    const outside = document.createElement("p");
    outside.textContent = "barra do app";
    document.body.append(outside, c);
    const r = document.createRange();
    r.setStart(outside.firstChild!, 2);
    r.setEnd(c.querySelector("p")!.firstChild!, 3);
    expect(docRange(c, r.cloneRange())).toBeNull();
    const j = await job(c, r);
    expect(j.partial).toBe(false);
    expect(j.plain).toBe(md);
    expect(j.html).toContain("Título");
    outside.remove();
    c.remove();
  });

  it("seleção parcial: partial, e o text/plain sai do clone limpo (sem rótulo da linguagem nem botão)", async () => {
    const c = content(md);
    document.body.appendChild(c);
    const r = document.createRange();
    r.setStartBefore(c.querySelector("p")!);
    r.setEndAfter(c.querySelector("ul")!);
    const j = await job(c, r);
    expect(j.partial).toBe(true);
    expect(j.plain).toBe("Antes do código.\nconst a = 1;\n- um\n- dois");
    expect(j.plain).not.toMatch(/\bjs\b/);
    expect(j.html).not.toContain("Título");
    expect(j.html).not.toContain("Fim.");
    c.remove();
  });

  it("seleção com dois blocos de código seguidos (#28): separados por parágrafo vazio, cada um terminando em \\n", async () => {
    const src = "## Código\n\n```ts\nconst a = 1;\n```\n\n```bash\npnpm dev\n```\n\nDepois.";
    const c = content(src);
    document.body.appendChild(c);
    const r = document.createRange();
    r.setStart(c.querySelector("h2")!.firstChild!, 0);
    // Como o arrasto do mouse: termina no fim do texto do 2º bloco, sem o `\n` final.
    const last = c.querySelectorAll("pre code")[1].lastChild!;
    r.setEnd(last, (last.textContent ?? "").replace(/\n$/, "").length);
    const j = await richCopyJob({ content: c, range: r, source: src, large: true, readImages: async () => ({}) });
    c.remove();
    const dom = document.createElement("div");
    dom.innerHTML = j.html;
    const pres = dom.querySelectorAll("pre");
    expect(pres).toHaveLength(2);
    for (const pre of pres) {
      expect(style(pre)).toContain("background-color:#f6f8fa");
      expect(pre.textContent).toMatch(/\n$/);
    }
    const gap = pres[0].nextElementSibling!;
    expect(gap.tagName).toBe("P");
    expect(gap.textContent).toBe("");
    expect(gap.nextElementSibling).toBe(pres[1]);
    expect(j.html).not.toMatch(/>\s*(ts|bash)\s*</);
    expect(j.plain).toBe("Código\nconst a = 1;\npnpm dev");
  });

  it("documento inteiro: o mesmo parágrafo vazio entre blocos de código seguidos, e só entre eles", () => {
    const { dom } = richOf("```js\na\n```\n\n```js\nb\n```\n\ntexto\n\n```js\nc\n```");
    const kids = Array.from(dom.querySelector("div")!.children,(el) => el.tagName + (el.textContent === "" ? "·" : ""));
    expect(kids).toEqual(["PRE", "P·", "PRE", "P", "PRE"]);
  });

  it("seleção dentro de uma fórmula é ampliada para a fórmula inteira", () => {
    const c = content("texto $a+b$ fim");
    document.body.appendChild(c);
    const m = c.querySelector(".math")!;
    const r = document.createRange();
    r.setStart(m.firstChild!, 1);
    r.setEnd(m.firstChild!, 2);
    const got = docRange(c, r)!;
    expect(got.toString()).toBe("a+b");
    c.remove();
  });

  it("imagem local acima de 5 MB não é embutida, mesmo que a leitura a devolva", async () => {
    const c = content("![grande](big.png)\n\n![pequena](small.png)");
    document.body.appendChild(c);
    const big = "data:image/png;base64," + "A".repeat(Math.ceil(((EXPORT_IMAGE_MAX_BYTES + 1024) * 4) / 3));
    const j = await job(c, null, { "big.png": { data: big, tooBig: false }, "small.png": { data: "data:image/png;base64,QQ==", tooBig: false } });
    expect(j.oversized).toBe(1);
    expect(j.html).not.toContain(big.slice(0, 64) + "AAAA");
    expect(j.html).toContain('src="big.png"');
    expect(j.html).toContain('src="data:image/png;base64,QQ=="');
    c.remove();
  });

  it("plainText: imagem do Mermaid entra pelo alt (\"Diagrama Mermaid\")", async () => {
    const root = cloneContent(content("Antes.\n\n```mermaid\ngraph TD; A-->B\n```\n\nDepois."));
    const pre = root.querySelector<HTMLElement>("pre.mermaid")!;
    pre.dataset.src = "graph TD; A-->B";
    pre.innerHTML = '<svg viewBox="0 0 100 50"></svg>';
    await mermaidToImages(root, async () => ({ data: "data:image/png;base64,AAAA", width: 100, height: 50 }));
    expect(toRichHtml(root).text).toBe("Antes.\nDiagrama Mermaid\nDepois.");
  });

  it("plainText: blocos, células com tabulação e listas numeradas", () => {
    const d = document.createElement("div");
    d.innerHTML = "<h2>T</h2>\n<table><tr><td>a</td><td>b</td></tr></table>\n<ol><li>x</li><li>y</li></ol><pre>  if (a)\n    b</pre>";
    expect(plainText(d)).toBe("T\na\tb\n1. x\n2. y\n  if (a)\n    b");
  });
});

/** PNG mínimo: assinatura, `IHDR` com a largura dada, os blocos extras e `IEND` (CRC zerado: não é lido). */
function png(width: number, extra: [string, number[]][] = []): string {
  const chunk = (type: string, data: number[]): number[] => {
    const len = data.length;
    return [len >>> 24, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...Array.from(type, (c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  };
  const ihdr = [width >>> 24, (width >>> 16) & 255, (width >>> 8) & 255, width & 255, 0, 0, 0, 10, 8, 2, 0, 0, 0];
  const bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", ihdr), ...extra.flatMap(([t, d]) => chunk(t, d)), ...chunk("IEND", [])];
  return "data:image/png;base64," + btoa(String.fromCharCode(...bytes));
}

/** Blocos do PNG em ordem: tipo, dados e CRC gravado. */
function chunks(data: string): { type: string; data: Uint8Array; crc: number; raw: Uint8Array }[] {
  const b = Uint8Array.from(atob(data.slice(data.indexOf(",") + 1)), (c) => c.charCodeAt(0));
  const v = new DataView(b.buffer);
  const out = [];
  for (let at = 8; at < b.length; ) {
    const len = v.getUint32(at);
    out.push({ type: String.fromCharCode(...b.subarray(at + 4, at + 8)), data: b.subarray(at + 8, at + 8 + len), crc: v.getUint32(at + 8 + len), raw: b.subarray(at + 4, at + 8 + len) });
    at += 12 + len;
  }
  return out;
}

describe("withPngDensity (Mermaid colado no tamanho certo no TextEdit/Pages)", () => {
  it("põe pHYs logo depois do IHDR, com a densidade que faz a largura em px virar a largura em pt", async () => {
    const { crc32 } = (await import("node:zlib" as string)) as { crc32(b: Uint8Array): number };
    const out = chunks(withPngDensity(png(1280, [["IDAT", [1, 2, 3]]]), 640));
    expect(out.map((c) => c.type)).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
    const phys = out[1];
    const v = new DataView(phys.data.buffer, phys.data.byteOffset, 9);
    // 2×: 144 dpi = 5669 px/m nos dois eixos, unidade metro.
    expect([v.getUint32(0), v.getUint32(4), phys.data[8]]).toEqual([5669, 5669, 1]);
    expect(phys.crc).toBe(crc32(phys.raw));
    expect(out[2].data).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("diagrama mais largo que o limite: a densidade acompanha a redução (1800 px em 640 pt)", () => {
    const phys = chunks(withPngDensity(png(1800), 640)).find((c) => c.type === "pHYs")!;
    expect(new DataView(phys.data.buffer, phys.data.byteOffset, 9).getUint32(0)).toBe(Math.round((1800 * 72) / 640 / 0.0254));
  });

  it("troca o pHYs que já houver, sem duplicar", () => {
    const out = chunks(withPngDensity(png(200, [["pHYs", [0, 0, 11, 19, 0, 0, 11, 19, 1]], ["IDAT", [9]]]), 100));
    expect(out.map((c) => c.type)).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
    expect(new DataView(out[1].data.buffer, out[1].data.byteOffset, 9).getUint32(0)).toBe(5669);
  });

  it("o que não é PNG volta igual", () => {
    for (const d of ["data:image/png;base64,AAAA", "data:image/jpeg;base64,/9j/", "data:image/png;base64,***"]) expect(withPngDensity(d, 640)).toBe(d);
    expect(withPngDensity(png(10), 0)).toBe(png(10));
  });

  it("mermaidToImages grava a densidade da largura final na <img>", async () => {
    const root = cloneContent(content("```mermaid\ngraph TD; A-->B\n```"));
    root.querySelector<HTMLElement>("pre.mermaid")!.innerHTML = '<svg viewBox="0 0 400 100"></svg>';
    await mermaidToImages(root, async () => ({ data: png(800), width: 400, height: 100 }));
    const img = root.querySelector("img")!;
    expect(img.getAttribute("width")).toBe("400");
    const phys = chunks(img.getAttribute("src")!).find((c) => c.type === "pHYs")!;
    expect(new DataView(phys.data.buffer, phys.data.byteOffset, 9).getUint32(0)).toBe(5669);
  });
});
