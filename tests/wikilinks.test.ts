import { describe, expect, it } from "vitest";
import { parseWikilink } from "../src/wikilinks";

describe("parseWikilink", () => {
  it("alvo simples", () => {
    expect(parseWikilink("nota")).toEqual({ target: "nota", hash: "", label: "nota", file: "nota.md" });
  });
  it("alias após |", () => {
    expect(parseWikilink("nota|Rótulo")?.label).toBe("Rótulo");
  });
  it("título após # com rótulo composto", () => {
    expect(parseWikilink("nota#Seção")).toEqual({ target: "nota", hash: "Seção", label: "nota › Seção", file: "nota.md" });
  });
  it("só título = mesmo documento", () => {
    expect(parseWikilink("#Seção")).toEqual({ target: "", hash: "Seção", label: "Seção", file: "" });
  });
  it("mantém extensão markdown explícita e subpasta", () => {
    expect(parseWikilink("pasta/nota.md")?.file).toBe("pasta/nota.md");
    expect(parseWikilink("pasta/nota")?.file).toBe("pasta/nota.md");
  });
  it("apara espaços e rejeita vazio", () => {
    expect(parseWikilink("  nota  |  R ")).toEqual({ target: "nota", hash: "", label: "R", file: "nota.md" });
    expect(parseWikilink("")).toBeNull();
    expect(parseWikilink("   ")).toBeNull();
  });
});
