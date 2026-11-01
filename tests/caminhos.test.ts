import { describe, expect, it } from "vitest";

const fontes = import.meta.glob<string>("../src-tauri/src/*.rs", { query: "?raw", import: "default", eager: true });

/** Fonte sem o módulo de testes, onde o `canonicalize` cru é de propósito. */
const producao = (src: string) => src.split(/#\[cfg\(test\)\]\r?\nmod tests/)[0];

describe("forma canônica dos caminhos", () => {
  it("`canonicalize` só em `canonical` e `os_path`: os dois lados de toda comparação na mesma forma", () => {
    const usos = Object.entries(fontes).flatMap(([arq, src]) => (producao(src).match(/(?:::|\.)canonicalize\b/g) ?? []).map(() => arq.split("/").pop()));
    expect(usos).toEqual(["grants.rs", "grants.rs"]);
    expect(fontes["../src-tauri/src/grants.rs"]).toMatch(/pub fn canonical\(path: &str\)[^{]*\{\s*canonical_by\(path,/);
  });

  it("`os_path` só no vigia", () => {
    const usos = Object.entries(fontes).filter(([, src]) => /\bos_path\(/.test(producao(src)));
    expect(usos.map(([arq]) => arq.split("/").pop()).sort()).toEqual(["grants.rs", "watch.rs"]);
  });

  it("`grants.json` da 0.6.0 passa por `saved_paths` ao ler", () => {
    expect(fontes["../src-tauri/src/grants.rs"]).toMatch(/fn load_grant_lists[\s\S]{0,240}let all = saved_paths\(&json\);/);
  });
});
