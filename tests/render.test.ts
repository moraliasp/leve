import { beforeAll, describe, expect, it, vi } from "vitest";
import { joinPath, render, renderMermaid, slugify } from "../src/render";
import type { MermaidLike } from "../src/render";
import { restoreRemote } from "../src/remote";
import { hasFrontMatter, loadYaml } from "../src/yaml";

// Front matter e dados de nó do Mermaid leem o `yaml`, que o app carrega sob demanda (src/yaml.ts).
beforeAll(() => loadYaml());

describe("slugify", () => {
  it("segue o GitHub: minúsculas, sem pontuação, espaços viram hífen", () => {
    expect(slugify("Texto e links")).toBe("texto-e-links");
    expect(slugify("  Windows (opcional) ")).toBe("windows-opcional");
    expect(slugify("Citação e imagem")).toBe("citação-e-imagem");
    expect(slugify("Nível 4!")).toBe("nível-4");
    expect(slugify("a-b_c")).toBe("a-b_c".replace("_", ""));
  });
});

describe("joinPath", () => {
  it("junta relativo à pasta, resolvendo . e ..", () => {
    expect(joinPath("/docs", "exemplo.md")).toBe("/docs/exemplo.md");
    expect(joinPath("/docs/sub", "../README.md")).toBe("/docs/README.md");
    expect(joinPath("/docs", "./a/./b.md")).toBe("/docs/a/b.md");
  });
  it("não sobe além da raiz", () => {
    expect(joinPath("/docs", "../../../x.md")).toBe("/x.md");
  });
  it("mantém caminho absoluto como veio", () => {
    expect(joinPath("/docs", "/abs/x.md")).toBe("/abs/x.md");
    expect(joinPath("C:\\docs", "D:\\x.md")).toBe("D:\\x.md");
  });
  it("respeita separador do Windows", () => {
    expect(joinPath("C:\\docs\\sub", "..\\img\\a.png")).toBe("C:\\docs\\img\\a.png");
  });
});

describe("render: sanitização", () => {
  it("permite HTML cru mas remove script, style e iframe", () => {
    const html = render('<b>ok</b><script>alert(1)</script><style>b{}</style><iframe src="x"></iframe>');
    expect(html).toContain("<b>ok</b>");
    expect(html).not.toMatch(/<script|<style|<iframe/);
  });
  it("remove handlers inline", () => {
    expect(render('<a href="#" onclick="x()">a</a>')).not.toContain("onclick");
  });
  it("remove formulário: action e formaction navegariam a janela para fora", () => {
    const html = render('<form action="https://evil.example/x"><input name="q"><button formaction="https://evil.example/y">Enviar</button></form>');
    expect(html).not.toMatch(/<form|action=|formaction=/);
  });
  it("mantém o mapa de imagem; o clique em area é tratado como link em main.ts", () => {
    const html = render('<img src="a.png" usemap="#m"><map name="m"><area shape="rect" coords="0,0,1,1" href="https://x.io/"></map>');
    expect(html).toContain('<area shape="rect" coords="0,0,1,1" href="https://x.io/">');
  });
  it("tira position: fixed do style (cobriria a barra do app), mantendo o resto", () => {
    const html = render('<div style="position:fixed;top:0;left:0;right:0;height:38px;background:#9e1327;z-index:9">x</div>');
    expect(html).not.toMatch(/fixed/);
    expect(html).toContain("background:#9e1327");
    expect(render('<div style="position:/**/fixed !important; color: red">x</div>')).not.toMatch(/fixed/);
    expect(render('<div style="POSITION : FIXED; color: red">x</div>')).not.toMatch(/fixed/i);
    expect(render('<div style="position:fixed;color:red;position:fixed">x</div>')).not.toMatch(/fixed/);
    expect(render('<div style="position: relative; top: 2px">x</div>')).toContain("position: relative");
    expect(render('<div style="table-layout: fixed">x</div>')).toContain("table-layout: fixed");
  });
  it("dialog e invoker commands saem: abririam um modal na camada superior, fora da contenção", () => {
    const html = render('<button command="show-modal" commandfor="d">Continuar</button><dialog id="d" open>x</dialog>');
    expect(html).not.toMatch(/<dialog|command=|commandfor=/);
    expect(html).toContain("<button>Continuar</button>");
  });

  it("#content é bloco de contenção no CSS do app (contain: layout em .markdown-body)", async () => {
    // `?raw` de .css volta vazio no vitest; sem @types/node, o import é dinâmico e sem tipo.
    const fs = (await import("node:fs" as string)) as { readFileSync(p: string, enc: string): string };
    const css = fs.readFileSync("src/styles.css", "utf8");
    const rule = css.match(/\.markdown-body \{[^}]*\}/)?.[0] ?? "";
    expect(rule).toMatch(/contain:\s*layout/);
    expect(rule).toMatch(/overflow-x:\s*auto/);
  });

  it("style com escape CSS ou var() cai inteiro, e o que volta no Carregar imagens remotas não traz fixed", () => {
    expect(render('<div style="\\70osition:fixed;top:0">x</div>')).not.toMatch(/style=|data-remote-style/);
    expect(render('<div style="--p:fixed;position:var(--p);top:0">x</div>')).not.toMatch(/style=|data-remote-style/);
    expect(render('<div style="position:var(--p,fixed)">x</div>')).not.toMatch(/style=|data-remote-style/);
    expect(render('<div style="position:/**/var(--p)">x</div>')).not.toMatch(/style=|data-remote-style/);
    expect(render('<div style="color:VAR (--c)">x</div>')).not.toMatch(/style=/);
    const d = document.createElement("div");
    d.innerHTML = render('<div style="position:fixed;top:0;background:url(https://x.io/t.png)">x</div>');
    const el = d.querySelector("div")!;
    expect(el.hasAttribute("style")).toBe(false);
    restoreRemote(el);
    expect(el.getAttribute("style")).toContain("https://x.io/t.png");
    expect(el.getAttribute("style")).not.toMatch(/fixed/);
  });
  it("popover (camada superior) não passa", () => {
    const html = render('<button popovertarget="p">x</button><div id="p" popover="manual">cobre</div>');
    expect(html).not.toMatch(/popover/);
    expect(html).toContain("cobre");
  });
});

describe("render: código e mermaid", () => {
  it("destaca linguagem conhecida e escapa desconhecida", () => {
    // O render só marca a linguagem e escapa; o realce vem depois (tests/highlight.test.ts).
    expect(render("```ts\nconst a = 1;\n```")).toContain('<pre class="hljs"><code class="language-ts">const a = 1;\n</code></pre>');
    expect(render("```xyzlang\n<b>\n```")).toContain('<code class="language-xyzlang">&lt;b&gt;');
    expect(render('```"><img src=x onerror=alert(1)>\nx\n```')).toContain('<code class="language-text">');
  });
  it("bloco mermaid vira pre.mermaid com a fonte escapada", () => {
    expect(render("```mermaid\nA --> B\n```")).toBe('<pre class="mermaid">A --&gt; B\n</pre>\n');
  });
});

describe("render: matemática", () => {
  it("inline $...$ vira .math-inline com a fonte", () => {
    expect(render("é $E = mc^2$ aqui")).toContain('<span class="math math-inline">E = mc^2</span>');
  });
  it("bloco $$ em uma ou várias linhas vira .math-block", () => {
    expect(render("$$ a+b $$")).toContain('<div class="math math-block">a+b</div>');
    expect(render("$$\n\\int_0^1 x\n$$")).toContain('<div class="math math-block">\\int_0^1 x</div>');
  });
  it("cifrão de dinheiro e \\$ escapado continuam texto", () => {
    const html = render("custa $5 e $10, ou \\$20");
    expect(html).not.toContain("math");
    expect(html).toContain("custa $5 e $10, ou $20");
  });
  it("não mexe em $ dentro de código", () => {
    expect(render("`$x$`")).toContain("<code>$x$</code>");
  });
});

describe("render: wikilinks", () => {
  it("[[nota]] vira link interno com data-target", () => {
    expect(render("[[nota]]")).toContain('<a href="nota.md" class="wikilink" data-target="nota" data-hash="">nota</a>');
  });
  it("alias, título e mesmo documento", () => {
    expect(render("[[nota|Rótulo]]")).toContain(">Rótulo</a>");
    expect(render("[[nota#Seção]]")).toContain('href="nota.md#Seção"');
    expect(render("[[#Seção]]")).toContain('href="#Seção" class="wikilink" data-target=""');
  });
  it("embed ![[x]] fica como texto", () => {
    expect(render("![[img.png]]")).toContain("![[img.png]]");
  });
});

describe("render: alerts e callouts", () => {
  it("GitHub [!NOTE] vira div.alert com título traduzido", () => {
    const html = render("> [!NOTE]\n> corpo");
    expect(html).toContain('class="alert alert-note"');
    expect(html).toContain('class="alert-title">Nota</');
    expect(html).toContain("corpo");
  });
  it("tipo Obsidian com alias cai no estilo canônico e aceita título", () => {
    const html = render("> [!hint] Meu título\n> corpo");
    expect(html).toContain("alert-tip");
    expect(html).toContain("Meu título");
  });
  it("marcadores - e + viram details fechado/aberto", () => {
    expect(render("> [!faq]- t\n> c")).toMatch(/<details class="alert alert-[a-z]+">/);
    expect(render("> [!success]+ t\n> c")).toMatch(/<details class="alert alert-tip" open(="")?>/);
  });
  it("citação comum segue blockquote", () => {
    expect(render("> só citação")).toMatch(/^<blockquote>/);
  });
});

describe("render: frontmatter", () => {
  it("YAML no topo vira bloco de metadados com tags e aninhado", () => {
    const html = render("---\ntitle: T\ntags: [a, b]\nautor:\n  nome: X\n---\n# H");
    expect(html).toMatch(/^<details class="frontmatter" open(="")?><summary>Metadados<\/summary><table>/);
    expect(html).toContain("<th>title</th>");
    expect(html).toContain('<span class="fm-tag">a</span>');
    expect(html).toContain('<pre class="fm-nested">nome: X</pre>');
    expect(html).toContain('<h1 id="h"');
  });
  it("YAML inválido mostra a fonte sem quebrar", () => {
    const html = render("---\n: [\n---\ntexto");
    expect(html).toContain("YAML inválido");
    expect(html).toContain("texto");
  });
  it("sem frontmatter não gera o bloco", () => {
    expect(render("# H")).not.toContain("frontmatter");
  });
  it("sem o yaml carregado: front matter vira a fonte e dado de nó do Mermaid sai inteiro", async () => {
    vi.resetModules();
    const fresh = await import("../src/render");
    const remote = await import("../src/remote");
    expect((await import("../src/yaml")).loadedYaml()).toBeNull();
    const html = fresh.render("---\ntitle: T\n---\n# H");
    expect(html).toMatch(/<summary>[^<]+<\/summary><pre>title: T<\/pre>/);
    expect(html).toContain('<h1 id="h"');
    const r = remote.scrubMermaidSource('flowchart LR\n  A@{ label: "a" }');
    expect(r).toEqual({ src: "flowchart LR\n  A", blocked: 1 });
    vi.resetModules();
  });
  it("hasFrontMatter segue o plugin: só `---` no começo", () => {
    expect(hasFrontMatter("---\na: 1\n---")).toBe(true);
    expect(hasFrontMatter("# H\n---\na: 1")).toBe(false);
    expect(hasFrontMatter(" ---")).toBe(false);
  });
});

describe("renderMermaid", () => {
  it("liga as três defesas: secure com themeCSS, fonte limpa antes do render, SVG limpo depois", async () => {
    const seen: { config?: Record<string, unknown>; src?: string } = {};
    const fake: MermaidLike = {
      initialize: (c) => void (seen.config = c),
      render: async (_id, src) => {
        seen.src = src;
        return {
          svg: '<svg><style>.a{background:url(https://x.io/b.png)}</style><image href="https://x.io/c.png"/></svg>',
        };
      },
    };
    const root = document.createElement("div");
    root.innerHTML = render('```mermaid\nflowchart LR\n  A@{ img: "https://x.io/a.png", label: "a" }\n```');
    await renderMermaid(root, false, fake);
    expect(seen.config?.securityLevel).toBe("strict");
    expect(seen.config?.secure).toEqual(expect.arrayContaining(["themeCSS", "fontFamily", "altFontFamily"]));
    expect(seen.src).toContain('A@{"img":"","label":"a"}');
    expect(seen.src).not.toContain("x.io/a.png");
    expect(root.innerHTML).not.toContain("x.io/b.png");
    expect(root.querySelector("image")!.hasAttribute("href")).toBe(false);
    expect(root.querySelector("image")!.getAttribute("data-remote-href")).toBe("https://x.io/c.png");
  });
});
