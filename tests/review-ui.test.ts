import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab } from "../src/tabs";

// jsdom não tem `CSS` nem o retângulo de um Range; o módulo lê `CSS.highlights` ao carregar.
vi.stubGlobal("CSS", {});
Range.prototype.getBoundingClientRect = () => new DOMRect();
const { mountReview } = await import("../src/review-ui");

const tabOf = (path: string): Tab => ({ path }) as Tab;

function setup() {
  document.body.innerHTML = '<div id="app"><main id="main"><article id="content"><p>um trecho do documento</p></article></main></div>';
  const content = document.getElementById("content")!;
  const state = {
    tab: tabOf("/a.md") as Tab | null,
    path: "/a.md" as string | null,
  };
  const copyText = vi.fn(() => Promise.resolve());
  const review = mountReview({
    content,
    scroller: document.getElementById("main")!,
    tab: () => state.tab,
    doc: () => (state.path ? { path: state.path, name: "a.md", inMemory: false } : null),
    flash: vi.fn(),
    copyText,
  });

  const startNote = (): void => {
    const text = content.querySelector("p")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 3);
    range.setEnd(text, 9);
    const sel = getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    review.annotate();
  };
  const annotate = (comment: string): void => {
    startNote();
    document.querySelector<HTMLTextAreaElement>(".review-compose textarea")!.value = comment;
    document.querySelector<HTMLFormElement>(".review-compose")!.requestSubmit();
  };
  const panel = document.querySelector<HTMLElement>(".review-panel")!;
  return { state, review, startNote, annotate, panel, copyText };
}

describe("mountReview", () => {
  beforeEach(() => {
    getSelection()?.removeAllRanges();
  });

  it("anotar guarda por aba e mostra o painel", () => {
    const { state, review, annotate, panel } = setup();
    annotate("mudar");
    expect(review.has(state.tab!)).toBe(true);
    expect(review.has(tabOf("/a.md"))).toBe(false);
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("trecho");
  });

  it("sem documento na tela, o painel e o que estava sendo escrito somem", () => {
    const { state, review, startNote, annotate, panel } = setup();
    annotate("mudar");
    startNote();
    const compose = document.querySelector<HTMLElement>(".review-compose")!;
    expect(compose.hidden).toBe(false);

    state.tab = null;
    state.path = null;
    review.sync();
    expect(panel.hidden).toBe(true);
    expect(compose.hidden).toBe(true);
  });

  it("o colado salvo leva as anotações para o caminho novo", () => {
    const { state, review, annotate, copyText } = setup();
    annotate("mudar");
    const tab = state.tab!;
    const to = tabOf("/b.md");
    review.move({ tab, path: "/a.md" }, { tab: to, path: "/b.md" });
    expect(review.has(tab)).toBe(false);
    expect(review.has(to)).toBe(true);

    state.tab = to;
    state.path = "/b.md";
    review.sync();
    review.copy();
    expect(copyText).toHaveBeenCalledOnce();
    expect(copyText.mock.calls[0]).toEqual([expect.stringContaining("/b.md")]);
  });
});
