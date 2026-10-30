import { describe, expect, it } from "vitest";
import { fuzzyFilter, fuzzyMatch } from "../src/fuzzy";

const FILES = ["README.md", "docs/decisoes.md", "docs/exemplo.md", "docs/publicar-pacotes.md", "guia/decisao-antiga.md", "src/sample/pt-BR.md"];

describe("fuzzyMatch", () => {
  it("letras em ordem, sem caixa nem acento", () => {
    expect(fuzzyMatch("DCS", "docs/decisoes.md")).not.toBeNull();
    expect(fuzzyMatch("decisões", "docs/decisoes.md")).not.toBeNull();
    expect(fuzzyMatch("sed", "docs/decisoes.md")).not.toBeNull();
    expect(fuzzyMatch("xyz", "docs/decisoes.md")).toBeNull();
    expect(fuzzyMatch("dm.", "docs/decisoes.md")).toBeNull();
  });

  it("consulta vazia casa tudo com zero", () => {
    expect(fuzzyMatch("  ", "a.md")).toEqual({ item: "a.md", score: 0, hits: [] });
  });

  it("marca as letras casadas, preferindo o nome do arquivo", () => {
    expect(fuzzyMatch("dec", "docs/decisoes.md")?.hits).toEqual([5, 6, 7]);
    expect(fuzzyMatch("pp", "docs/publicar-pacotes.md")?.hits).toEqual([5, 14]);
  });
});

describe("fuzzyFilter", () => {
  it("começo do nome vence letra solta e pasta", () => {
    expect(fuzzyFilter("dec", FILES).map((m) => m.item)).toEqual(["docs/decisoes.md", "guia/decisao-antiga.md"]);
    expect(fuzzyFilter("ex", FILES)[0].item).toBe("docs/exemplo.md");
    expect(fuzzyFilter("pp", FILES)[0].item).toBe("docs/publicar-pacotes.md");
  });

  it("caminho curto desempata e o limite corta", () => {
    expect(fuzzyFilter("md", ["a/b/c/x.md", "x.md"])[0].item).toBe("x.md");
    expect(fuzzyFilter("", FILES, 2)).toHaveLength(2);
  });
});
