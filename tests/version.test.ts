import { describe, expect, it } from "vitest";
import { current, SEMVER } from "../scripts/version.mjs";

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
