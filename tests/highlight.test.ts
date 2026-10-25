import { describe, expect, it } from "vitest";
import hljs from "highlight.js/lib/common";
import { codeLanguage, highlightBlock } from "../src/highlight";
import { render } from "../src/render";

const codeFrom = (md: string): HTMLElement => {
  const d = document.createElement("div");
  d.innerHTML = render(md);
  return d.querySelector("pre.hljs > code")!;
};

describe("realce de código sob demanda", () => {
  it("realça linguagem conhecida sem mudar o texto", () => {
    const code = codeFrom("```ts\nconst a = 1;\n```");
    highlightBlock(hljs, code);
    expect(code.querySelector(".hljs-keyword")?.textContent).toBe("const");
    expect(code.textContent).toBe("const a = 1;\n");
  });

  it("linguagem desconhecida fica como texto escapado", () => {
    const code = codeFrom("```xyzlang\n<b>oi</b>\n```");
    highlightBlock(hljs, code);
    expect(code.querySelector("b")).toBeNull();
    expect(code.textContent).toBe("<b>oi</b>\n");
  });

  it("não realça duas vezes", () => {
    const code = codeFrom("```js\nlet x\n```");
    highlightBlock(hljs, code);
    const once = code.innerHTML;
    highlightBlock(hljs, code);
    expect(code.innerHTML).toBe(once);
  });

  it("codeLanguage ignora text", () => {
    expect(codeLanguage(codeFrom("```\nx\n```"))).toBe("");
    expect(codeLanguage(codeFrom("```py\nx\n```"))).toBe("py");
  });

});

describe("fila de realce", () => {
  it("byDistance começa pelo bloco mais perto da rolagem", async () => {
    const { byDistance } = await import("../src/highlight");
    const mk = (top: number): HTMLElement => {
      const el = document.createElement("code");
      Object.defineProperty(el, "offsetTop", { value: top });
      return el;
    };
    const [a, b, c] = [mk(0), mk(5000), mk(9000)];
    expect(byDistance([a, b, c], 8000)).toEqual([c, b, a]);
  });

  it("realça todos os blocos sem depender de a página estar visível", async () => {
    const { highlightLazily } = await import("../src/highlight");
    const d = document.createElement("div");
    d.innerHTML = render("```ts\nconst a = 1;\n```\n\n```js\nlet b\n```\n\n```\nsem linguagem\n```");
    document.body.append(d);
    let calls = 0;
    await highlightLazily(d, document.body, () => calls++);
    expect(d.querySelectorAll("code[data-hl]").length).toBe(2);
    expect(d.querySelectorAll(".hljs-keyword").length).toBe(2);
    expect(calls).toBeGreaterThan(0);
    d.remove();
  });
});
