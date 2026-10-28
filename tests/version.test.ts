import { describe, expect, it } from "vitest";
import metainfo from "../packaging/flatpak/br.com.moralia.leve.metainfo.xml?raw";
import { current, set, SEMVER } from "../scripts/version.mjs";
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

describe("set (pnpm version:set) numa cópia da raiz", () => {
  type Fs = {
    mkdtempSync(p: string): string;
    mkdirSync(p: string, o: { recursive: boolean }): void;
    copyFileSync(a: string, b: string): void;
    readFileSync(p: string, enc: string): string;
    writeFileSync(p: string, d: string): void;
  };
  const files = ["package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"];
  const meta = "packaging/flatpak/br.com.moralia.leve.metainfo.xml";

  async function copia(comMetainfo: boolean) {
    const fs = (await import("node:fs" as string)) as Fs;
    const os = (await import("node:os" as string)) as { tmpdir(): string };
    const root = fs.mkdtempSync(`${os.tmpdir()}/leve-version-`);
    fs.mkdirSync(`${root}/src-tauri`, { recursive: true });
    fs.mkdirSync(`${root}/packaging/flatpak`, { recursive: true });
    for (const f of comMetainfo ? [...files, meta] : files) fs.copyFileSync(f, `${root}/${f}`);
    return { fs, root, read: () => fs.readFileSync(`${root}/${meta}`, "utf8") };
  }

  it("estável: grava a versão e o <release>, uma vez só", async () => {
    const { root, read } = await copia(true);
    set(root, "9.8.7", "2026-11-02");
    set(root, "9.8.7", "2026-11-03");
    expect(new Set(Object.values(current(root)))).toEqual(new Set(["9.8.7"]));
    expect(latestRelease(read())).toBe("9.8.7");
    expect(read().match(/version="9\.8\.7"/g)).toHaveLength(1);
  });

  it("pre-release: o metainfo recebe a base X.Y.Z, a que o teste e o build comparam", async () => {
    const { root, read } = await copia(true);
    set(root, "9.8.7-rc.1", "2026-11-02");
    expect(current(root)["package.json"]).toBe("9.8.7-rc.1");
    expect(latestRelease(read())).toBe("9.8.7");
  });

  it("sem metainfo, grava só a versão", async () => {
    const { root } = await copia(false);
    set(root, "9.8.7", "2026-11-02");
    expect(current(root)["package.json"]).toBe("9.8.7");
  });

  it("metainfo malformado: falha antes de mexer em qualquer arquivo", async () => {
    const { fs, root } = await copia(true);
    fs.writeFileSync(`${root}/${meta}`, "<component><releases/></component>");
    const antes = current(root);
    expect(() => set(root, "9.8.7", "2026-11-02")).toThrow("<releases>");
    expect(current(root)).toEqual(antes);
  });
});
