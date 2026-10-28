import { describe, expect, it } from "vitest";
import { render } from "../src/render";
import { decorateCodeBlocks } from "../src/code";
import { buildExportHtml, cloneContent } from "../src/export";
import { blockKeys, diffBlocks, hashKey, hunkTarget, markChanges, stepChange, track } from "../src/changes";

const chars = (s: string) => s.split("");

function keysOf(md: string): number[] {
  const el = document.createElement("div");
  el.innerHTML = render(md);
  return blockKeys(el);
}

describe("diffBlocks", () => {
  it("sem mudança, nada", () => {
    expect(diffBlocks([1, 2, 3], [1, 2, 3])).toEqual([]);
    expect(diffBlocks([], [])).toEqual([]);
  });

  it("bloco alterado, inserido e removido", () => {
    expect(diffBlocks(chars("abcd"), chars("abXd"))).toEqual([{ start: 2, end: 3, removed: 1 }]);
    expect(diffBlocks(chars("abcd"), chars("abXcd"))).toEqual([{ start: 2, end: 3, removed: 0 }]);
    expect(diffBlocks(chars("abcd"), chars("abd"))).toEqual([{ start: 2, end: 2, removed: 1 }]);
    expect(diffBlocks(chars("abcd"), chars("abc"))).toEqual([{ start: 3, end: 3, removed: 1 }]);
    expect(diffBlocks([], chars("ab"))).toEqual([{ start: 0, end: 2, removed: 0 }]);
    expect(diffBlocks(chars("ab"), [])).toEqual([{ start: 0, end: 0, removed: 2 }]);
  });

  it("mudanças longe uma da outra viram trechos separados", () => {
    expect(diffBlocks(chars("abcdefgh"), chars("aXcdefYh"))).toEqual([
      { start: 1, end: 2, removed: 1 },
      { start: 6, end: 7, removed: 1 },
    ]);
    // Blocos contíguos mudados são um trecho só.
    expect(diffBlocks(chars("abcdef"), chars("aXYdef"))).toEqual([{ start: 1, end: 3, removed: 2 }]);
  });

  it("bloco movido: sai de um lugar e entra no outro", () => {
    const hunks = diffBlocks(chars("abcde"), chars("bcdea"));
    expect(hunks).toEqual([
      { start: 0, end: 0, removed: 1 },
      { start: 4, end: 5, removed: 0 },
    ]);
  });

  it("é uma edição mínima e válida em sequências aleatórias", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let n = 0; n < 300; n++) {
      const a = Array.from({ length: Math.floor(rnd() * 30) }, () => Math.floor(rnd() * 5));
      const b = Array.from({ length: Math.floor(rnd() * 30) }, () => Math.floor(rnd() * 5));
      const hunks = diffBlocks(a, b);
      // Reconstrução: o que sobra de `a` mais o que entra de `b` dá `b`.
      const rebuilt: number[] = [];
      let i = 0;
      let j = 0;
      for (const h of hunks) {
        while (j < h.start) {
          expect(a[i]).toBe(b[j]);
          rebuilt.push(a[i++]);
          j++;
        }
        i += h.removed;
        for (; j < h.end; j++) rebuilt.push(b[j]);
      }
      while (j < b.length) {
        expect(a[i]).toBe(b[j]);
        rebuilt.push(a[i++]);
        j++;
      }
      expect(i).toBe(a.length);
      expect(rebuilt).toEqual(b);
      // Mínima: o total de edições é n + m - 2·LCS.
      const edits = hunks.reduce((s, h) => s + h.removed + h.end - h.start, 0);
      expect(edits).toBe(a.length + b.length - 2 * lcs(a, b));
    }
  });

  it("acima do limite de edições, o meio vira um trecho só", () => {
    const a = Array.from({ length: 50 }, (_, i) => i);
    const b = [0, ...Array.from({ length: 48 }, (_, i) => 1000 + i), 49];
    expect(diffBlocks(a, b, 10)).toEqual([{ start: 1, end: 49, removed: 48 }]);
    expect(diffBlocks(a, b).length).toBe(1);
  });

  it("documento grande com duas edições distantes é rápido e exato", () => {
    const a = Array.from({ length: 50_000 }, (_, i) => i);
    const b = a.slice();
    b[10] = -1;
    b.splice(40_000, 0, -2);
    const t0 = performance.now();
    expect(diffBlocks(a, b)).toEqual([
      { start: 10, end: 11, removed: 1 },
      { start: 40_000, end: 40_001, removed: 0 },
    ]);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

function lcs(a: number[], b: number[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[a.length][b.length];
}

describe("chaves dos blocos (HTML de render)", () => {
  const base = "# Plano\n\nParágrafo um.\n\n- item a\n- item b\n\n```ts\nconst x = 1;\n```\n\nFim.\n";

  it("só o bloco tocado muda", () => {
    const next = base.replace("item b", "item B");
    expect(diffBlocks(keysOf(base), keysOf(next))).toEqual([{ start: 2, end: 3, removed: 1 }]);
  });

  it("espaço que não muda o desenho não conta", () => {
    expect(diffBlocks(keysOf(base), keysOf(base.replace("Parágrafo um.", "Parágrafo   um.\n")))).toEqual([]);
    expect(diffBlocks(keysOf(base), keysOf(base.replace("\n\nFim.", "\n\n\n\nFim.")))).toEqual([]);
    // Reflow: a quebra suave desenha como espaço.
    expect(diffBlocks(keysOf("um dois\ntrês\n"), keysOf("um\ndois três\n"))).toEqual([]);
    // Dentro de código o espaço conta.
    expect(diffBlocks(keysOf("```\na  b\n```\n"), keysOf("```\na b\n```\n")).length).toBe(1);
  });

  it("hash estável e diferente para conteúdos diferentes", () => {
    expect(hashKey("<p>a</p>")).toBe(hashKey("<p>a</p>"));
    expect(hashKey("<p>a</p>")).not.toBe(hashKey("<p>b</p>"));
  });
});

describe("track: versão anterior por aba", () => {
  it("primeira leitura e outro arquivo não marcam", () => {
    const s = track(undefined, "/a.md", [1, 2]);
    expect(s.hunks).toEqual([]);
    expect(track({ path: "/a.md", keys: [1, 2], hunks: [{ start: 0, end: 1, removed: 1 }] }, "/b.md", [9]).hunks).toEqual([]);
  });

  it("mesmo arquivo compara; sem diferença, as marcas ficam", () => {
    const s1 = track(track(undefined, "/a.md", [1, 2, 3]), "/a.md", [1, 9, 3]);
    expect(s1.hunks).toEqual([{ start: 1, end: 2, removed: 1 }]);
    const s2 = track(s1, "/a.md", [1, 9, 3]);
    expect(s2.hunks).toBe(s1.hunks);
    // Mudança nova substitui as marcas: a comparação é com a versão anterior, não a primeira.
    expect(track(s2, "/a.md", [1, 9, 3, 4]).hunks).toEqual([{ start: 3, end: 4, removed: 0 }]);
  });
});

describe("navegação", () => {
  it("hunkTarget: primeiro bloco novo, ou o vizinho de uma remoção", () => {
    expect(hunkTarget({ start: 2, end: 4, removed: 0 }, 5)).toBe(2);
    expect(hunkTarget({ start: 2, end: 2, removed: 1 }, 5)).toBe(2);
    expect(hunkTarget({ start: 5, end: 5, removed: 1 }, 5)).toBe(4);
    expect(hunkTarget({ start: 0, end: 0, removed: 3 }, 0)).toBeNull();
  });

  it("stepChange: a partir do topo visível, dando a volta", () => {
    const tops = [100, 500, 900];
    expect(stepChange(tops, 0, 1)).toBe(0);
    expect(stepChange(tops, 100, 1)).toBe(1);
    expect(stepChange(tops, 950, 1)).toBe(0);
    expect(stepChange(tops, 500, -1)).toBe(0);
    expect(stepChange(tops, 50, -1)).toBe(2);
    expect(stepChange(tops, 1000, -1)).toBe(2);
    expect(stepChange([], 0, 1)).toBe(-1);
  });
});

describe("marcas no DOM", () => {
  function content(md: string): HTMLElement {
    const el = document.createElement("div");
    el.innerHTML = render(md);
    decorateCodeBlocks(el);
    return el;
  }

  it("marca exatamente os blocos tocados e a fronteira da remoção", () => {
    const el = content("A\n\nB\n\nC\n\nD\n");
    const targets = markChanges(el, [
      { start: 1, end: 2, removed: 1 },
      { start: 3, end: 3, removed: 1 },
    ]);
    expect(Array.from(el.children, (c) => c.getAttribute("data-change"))).toEqual([null, "changed", null, "removed-before"]);
    expect(targets.map((t) => t.textContent)).toEqual(["B", "D"]);
    markChanges(el, [{ start: 4, end: 4, removed: 2 }]);
    expect(Array.from(el.children, (c) => c.getAttribute("data-change"))).toEqual([null, null, null, "removed-after"]);
    markChanges(el, []);
    expect(el.querySelector("[data-change]")).toBeNull();
  });

  it("o índice vale depois do .code-wrap (pós-processo não muda os filhos de topo)", () => {
    const md = "A\n\n```ts\nx\n```\n\nC\n";
    const raw = document.createElement("div");
    raw.innerHTML = render(md);
    const el = content(md);
    expect(el.children.length).toBe(raw.children.length);
    markChanges(el, [{ start: 1, end: 2, removed: 1 }]);
    expect(el.children[1].classList.contains("code-wrap")).toBe(true);
    expect(el.children[1].getAttribute("data-change")).toBe("changed");
  });

  it("Exportar HTML e Copiar não levam as marcas", () => {
    const el = content("A\n\nB\n");
    markChanges(el, [{ start: 0, end: 2, removed: 0 }]);
    const { html } = buildExportHtml(cloneContent(el), { fileName: "n.md", lang: "pt-BR", css: "", mdLinks: "text", images: {} });
    expect(html).not.toContain("data-change");
  });
});
