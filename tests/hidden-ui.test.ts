import { describe, expect, it } from "vitest";
import { applyHiddenPolicy } from "../src/hidden-ui";
import { newCommentSink } from "../src/hidden";
import { render } from "../src/render";

const setup = (md: string, reveal: boolean, onReveal?: () => void): { content: HTMLElement; banner: HTMLElement; n: number } => {
  const comments = newCommentSink();
  const content = document.createElement("div");
  content.innerHTML = render(md, { comments });
  const banner = document.createElement("div");
  banner.hidden = true;
  const n = applyHiddenPolicy(content, banner, { reveal, comments, source: md, onReveal });
  return { content, banner, n };
};

describe("aviso de conteúdo oculto", () => {
  it("sem nada oculto o aviso fica escondido e vazio", () => {
    const { banner, n } = setup("texto", false);
    expect(n).toBe(0);
    expect(banner.hidden).toBe(true);
    expect(banner.childElementCount).toBe(0);
  });

  it("conta o que achou e oferece Mostrar", () => {
    const { banner, n } = setup("a\n\n<!-- segredo -->\n\nb", false);
    expect(n).toBe(1);
    expect(banner.hidden).toBe(false);
    expect(banner.querySelector("span")!.textContent).not.toBe("");
    expect(banner.querySelector("button")!.className).toBe("text");
  });

  it("Mostrar revela, troca o texto, tira o botão e avisa uma vez", () => {
    let revealed = 0;
    const { content, banner } = setup("a\n\n<!-- segredo -->\n\nb", false, () => revealed++);
    const before = banner.textContent;
    banner.querySelector("button")!.click();
    expect(revealed).toBe(1);
    expect(banner.querySelector("button")).toBeNull();
    expect(banner.textContent).not.toBe(before);
    expect(banner.hidden).toBe(false);
    expect(content.textContent).toContain("segredo");
  });

  it("com `reveal` já mostra, sem botão", () => {
    const { content, banner } = setup("a\n\n<!-- segredo -->\n\nb", true);
    expect(banner.hidden).toBe(false);
    expect(banner.querySelector("button")).toBeNull();
    expect(content.textContent).toContain("segredo");
  });
});
