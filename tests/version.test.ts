import { describe, expect, it } from "vitest";
import metainfo from "../packaging/flatpak/br.com.moralia.leve.metainfo.xml?raw";
import { current, SEMVER } from "../scripts/version.mjs";
import { addRelease, latestRelease } from "../scripts/metainfo.mjs";

/**
 * Tripwire: a versão vive em package.json, tauri.conf.json, Cargo.toml e Cargo.lock.
 * Mudar com `pnpm version:set <x.y.z>`, nunca à mão (docs/decisoes.md, "Versão e tag").
 * Lê pelo mesmo código do script, para teste e workflow não divergirem.
 */
describe("versão do app", () => {
  const versions = current();

  it("é semver nos quatro arquivos", () => {
    expect(Object.keys(versions)).toHaveLength(4);
    for (const v of Object.values(versions)) expect(v).toMatch(SEMVER);
  });

  it("é a mesma nos quatro arquivos", () => {
    expect(new Set(Object.values(versions)).size, JSON.stringify(versions)).toBe(1);
  });
});

describe("metainfo do Flatpak", () => {
  it("a release mais recente é a versão do app (pnpm version:set pede um <release> novo)", () => {
    const app = current()["package.json"].replace(/-.*$/, "");
    expect(latestRelease(metainfo)).toBe(app);
  });

  it("lê o primeiro <release>, com atributos em qualquer ordem e sem comentários", () => {
    expect(latestRelease('<releases><release date="2026-11-01" version="0.4.0"/><release version="0.3.0"/></releases>')).toBe("0.4.0");
    expect(latestRelease("<releases>\n  <release\n    version='1.0.0'\n    date=\"x\">")).toBe("1.0.0");
    expect(latestRelease('<!-- <release version="9.9.9"> --><release version="0.3.0">')).toBe("0.3.0");
    expect(latestRelease("<releases></releases>")).toBeNull();
    expect(latestRelease('<release date="x">')).toBeNull();
  });
});

describe("addRelease (pnpm version:set)", () => {
  const xml = "<component>\n  <releases>\n    <release version=\"0.3.0\" date=\"2026-10-27\"/>\n  </releases>\n</component>\n";

  it("põe a versão nova no topo, com data e link das notas, e ela vira a mais recente", () => {
    const out = addRelease(xml, "0.4.0", "2026-11-02");
    expect(latestRelease(out)).toBe("0.4.0");
    expect(out).toContain(
      '  <releases>\n    <release version="0.4.0" date="2026-11-02">\n' +
        '      <url type="details">https://github.com/moraliasp/leve/releases/tag/v0.4.0</url>\n' +
        '    </release>\n    <release version="0.3.0"',
    );
  });

  it("não duplica quando a versão já é a mais recente", () => {
    const once = addRelease(xml, "0.4.0", "2026-11-02");
    expect(addRelease(once, "0.4.0", "2026-11-03")).toBe(once);
  });

  it("mantém CRLF e recusa metainfo sem <releases>", () => {
    const crlf = addRelease(xml.replace(/\n/g, "\r\n"), "0.4.0", "2026-11-02");
    expect(crlf.split("\n").every((l, i, a) => i === a.length - 1 || l.endsWith("\r"))).toBe(true);
    expect(() => addRelease("<component/>", "0.4.0", "2026-11-02")).toThrow("<releases>");
  });
});
