import { describe, expect, it } from "vitest";
import { render } from "../src/render";
import { decorateCodeBlocks } from "../src/code";
import { makeTabbable } from "../src/a11y";
import {
  CSS_NOTICE,
  EXPORT_IMAGE_MAX_BYTES,
  EXPORT_TOKENS,
  buildExportHtml,
  cloneContent,
  inlineFontFaces,
  localImageRels,
  pageTitle,
  type ExportInput,
} from "../src/export";

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

const base: ExportInput = { fileName: "nota.md", lang: "pt-BR", css: ".x{color:red}", mdLinks: "text", images: {} };

function exportOf(md: string, input: Partial<ExportInput> = {}) {
  return buildExportHtml(cloneContent(content(md)), { ...base, ...input });
}

describe("Exportar HTML", () => {
  it("documento completo, sem script, com o CSS embutido e a política sem script", () => {
    const el = content("# Título\n\ntexto");
    // Mesmo que algo tenha escapado até o DOM, o arquivo não leva script nem handler.
    el.insertAdjacentHTML("beforeend", '<script>alert(1)</script><p onclick="x()">p</p>');
    const { html } = buildExportHtml(cloneContent(el), base);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toMatch(/<script|onclick/i);
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain(".x{color:red}");
    expect(html).toContain(CSS_NOTICE);
    expect(html).toMatch(/Content-Security-Policy" content="default-src 'none';/);
    expect(html).toContain('<article class="markdown-body">');
  });

  it("não altera a página: trabalha num clone", () => {
    const el = content("```js\nlet a = 1\n```");
    buildExportHtml(cloneContent(el), base);
    expect(el.querySelector(".code-copy")).not.toBeNull();
  });

  it("título: primeiro h1, senão o nome do arquivo sem extensão", () => {
    expect(exportOf("intro\n\n# Primeiro  título\n\n# Outro").title).toBe("Primeiro título");
    expect(exportOf("## só h2").title).toBe("nota");
    expect(exportOf("# <b>&</b> R").html).toContain("<title>&amp; R</title>");
    expect(pageTitle(document.createElement("div"), "relatorio.final.md")).toBe("relatorio.final");
  });

  it("tira o botão de copiar e os atributos do app, mantém rótulo da linguagem e âncoras", () => {
    const { html } = exportOf("## Seção\n\n```ts\nconst a = 1\n```\n\n[ir](#seção)");
    expect(html).not.toContain("code-copy");
    expect(html).not.toContain("<button");
    expect(html).toContain('<span class="code-lang">ts</span>');
    expect(html).not.toMatch(/tabindex|data-hl|data-local-src/);
    expect(html).toContain('id="seção"');
    expect(html).toContain('href="#se%C3%A7%C3%A3o"');
  });

  it("bloco sem linguagem não deixa .code-tools vazio", () => {
    expect(exportOf("```\ntexto\n```").html).not.toContain("code-tools");
  });

  it("link .md vira texto com o caminho, ou o .html irmão; externo e âncora ficam", () => {
    const md = "[Outro](docs/outro.md#parte) [docs/b.md](docs/b.md) [site](https://x.org/a.md) [[nota]] [x](#y) [pdf](a.pdf)";
    const text = exportOf(md).html;
    expect(text).toContain('<span class="md-link">Outro (docs/outro.md)</span>');
    expect(text).toContain('<span class="md-link">docs/b.md</span>');
    expect(text).toContain('<span class="md-link">nota (nota.md)</span>');
    expect(text).toContain('href="https://x.org/a.md"');
    expect(text).toContain('href="#y"');
    expect(text).toContain('href="a.pdf"');
    expect(text).not.toMatch(/href="(?!https:)[^"]*\.md/);

    const html = exportOf(md, { mdLinks: "html" }).html;
    expect(html).toContain('href="docs/outro.html#parte"');
    expect(html).toContain('href="docs/b.html"');
    expect(html).toContain('href="nota.html"');
    expect(html).toContain('href="https://x.org/a.md"');
  });

  it("wikilink sem nota vira texto mesmo com links .html", () => {
    const el = content("[[sumida]]");
    el.querySelector("a.wikilink")!.classList.add("missing");
    const { html } = buildExportHtml(cloneContent(el), { ...base, mdLinks: "html" });
    expect(html).toContain('<span class="md-link">sumida (sumida.md)</span>');
  });

  it("imagem local: data URI até o limite; acima mantém o caminho relativo e conta", () => {
    const el = content("![a](img/a.png) ![b](img/grande%20b.png) ![c](img/sumiu.png)");
    const root = cloneContent(el);
    expect(localImageRels(root)).toEqual(["img/a.png", "img/grande b.png", "img/sumiu.png"]);
    const { html, oversized } = buildExportHtml(root, {
      ...base,
      images: {
        "img/a.png": { data: "data:image/png;base64,AAAA", tooBig: false },
        "img/grande b.png": { data: null, tooBig: true },
        "img/sumiu.png": { data: null, tooBig: false },
      },
    });
    expect(oversized).toBe(1);
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain('src="img/grande%20b.png"');
    expect(html).toContain('src="img/sumiu.png"');
    expect(html).not.toContain("asset://");
    expect(EXPORT_IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  it("imagem remota bloqueada sai bloqueada, sem a URL; carregada mantém a URL", () => {
    const el = content("![logo](https://rastreio.example/p.png) ![ok](https://cdn.example/ok.png)");
    // Como o app deixa: placeholder ao lado da bloqueada; a segunda o leitor carregou.
    const [blocked, loaded] = el.querySelectorAll<HTMLImageElement>("img");
    blocked.classList.add("remote-hidden");
    blocked.insertAdjacentHTML("afterend", '<button class="img-remote">carregar</button>');
    loaded.setAttribute("src", loaded.dataset.remoteSrc!);
    for (const a of Array.from(loaded.attributes)) if (a.name.startsWith("data-remote")) loaded.removeAttribute(a.name);
    const { html } = buildExportHtml(cloneContent(el), base);
    expect(html).not.toContain("rastreio.example/p.png");
    expect(html).not.toMatch(/data-remote|img-remote|remote-hidden/);
    expect(html).toContain('<span class="img-missing img-blocked"><span class="img-missing-alt">logo</span> <code>rastreio.example</code></span>');
    expect(html).toContain('src="https://cdn.example/ok.png"');
  });

  it("front matter fica como o bloco de metadados do app", () => {
    const { html } = exportOf("---\ntitulo: X\ntags: [a, b]\n---\n\n# Doc");
    expect(html).toContain('<details class="frontmatter" open="">');
    expect(html).toContain('<span class="fm-tag">a</span>');
  });

  it("</style> no CSS não fecha o bloco antes da hora", () => {
    const { html } = exportOf("x", { css: 'a::after{content:"</style><script>"}' });
    expect(html.match(/<\/style>/g)).toHaveLength(1);
  });

  it("cores do documento exportado batem com o :root claro de styles.css", async () => {
    const fs = (await import("node:fs" as string)) as { readFileSync(p: string, enc: string): string };
    const root = fs.readFileSync("src/styles.css", "utf8").match(/^:root \{([^}]*)\}/m)![1];
    for (const [k, v] of Object.entries(EXPORT_TOKENS)) expect(root, k).toMatch(new RegExp(`${k}:\\s*${v.replace(/[()]/g, "\\$&")};`));
  });

  it("CSS do documento sai de document.css, que o app também importa", async () => {
    const fs = (await import("node:fs" as string)) as { readFileSync(p: string, enc: string): string };
    const main = fs.readFileSync("src/main.ts", "utf8");
    expect(main).toMatch(/import "\.\/styles\.css";\nimport "\.\/document\.css";/);
    const doc = fs.readFileSync("src/document.css", "utf8");
    for (const sel of [".markdown-body .alert", "details.frontmatter", ".code-lang", ".markdown-body .math-block", ".markdown-body .img-missing"])
      expect(doc, sel).toContain(sel);
    expect(fs.readFileSync("src/export-css.ts", "utf8")).toContain('import documentCss from "./document.css?inline"');
  });
});

describe("fontes do KaTeX embutidas", () => {
  const css =
    '.a{}@font-face{font-family:KaTeX_Main;font-style:normal;font-weight:400;src:url(/assets/Main.woff2)format("woff2")}' +
    "@font-face{font-family:KaTeX_Main;font-style:italic;font-weight:700;src:url(/assets/MainBI.woff2) format(\"woff2\")}" +
    "@font-face{font-family:KaTeX_AMS;font-style:normal;font-weight:400;src:url(/assets/AMS.woff2)format(\"woff2\")}.b{}";

  it("só as usadas, como data URI woff2; as outras saem", async () => {
    const asked: string[] = [];
    const out = await inlineFontFaces(
      css,
      (f, s, w) => f === "KaTeX_Main" && s === "normal" && w === "400",
      async (u) => (asked.push(u), "data:font/woff2;base64,QQ=="),
    );
    expect(asked).toEqual(["/assets/Main.woff2"]);
    expect(out).toContain('src:url(data:font/woff2;base64,QQ==) format("woff2")');
    expect(out).not.toContain("/assets/");
    expect(out).not.toContain("KaTeX_AMS");
    expect(out.startsWith(".a{}") && out.endsWith(".b{}")).toBe(true);
  });

  it("fonte que não carregou sai da regra (o KaTeX cai na fonte do sistema)", async () => {
    const out = await inlineFontFaces(css, () => true, async () => null);
    expect(out).toBe(".a{}.b{}");
  });
});
