import { describe, expect, it } from "vitest";
import html from "../index.html?raw";
import { DICTS, applyI18n } from "../src/i18n";
import { findAnnouncement, keepTabbable, makeTabbable, tabKeyTarget } from "../src/a11y";

describe("acessibilidade", () => {
  it("botões, links e summary entram no Tab; tabindex explícito é respeitado", () => {
    const d = document.createElement("div");
    d.innerHTML = '<button>a</button><a href="#x">b</a><a>sem href</a><details><summary>c</summary></details><div role="tab" tabindex="-1">t</div>';
    makeTabbable(d);
    expect(d.querySelector("button")!.getAttribute("tabindex")).toBe("0");
    expect(d.querySelector("a[href]")!.getAttribute("tabindex")).toBe("0");
    expect(d.querySelector("a:not([href])")!.hasAttribute("tabindex")).toBe(false);
    expect(d.querySelector("summary")!.getAttribute("tabindex")).toBe("0");
    expect(d.querySelector("[role=tab]")!.getAttribute("tabindex")).toBe("-1");
  });

  it("controles criados depois também entram no Tab", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    keepTabbable(root);
    const wrap = document.createElement("p");
    wrap.innerHTML = "<button>copiar</button>";
    root.append(wrap);
    await Promise.resolve();
    expect(wrap.querySelector("button")!.getAttribute("tabindex")).toBe("0");
  });

  it("contagem da busca por extenso", () => {
    expect(findAnnouncement(0, 0)).toBe("Nenhum resultado");
    expect(findAnnouncement(0, 1)).toBe("1 resultado");
    expect(findAnnouncement(2, 10)).toBe("Resultado 3 de 10");
  });

  it("setas, Home e End nas abas são circulares", () => {
    expect(tabKeyTarget("ArrowRight", 2, 3)).toBe(0);
    expect(tabKeyTarget("ArrowLeft", 0, 3)).toBe(2);
    expect(tabKeyTarget("Home", 2, 3)).toBe(0);
    expect(tabKeyTarget("End", 0, 3)).toBe(2);
    expect(tabKeyTarget("a", 0, 3)).toBeNull();
    expect(tabKeyTarget("ArrowRight", 0, 0)).toBeNull();
  });

  describe("index.html", () => {
    const d = document.createElement("div");
    d.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
    // Os textos vêm do dicionário (src/i18n.ts): o teste confere o HTML já preenchido em pt-BR.
    applyI18n(d);

    it("todo botão e campo tem nome acessível (aria-label ou label[for])", () => {
      for (const b of d.querySelectorAll("button"))
        expect(b.getAttribute("aria-label") || b.textContent?.trim(), b.outerHTML).toBeTruthy();
      for (const i of d.querySelectorAll("input")) {
        const label = i.id ? d.querySelector(`label[for="${i.id}"]`)?.textContent?.trim() : "";
        expect(i.getAttribute("aria-label") || label, i.outerHTML).toBeTruthy();
      }
    });

    it("Preferências: grupos nomeados, rádios por grupo, Fechar é o único submit", () => {
      const prefs = d.querySelector("dialog#prefs")!;
      expect(prefs.getAttribute("aria-labelledby")).toBe("prefs-title");
      for (const g of prefs.querySelectorAll("section, [role=radiogroup], [role=group]")) {
        const id = g.getAttribute("aria-labelledby")!;
        expect(prefs.querySelector(`#${id}`)?.textContent?.trim(), g.outerHTML.slice(0, 80)).toBeTruthy();
      }
      for (const g of prefs.querySelectorAll("[role=radiogroup]")) {
        const names = new Set(Array.from(g.querySelectorAll("input")).map((i) => i.name));
        expect(names.size, g.outerHTML.slice(0, 80)).toBe(1);
        expect(g.querySelectorAll("input[type=radio]").length).toBe(3);
      }
      expect(prefs.querySelectorAll("input[type=checkbox]").length).toBe(6);
      const submits = Array.from(prefs.querySelectorAll("button")).filter((b) => b.type !== "button");
      expect(submits.map((b) => b.textContent)).toEqual(["Fechar"]);
      // Zoom: o valor anuncia a mudança e aponta para os botões que o mudam.
      const out = prefs.querySelector("output#prefs-zoom-value")!;
      expect(out.getAttribute("aria-live")).toBe("polite");
      for (const id of out.getAttribute("for")!.split(" ")) expect(prefs.querySelector(`#${id}`), id).not.toBeNull();
    });

    it("regiões nomeadas, diálogos rotulados, busca e barra anunciam", () => {
      expect(d.querySelector("main#main")!.getAttribute("aria-label")).toBe("Documento");
      expect(d.querySelector("nav#toc")!.getAttribute("aria-label")).toBe("Sumário");
      expect(d.querySelector("nav#tabs")!.getAttribute("aria-label")).toBeTruthy();
      for (const dlg of d.querySelectorAll("dialog")) {
        const id = dlg.getAttribute("aria-labelledby")!;
        expect(d.querySelector(`#${id}`), dlg.id).not.toBeNull();
      }
      expect(d.querySelector("#find")!.getAttribute("role")).toBe("search");
      expect(d.querySelector("#find-live")!.getAttribute("aria-live")).toBe("polite");
      expect(d.querySelector("#status")!.getAttribute("role")).toBe("status");
      expect(d.querySelector("#btn-toc")!.getAttribute("aria-controls")).toBe("toc");
    });

    it("link de pulo é o primeiro foco e aponta para o documento", () => {
      const first = d.querySelector("#app")!.firstElementChild as HTMLAnchorElement;
      expect(first.id).toBe("skip");
      expect(first.getAttribute("href")).toBe("#main");
      expect(first.textContent).toBe("Ir para o documento");
    });

    it("html declara o idioma e todo texto marcado tem chave no dicionário", () => {
      expect(html).toMatch(/<html lang="en">/);
      const raw = document.createElement("div");
      raw.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
      for (const attr of ["data-i18n", "data-i18n-html", "data-i18n-title", "data-i18n-aria-label", "data-i18n-placeholder"])
        for (const el of raw.querySelectorAll(`[${attr}]`)) expect(DICTS["pt-BR"], el.getAttribute(attr)!).toHaveProperty([el.getAttribute(attr)!]);
    });
  });

  describe("CSS e wiring do teclado (lidos do repo)", () => {
    // `?raw` de .css volta vazio no vitest; sem @types/node, o import é dinâmico e sem tipo.
    const read = async (rel: string): Promise<string> => {
      const fs = (await import("node:fs" as string)) as { readFileSync(p: string, enc: string): string };
      return fs.readFileSync(new URL(rel, import.meta.url).pathname, "utf8");
    };

    it("links, summary e botões do documento têm anel de foco por id (o tema zera o outline)", async () => {
      const css = await read("../src/styles.css");
      const rule = css.match(/#content a:focus-visible,\s*#content summary:focus-visible,\s*#content button:focus-visible \{([^}]*)\}/);
      expect(rule).not.toBeNull();
      expect(rule![1]).toMatch(/outline:\s*2px solid var\(--accent\)/);
    });

    it("link de pulo fica fora da tela até o foco e o clique foca o documento", async () => {
      const css = await read("../src/styles.css");
      expect(css.match(/\.skip \{([^}]*)\}/)![1]).toMatch(/top:\s*-\d+px/);
      expect(css.match(/\.skip:focus-visible \{([^}]*)\}/)![1]).toMatch(/top:\s*\d+px/);
      const main = await read("../src/main.ts");
      expect(main).toMatch(/\$\("skip"\)\.addEventListener\("click"[\s\S]{0,120}els\.main\.focus/);
    });

    it("reduced-motion desliga transição e animação globalmente", async () => {
      const css = await read("../src/styles.css");
      const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)![1];
      expect(block).toMatch(/transition-duration:\s*0s !important/);
      expect(block).toMatch(/animation-duration:\s*0s !important/);
    });
  });
});
