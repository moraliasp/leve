import { describe, expect, it } from "vitest";
import changelog from "../CHANGELOG.md?raw";
import { current } from "../scripts/version.mjs";
import { releaseNotes, versionOfTag } from "../scripts/release-notes.mjs";

const sample = `# Changelog

## [Unreleased]

## [1.1.0] - 2026-11-02

### Added

- Thing one.

### Fixed

- Thing two.

## [1.0.0] - 2026-10-01

- First.

[Unreleased]: https://example.com/compare/v1.1.0...HEAD
[1.1.0]: https://example.com/compare/v1.0.0...v1.1.0
`;

describe("notas da release", () => {
  it("tira a versão da tag, inclusive de rc", () => {
    expect(versionOfTag("v0.4.0")).toBe("0.4.0");
    expect(versionOfTag("v0.4.0-rc.1")).toBe("0.4.0");
  });

  it("pega só a seção da versão, sem o título, com o link de comparação", () => {
    expect(releaseNotes(sample, "1.1.0")).toBe(
      "### Added\n\n- Thing one.\n\n### Fixed\n\n- Thing two.\n\n" +
        "**Full changelog:** https://example.com/compare/v1.0.0...v1.1.0\n",
    );
  });

  it("a última seção para no rodapé de links e fica sem link se não houver referência", () => {
    expect(releaseNotes(sample, "1.0.0")).toBe("- First.\n");
  });

  it("devolve null sem seção ou com seção vazia", () => {
    expect(releaseNotes(sample, "2.0.0")).toBeNull();
    expect(releaseNotes(sample, "Unreleased")).toBeNull();
  });

  it("o ponto da versão não vira curinga", () => {
    expect(releaseNotes("## [1x1x0]\n\n- no\n", "1.1.0")).toBeNull();
  });

  it("o CHANGELOG tem seção para a versão do app (o rascunho da release usa ela)", () => {
    const app = current()["package.json"].replace(/-.*$/, "");
    expect(releaseNotes(changelog, app)).toMatch(/\*\*Full changelog:\*\* https:\/\/github\.com\/moraliasp\/leve\//);
  });
});
