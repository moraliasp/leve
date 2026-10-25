import { beforeEach, describe, expect, it } from "vitest";
import { RECENT_KEY, RECENT_MAX, SCROLL_KEY, addRecent, clearRecent, readRecent, removeRecent, splitPath } from "../src/recent";

describe("recentes", () => {
  beforeEach(() => localStorage.clear());

  it("adiciona no topo, sem repetir, até o limite", () => {
    addRecent("/a.md");
    addRecent("/b.md");
    addRecent("/a.md");
    expect(readRecent()).toEqual(["/a.md", "/b.md"]);
    for (let i = 0; i < RECENT_MAX + 5; i++) addRecent(`/n${i}.md`);
    expect(readRecent()).toHaveLength(RECENT_MAX);
    expect(readRecent()[0]).toBe(`/n${RECENT_MAX + 4}.md`);
  });

  it("lista corrompida ou com lixo vira lista limpa", () => {
    localStorage.setItem(RECENT_KEY, "{nope");
    expect(readRecent()).toEqual([]);
    localStorage.setItem(RECENT_KEY, JSON.stringify(["/ok.md", 3, null]));
    expect(readRecent()).toEqual(["/ok.md"]);
  });

  it("remover um item tira também o ponto de leitura dele e preserva os outros", () => {
    addRecent("/a.md");
    addRecent("/b.md");
    localStorage.setItem(SCROLL_KEY, JSON.stringify({ "/a.md": { top: 10 }, "/b.md": { top: 20 } }));
    removeRecent("/a.md");
    expect(readRecent()).toEqual(["/b.md"]);
    expect(JSON.parse(localStorage.getItem(SCROLL_KEY)!)).toEqual({ "/b.md": { top: 20 } });
  });

  it("limpar apaga a lista e todos os pontos de leitura", () => {
    addRecent("/a.md");
    localStorage.setItem(SCROLL_KEY, JSON.stringify({ "/a.md": { top: 10 } }));
    localStorage.setItem("mdview.tabs", "x");
    clearRecent();
    expect(localStorage.getItem(RECENT_KEY)).toBeNull();
    expect(localStorage.getItem(SCROLL_KEY)).toBeNull();
    expect(localStorage.getItem("mdview.tabs")).toBe("x");
    expect(readRecent()).toEqual([]);
  });

  it("separa nome e pasta nos dois separadores", () => {
    expect(splitPath("/a/b/c.md")).toEqual({ name: "c.md", dir: "/a/b/" });
    expect(splitPath("C:\\x\\y.md")).toEqual({ name: "y.md", dir: "C:\\x\\" });
    expect(splitPath("solto.md")).toEqual({ name: "solto.md", dir: "" });
  });
});
