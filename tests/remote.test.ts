import { beforeAll, describe, expect, it } from "vitest";
import { render } from "../src/render";
import { isRemote, remoteHost, restoreRemote, scrubCss, scrubMermaidSource, stripRemoteTree } from "../src/remote";
import { loadYaml } from "../src/yaml";

// Front matter e dados de nó do Mermaid leem o `yaml`, que o app carrega sob demanda (src/yaml.ts).
beforeAll(() => loadYaml());

const frag = (html: string): HTMLElement => {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d;
};

describe("conteúdo remoto bloqueado no sanitize", () => {
  it("isRemote reconhece http, https e //, não local, data ou âncora", () => {
    for (const u of ["https://a.b/x.png", "http://a.b", "//cdn.x/y", "  HTTPS://A"]) expect(isRemote(u)).toBe(true);
    for (const u of ["img/a.png", "../a.png", "data:image/png;base64,AA", "#x", "asset://localhost/a", "mailto:a@b"])
      expect(isRemote(u)).toBe(false);
  });

  it("imagem Markdown remota perde o src e guarda em data-remote-src", () => {
    const img = frag(render("![logo](https://tauri.app/favicon.ico)")).querySelector("img")!;
    expect(img.hasAttribute("src")).toBe(false);
    expect(img.dataset.remoteSrc).toBe("https://tauri.app/favicon.ico");
    expect(img.hasAttribute("data-remote")).toBe(true);
  });

  it("imagem local e data: continuam com src", () => {
    const d = frag(render("![a](img/a.png) ![b](data:image/png;base64,AA)"));
    const [a, b] = Array.from(d.querySelectorAll("img"));
    expect(a.getAttribute("src")).toBe("img/a.png");
    expect(b.getAttribute("src")).toBe("data:image/png;base64,AA");
    expect(d.querySelector("[data-remote]")).toBeNull();
  });

  it("cobre srcset, poster, background e src relativo ao protocolo", () => {
    const d = frag(
      render(
        '<img srcset="a.png 1x, https://x.io/b.png 2x"><video poster="https://x.io/p.jpg" src="//x.io/v.mp4"></video><table background="https://x.io/bg.png"><tr><td>c</td></tr></table>',
      ),
    );
    expect(d.querySelector("img")!.hasAttribute("srcset")).toBe(false);
    const v = d.querySelector("video")!;
    expect(v.hasAttribute("poster")).toBe(false);
    expect(v.hasAttribute("src")).toBe(false);
    expect(d.querySelector("table")!.hasAttribute("background")).toBe(false);
    expect(d.querySelectorAll("[data-remote]").length).toBe(3);
  });

  it("tira style com url() remoto e guarda o original", () => {
    const el = frag(render('<div style="color: red; background: url(\'https://x.io/t.gif\')">x</div>')).querySelector("div")!;
    expect(el.hasAttribute("style")).toBe(false);
    expect(el.dataset.remoteStyle).toContain("https://x.io/t.gif");
  });

  it("style local continua", () => {
    const el = frag(render('<div style="color: red; font-family: \'Inter\'">x</div>')).querySelector("div")!;
    expect(el.getAttribute("style")).toContain("color: red");
    expect(el.hasAttribute("data-remote")).toBe(false);
  });

  it("desvios que o navegador normaliza também contam como remotos", () => {
    for (const u of ["\\\\x.io/a", "https:\\\\x.io/a", "ht\ttps://x.io/a", "/\\x.io/a", " \u0001//x.io/a", "HTTPS://X.IO", "ftp://x.io/a"])
      expect(isRemote(u), JSON.stringify(u)).toBe(true);
    const img = frag(render('<img src="\\\\x.io/a.png">')).querySelector("img")!;
    expect(img.hasAttribute("src")).toBe(false);
  });

  it("CSS com escape, image-set ou url() em atributo SVG é bloqueado", () => {
    const d = frag(
      render(
        '<div style="background: url(\\68ttps://x.io/a)">a</div><div style="background-image: image-set(\'https://x.io/b.png\' 1x)">b</div><svg><rect fill="url(https://x.io/s.svg#g)"></rect></svg>',
      ),
    );
    const [a, b] = Array.from(d.querySelectorAll("div"));
    expect(a.hasAttribute("style")).toBe(false);
    expect(b.hasAttribute("style")).toBe(false);
    expect(d.querySelector("rect")!.hasAttribute("fill")).toBe(false);
  });

  it("href de imagem SVG remota sai; href de link continua", () => {
    const d = frag(render('<svg><image href="https://x.io/i.png"></image></svg> [site](https://tauri.app)'));
    expect(d.querySelector("image")?.hasAttribute("href") ?? false).toBe(false);
    expect(d.querySelector("a")!.getAttribute("href")).toBe("https://tauri.app");
  });

  it("restoreRemote devolve os atributos originais", () => {
    const img = frag(render("![x](https://x.io/a.png)")).querySelector("img")!;
    restoreRemote(img);
    expect(img.getAttribute("src")).toBe("https://x.io/a.png");
    expect(img.hasAttribute("data-remote")).toBe(false);
  });

  it("remoteHost mostra só o host", () => {
    expect(remoteHost("https://tauri.app/favicon.ico")).toBe("tauri.app");
    expect(remoteHost("//cdn.x.io/a")).toBe("cdn.x.io");
  });
});

describe("árvore que não passou pelo render (SVG do Mermaid)", () => {
  it("scrubCss troca só o url() remoto por none", () => {
    const r = scrubCss(".a { fill: url(https://x.io/t.png) } .b { fill: url(#grad) } .c { background: url('//x.io/p') }");
    expect(r.blocked).toBe(2);
    expect(r.css).toBe(".a { fill: none } .b { fill: url(#grad) } .c { background: none }");
  });

  it("scrubCss segue cssIsRemote: escape, url sem fechar, @import e image-set", () => {
    expect(scrubCss("fill: url(htt\\70s://x.io/a)").css).toBe("fill: none");
    expect(scrubCss("fill: url(https://x.io/a").css).toBe("fill: none");
    const imp = scrubCss('@import "https://x.io/a.css"; @import url(local.css); .a{}');
    expect(imp.css).not.toContain("x.io");
    expect(imp.css).toContain("@import url(local.css)");
    expect(scrubCss('background: image-set("https://x.io/a.png" 1x, "b.png" 2x)').css).toBe("background: none");
    expect(scrubCss("background: url(data:image/png;base64,AA)").blocked).toBe(0);
  });

  it("stripRemoteTree limpa <style> e atributos, como faria o themeCSS ou o nó-imagem do Mermaid", () => {
    const d = frag(
      '<svg><style>.node rect { fill: url(https://x.io/themecss.png) }</style><image href="https://x.io/img.png" width="1" height="1"></image><a href="https://x.io/"><text>ok</text></a></svg>',
    );
    const blocked = stripRemoteTree(d.firstElementChild!);
    expect(blocked).toBe(2);
    expect(d.querySelector("style")!.textContent).toBe(".node rect { fill: none }");
    expect(d.querySelector("image")!.hasAttribute("href")).toBe(false);
    expect(d.querySelector("image")!.getAttribute("data-remote-href")).toBe("https://x.io/img.png");
    expect(d.querySelector("a")!.getAttribute("href")).toBe("https://x.io/");
  });
});

describe("fonte do Mermaid", () => {
  it("esvazia só o img remoto do nó-imagem, em qualquer forma YAML", () => {
    const r = scrubMermaidSource(
      [
        "flowchart LR",
        '  A@{ img: "https://x.io/a.png", label: "a" }',
        "  B@{ img: 'img/local.png' }",
        '  C@{ "img": "http://x.io/q", label: "i" }',
        "  D@{ shape: \"rect\", 'img': 'https://x.io/s' }",
        '  E@{ img: "\\x68ttp://x.io/esc" }',
        '  F@{ img: "http\\u003a//x.io/u" }',
        '  G["see img: https://x.io/label"]',
        "  H[img: texto]",
      ].join("\n"),
    );
    expect(r.blocked).toBe(5);
    expect(r.src).toContain('A@{"img":"","label":"a"}');
    expect(r.src).toContain('B@{"img":"img/local.png"}');
    expect(r.src).toContain('C@{"img":"","label":"i"}');
    expect(r.src).toContain('D@{"shape":"rect","img":""}');
    expect(r.src).toContain('E@{"img":""}');
    expect(r.src).toContain('F@{"img":""}');
    expect(r.src).toContain('G["see img: https://x.io/label"]');
    expect(r.src).toContain("H[img: texto]");
  });

  it("fecha o bloco como o lexer do Mermaid: } dentro de aspas não fecha; ilegível sai inteiro", () => {
    const r = scrubMermaidSource(
      [
        "flowchart LR",
        '  A@{ img: "https://x.io/V_brace}.png", label: "x", w: 40, h: 40 }',
        '  B@{ label: "}", img: "https://x.io/V_first.png" }',
        '  C@{ label: "a}b", img: "img/local.png" }',
        "  D@{ : : nem yaml : }",
        '  E@{ img: "https://x.io/aberto.png"',
      ].join("\n"),
    );
    expect(r.src).not.toMatch(/x\.io/);
    expect(r.src).toContain('A@{"img":"","label":"x","w":40,"h":40}');
    expect(r.src).toContain('B@{"label":"}","img":""}');
    expect(r.src).toContain('C@{"label":"a}b","img":"img/local.png"}');
    expect(r.src).toContain("  D\n");
    expect(r.src.trimEnd().endsWith("  E")).toBe(true);
    expect(r.blocked).toBe(4);
  });

  it("img que não é string local sai; @{ em rótulo ou comentário também é limpo (sobrebloqueio)", () => {
    const r = scrubMermaidSource(
      [
        "flowchart LR",
        '  A@{ img: ["https://x.io/l.png"], label: "a" }',
        '  B@{ img: [["https://x.io/ll.png"]] }',
        '  C@{ img: { u: "https://x.io/o.png" } }',
        '  D@{ img: ["//x.io/p", "x.png"] }',
        '  E["@{ img: https://x.io/rotulo.png }"]',
        "  %% F@{ img: https://x.io/comentario.png }",
        '  G@{ img: "https://x.io/g.png" }',
      ].join("\n"),
    );
    expect(r.src).toContain('A@{"img":"","label":"a"}');
    expect(r.src).toContain('B@{"img":""}');
    expect(r.src).toContain("  C }\n"); // objeto: o lexer fecha no 1º }, YAML ilegível, bloco sai
    expect(r.src).toContain('D@{"img":""}');
    expect(r.src).toContain('E["@{"img":""}"]');
    expect(r.src).toContain('%% F@{"img":""}');
    expect(r.src).toContain('G@{"img":""}');
    expect(r.src).not.toMatch(/x\.io/);
    expect(r.blocked).toBe(7);
  });

  it("limpa mesmo quando o lexer do Mermaid não veria comentário ou string antes do bloco", () => {
    const casos = [
      'flowchart LR\n  X[a %% b] --> A@{ img: "https://x.io/meio.png" }',
      '%%{init: {"a":1}}%% A@{ img: "https://x.io/diretiva.png" }',
      '---\ntitle: a"b\n---\nflowchart LR\n  A@{ img: "https://x.io/fm.png" }',
      'flowchart LR\n  A["x] B@{ img: "https://x.io/aspa.png" }',
      'flowchart LR\n  A@{ img: ["x.png", "https://x.io/lista2.png"] }',
    ];
    for (const c of casos) {
      const r = scrubMermaidSource(c);
      expect(r.src, c).not.toMatch(/x\.io/);
      expect(r.blocked, c).toBeGreaterThan(0);
    }
  });

  it("limpa url() remoto em style e classDef, mantendo local", () => {
    const r = scrubMermaidSource("classDiagram\n  class A\n  style A fill:url(https://x.io/f.png)\n  classDef g fill:url(#grad)");
    expect(r.blocked).toBe(1);
    expect(r.src).toContain("style A fill:none");
    expect(r.src).toContain("classDef g fill:url(#grad)");
  });
});
