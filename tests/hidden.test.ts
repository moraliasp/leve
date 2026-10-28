import { describe, expect, it } from "vitest";
import {
  findInvisibleRuns,
  hasInvisible,
  hiddenReason,
  hiddenTotal,
  markInvisibles,
  newCommentSink,
  revealHidden,
  runLabel,
  scanHidden,
  stripHiddenMarks,
} from "../src/hidden";
import { render } from "../src/render";
import { buildExportHtml, cloneContent } from "../src/export";
import { toRichHtml } from "../src/rich";
import fixture from "./fixtures/oculto.md?raw";

const LABELS = { comment: "Comentário", element: "Oculto", char: "Caractere invisível" };

function mount(src: string): { root: HTMLElement; sink: ReturnType<typeof newCommentSink> } {
  const sink = newCommentSink();
  const root = document.createElement("article");
  root.id = "content";
  root.innerHTML = render(src, { comments: sink });
  document.body.replaceChildren(root);
  return { root, sink };
}

describe("findInvisibleRuns", () => {
  it("acha cada faixa da lista e agrupa os seguidos", () => {
    for (const cp of [0x200b, 0x200f, 0x202a, 0x202e, 0x2060, 0x2064, 0x2066, 0x2069, 0xfeff, 0xe0041]) {
      expect(findInvisibleRuns(`a${String.fromCodePoint(cp)}b`)).toHaveLength(1);
    }
    const runs = findInvisibleRuns("a​​‌b c⁦d");
    expect(runs.map((r) => [r.start, r.end])).toEqual([
      [1, 4],
      [7, 8],
    ]);
    expect(runs[0].codes).toEqual([0x200b, 0x200b, 0x200c]);
  });

  it("não acha nada fora da lista", () => {
    expect(findInvisibleRuns("texto comum, acentuação, 中文,   e ‐")).toEqual([]);
  });

  it("ZWJ entre emojis é legítimo; solto, não", () => {
    for (const e of ["👩‍💻", "👨‍👩‍👧", "🏳️‍🌈", "👩🏽‍💻", "❤️‍🔥", "🏴‍☠️"]) expect(findInvisibleRuns(e), e).toEqual([]);
    expect(findInvisibleRuns("a‍b")).toHaveLength(1);
    expect(findInvisibleRuns("👩‍")).toHaveLength(1);
    expect(findInvisibleRuns("‍💻")).toHaveLength(1);
  });

  it("ZWJ/ZWNJ entre letras de escrita que os usa é legítimo", () => {
    expect(findInvisibleRuns("می‌خواهم")).toEqual([]); // persa
    expect(findInvisibleRuns("क्‍ष")).toEqual([]); // devanágari
    expect(findInvisibleRuns("ab‌cd")).toHaveLength(1);
  });

  it("árabe e hebraico sem controle de direção não disparam", () => {
    expect(findInvisibleRuns("مرحبا بالعالم — שלום עולם")).toEqual([]);
  });

  it("tags de bandeira de subdivisão são legítimas; tags soltas, não", () => {
    expect(findInvisibleRuns("🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}")).toEqual([]);
    const smuggled = [..."ignore"].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join("");
    expect(findInvisibleRuns(`ok${smuggled}`)).toHaveLength(1);
    // Bandeira sem o terminador não vale como bandeira.
    expect(findInvisibleRuns("🏴\u{E0067}\u{E0062}")).toHaveLength(1);
  });

  it("BOM só é legítimo no início do documento", () => {
    expect(findInvisibleRuns("﻿título", true)).toEqual([]);
    expect(findInvisibleRuns("﻿título")).toHaveLength(1);
    expect(findInvisibleRuns("a﻿b", true)).toHaveLength(1);
  });

  it("documento grande: uma passada linear", () => {
    const big = "texto comum sem nada escondido. ".repeat(80_000); // ~2,5 MB
    const t0 = performance.now();
    expect(hasInvisible(big)).toBe(false);
    expect(findInvisibleRuns(big + "​")).toHaveLength(1);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe("runLabel", () => {
  it("agrupa códigos e escreve o texto das tags", () => {
    expect(runLabel([0x200b])).toBe("U+200B");
    expect(runLabel([0x200b, 0x200b, 0x200b, 0x202e])).toBe("U+200B×3 U+202E");
    const tags = [..."hi"].map((c) => 0xe0000 + c.charCodeAt(0));
    expect(runLabel(tags)).toBe("U+E00xx×2 “hi”");
  });
});

describe("hiddenReason", () => {
  const el = (html: string): Element => {
    const d = document.createElement("div");
    d.innerHTML = html;
    return d.firstElementChild!;
  };
  it("atributo, estilo, etiqueta e classe do app", () => {
    expect(hiddenReason(el("<span hidden>x</span>"))).toBe("hidden");
    expect(hiddenReason(el('<span style="color:red; DISPLAY: none">x</span>'))).toBe("display:none");
    expect(hiddenReason(el('<span style="visibility:hidden">x</span>'))).toBe("visibility:hidden");
    expect(hiddenReason(el('<span style="opacity:0.0">x</span>'))).toBe("opacity:0");
    expect(hiddenReason(el('<span style="font-size:0px">x</span>'))).toBe("font-size:0");
    expect(hiddenReason(el('<span style="display:none !important">x</span>'))).toBe("display:none");
    expect(hiddenReason(el('<span class="hidden">x</span>'))).toBe('class="hidden"');
    expect(hiddenReason(el('<input type="hidden" value="x">'))).toBe('type="hidden"');
    expect(hiddenReason(el("<template><p>x</p></template>"))).toBe("<template>");
    expect(hiddenReason(el('<span data-remote-style="display:none">x</span>'))).toBe("display:none");
  });
  it("visível não conta, nem <details> fechado", () => {
    expect(hiddenReason(el('<span style="color:red;opacity:0.5;font-size:12px">x</span>'))).toBeNull();
    expect(hiddenReason(el("<details><summary>s</summary>x</details>"))).toBeNull();
    expect(hiddenReason(el('<input type="text">'))).toBeNull();
  });
});

describe("scanHidden + render", () => {
  it("comentários viram marcador; o texto fica no sink", () => {
    const { root, sink } = mount("a <!-- inline --> b\n\n<!-- bloco\n<b>x</b> -->\n\n`<!-- código -->`\n");
    const s = scanHidden(root, sink);
    expect(s.comments).toHaveLength(2);
    expect(sink.texts.map((x) => x.trim())).toEqual(["inline", "bloco\n<b>x</b>"]);
    // Comentário dentro de código é texto visível.
    expect(root.querySelector("code")?.textContent).toBe("<!-- código -->");
  });

  it("comentário dentro de SVG: marcador depois do SVG, mantido pelo sanitize", () => {
    const { root, sink } = mount("<svg><g><!-- em svg --></g></svg>\n");
    const s = scanHidden(root, sink);
    expect(s.comments).toHaveLength(1);
    expect(s.comments[0].previousElementSibling?.tagName.toLowerCase()).toBe("svg");
  });

  it("marcador escrito no documento não conta e perde o atributo", () => {
    const { root, sink } = mount('<span data-leve-comment="00:0">falso</span>\n');
    expect(scanHidden(root, sink).comments).toHaveLength(0);
    expect(root.querySelector("[data-leve-comment]")).toBeNull();
    expect(root.textContent).toContain("falso");
  });

  it("marcas do app escritas no documento saem no sanitize", () => {
    const src = '<span class="leve-mark x" style="display:none">a</span> <span class="leve-mark">b\u200Bc</span> <span hidden data-leve-hidden="x" data-leve-orig=\'{"style":"background:url(http://t/p)"}\'>d</span>\n';
    const { root, sink } = mount(src);
    expect(root.querySelector("[data-leve-hidden], [data-leve-orig], .leve-mark")).toBeNull();
    expect(root.querySelector("span")?.className).toBe("x");
    const s = scanHidden(root, sink, src);
    expect(s.elements.map((e) => e.reason)).toEqual(["display:none", "hidden"]);
    expect(s.invisible).toBe(1);
    revealHidden(root, s, sink, LABELS);
    const clone = root.cloneNode(true) as HTMLElement;
    stripHiddenMarks(clone);
    expect(clone.innerHTML).not.toContain("url(");
  });

  it("conta só o elemento escondido mais externo", () => {
    const { root, sink } = mount('<div hidden><span style="display:none">a</span></div>\n\n<span style="opacity:0">b</span>\n');
    const s = scanHidden(root, sink);
    expect(s.elements.map((e) => e.reason)).toEqual(["hidden", "opacity:0"]);
    expect(s.nested.map((e) => e.reason)).toEqual(["display:none"]);
    revealHidden(root, s, sink, LABELS);
    expect(root.querySelectorAll("[hidden], [style*=none]")).toHaveLength(0);
  });

  it("sem invisível na fonte, não varre o texto", () => {
    const { root, sink } = mount("texto\n");
    // A fonte manda: mesmo que o DOM tivesse, a pré-checagem diz que não há.
    root.append("​");
    expect(scanHidden(root, sink, "texto\n").invisible).toBe(0);
    expect(scanHidden(root, sink).invisible).toBe(1);
  });
});

describe("revealHidden e stripHiddenMarks", () => {
  const SRC = 'a <!-- <img src=x onerror=alert(1)> --> b\n\nx​y\n\n<span style="display:none;color:red">segredo</span>\n\n<p hidden class="hidden">p</p>\n\n<template><p>tpl</p></template>\n';

  it("mostra comentário como texto, chip no invisível, contorno no escondido", () => {
    const { root, sink } = mount(SRC);
    const before = root.innerHTML;
    const s = scanHidden(root, sink, SRC);
    expect(hiddenTotal(s)).toBe(5);
    revealHidden(root, s, sink, LABELS);
    const c = root.querySelector(".leve-hidden-comment")!;
    expect(c.textContent).toBe("Comentário<img src=x onerror=alert(1)>");
    expect(c.querySelector("img")).toBeNull();
    const chip = root.querySelector<HTMLElement>(".leve-hidden-chip")!;
    expect(chip.dataset.label).toBe("U+200B");
    expect(chip.textContent).toBe("");
    const span = [...root.querySelectorAll<HTMLElement>(".leve-hidden-el")].find((e) => e.textContent === "segredo")!;
    expect(span.style.display).toBe("");
    expect(span.style.color).toBe("red");
    expect(span.getAttribute("data-leve-hidden")).toBe("Oculto: display:none");
    const p = root.querySelector<HTMLElement>("p.leve-hidden-el")!;
    expect(p.hidden).toBe(false);
    expect(p.classList.contains("hidden")).toBe(false);
    expect(root.querySelector(".leve-hidden-text")?.textContent).toBe("Oculto: <template>tpl");

    // Clone para exportar/copiar: igual ao render original, menos os marcadores de comentário.
    const clone = root.cloneNode(true) as HTMLElement;
    stripHiddenMarks(clone);
    // Mesma árvore (a ordem dos atributos restaurados pode mudar).
    const plain = document.createElement("article");
    plain.id = "content";
    plain.innerHTML = before;
    plain.querySelectorAll("[data-leve-comment]").forEach((m) => m.remove());
    plain.normalize();
    expect(clone.isEqualNode(plain)).toBe(true);
  });

  it("revelar duas vezes não duplica", () => {
    const { root, sink } = mount(SRC);
    const s = scanHidden(root, sink, SRC);
    revealHidden(root, s, sink, LABELS);
    const html = root.innerHTML;
    revealHidden(root, { ...s, invisible: 0 }, sink, LABELS);
    expect(root.innerHTML).toBe(html);
  });

  it("chips por trecho, com a posição certa", () => {
    const d = document.createElement("p");
    d.textContent = "a​b‮c";
    expect(markInvisibles(d, "x")).toBe(2);
    expect(d.innerHTML).toBe('a​<span class="leve-mark leve-hidden-chip" data-label="U+200B" role="img" aria-label="x: U+200B" title="x"></span>b‮<span class="leve-mark leve-hidden-chip" data-label="U+202E" role="img" aria-label="x: U+202E" title="x"></span>c');
  });
});

describe("tests/fixtures/oculto.md", () => {
  const src = fixture;

  it("conta cada caso uma vez e nenhum legítimo", () => {
    const { root, sink } = mount(src);
    const s = scanHidden(root, sink, src);
    expect(s.comments).toHaveLength(2);
    expect(s.elements.map((e) => e.reason)).toEqual(["hidden", "display:none", "visibility:hidden", "font-size:0", "opacity:0"]);
    expect(s.invisible).toBe(5);
    expect(hiddenTotal(s)).toBe(12);
  });

  it("a seção de legítimos sozinha não dispara", () => {
    const legit = src.slice(src.indexOf("## Não dispara"));
    const { root, sink } = mount("﻿" + legit);
    expect(hiddenTotal(scanHidden(root, sink, legit))).toBe(0);
  });
});

describe("Exportar HTML e Copiar formatado com o oculto à mostra", () => {
  const SRC = 'a <!-- nota --> b\n\nx​y\n\n<span style="display:none">segredo</span>\n';

  function revealed(): HTMLElement {
    const { root, sink } = mount(SRC);
    revealHidden(root, scanHidden(root, sink, SRC), sink, LABELS);
    return root;
  }

  it("o arquivo sai como o documento, sem as marcas", () => {
    const { html } = buildExportHtml(cloneContent(revealed()), { fileName: "n.md", lang: "pt-BR", css: "", mdLinks: "text", images: {} });
    const body = html.slice(html.indexOf("<body>"));
    expect(body).not.toMatch(/leve-|data-leve|Comentário|nota/);
    expect(body).toContain('<span style="display:none">segredo</span>');
    expect(body).toContain("x​y");
  });

  it("o fragmento colado também", () => {
    const { html, text } = toRichHtml(cloneContent(revealed()));
    expect(html).not.toMatch(/leve-|data-leve|Comentário|nota/);
    expect(text).not.toContain("Comentário");
  });
});
