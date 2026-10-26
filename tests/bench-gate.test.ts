import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(() => Promise.resolve());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const { reportPainted } = await import("../src/bench");

afterEach(() => {
  invoke.mockClear();
  delete window.__LEVE_BENCH__;
  document.body.replaceChildren();
});

describe("gate do gancho de benchmark", () => {
  it("sem a marca, nenhum invoke", () => {
    reportPainted("/a.md");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("elemento com id __LEVE_BENCH__ (DOM clobbering) não arma", () => {
    const a = document.createElement("a");
    a.id = "__LEVE_BENCH__";
    document.body.append(a);
    // O jsdom não expõe elementos com id em `window`; o WebKit expõe. Simula o que o WebKit faz.
    (window as unknown as Record<string, unknown>).__LEVE_BENCH__ = a;
    reportPainted("/a.md");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("com true, manda o marco de layout na hora", () => {
    window.__LEVE_BENCH__ = true;
    reportPainted("/a.md");
    expect(invoke).toHaveBeenCalledWith("bench_report", expect.objectContaining({ doc: "/a.md", phase: "layout" }));
  });
});
