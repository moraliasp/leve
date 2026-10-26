import { describe, expect, it } from "vitest";
import notices from "../THIRD_PARTY_NOTICES.md?raw";
import thirdParty from "../THIRD_PARTY.md?raw";

// Tripwire: todo pacote da seção "Licenças com obrigação de aviso (EPL/MPL/CDLA)" de THIRD_PARTY.md
// (gerada por scripts/third-party.mjs) precisa de um título com o nome dele em THIRD_PARTY_NOTICES.md.

const secao = (md: string) => {
  const m = md.match(/^## Licenças com obrigação de aviso \(EPL\/MPL\/CDLA\)\n([\s\S]*?)(?=^## )/m);
  return m ? m[1] : "";
};

// Linha da tabela: | [nome](url) | versão | origem | licença | situação |
const pacotes = (md: string) =>
  [...secao(md).matchAll(/^\| (?:\[([^\]]+)\]\([^)]*\)|([^|\s]+)) \| ([^|]+) \| (npm|crate) \|/gm)].map((m) => ({
    name: (m[1] ?? m[2]).trim(),
    version: m[3].trim(),
  }));

const titulos = (md: string) => [...md.matchAll(/^#{1,6} (.+)$/gm)].map((m) => m[1].toLowerCase());

describe("avisos de terceiros", () => {
  const listados = pacotes(thirdParty);
  const heads = titulos(notices);

  it("a seção EPL/MPL de THIRD_PARTY.md lista DOMPurify e os crates MPL", () => {
    const nomes = listados.map((p) => p.name);
    expect(nomes).toEqual(expect.arrayContaining(["dompurify", "cssparser", "selectors"]));
  });

  // elkjs (EPL-2.0) é cortado do bundle pelo plugin `mermaidSemElk` (vite.config.ts): não é distribuído.
  it("elkjs fica fora dos avisos e do NOTICES", () => {
    expect(listados.map((p) => p.name)).not.toContain("elkjs");
    expect(heads.some((h) => h.includes("elkjs"))).toBe(false);
  });

  it.each(listados.map((p) => [p.name, p.version]))("THIRD_PARTY_NOTICES.md tem título para %s %s", (name, version) => {
    const achou = heads.some((h) => h.includes(name.toLowerCase()) && h.includes(version));
    expect(achou, `falta um título com "${name} ${version}" em THIRD_PARTY_NOTICES.md`).toBe(true);
  });

  // Blocos ``` do NOTICES: cada licença inteira dentro de um bloco só, títulos fora de bloco.
  const blocos = (md: string) => {
    const out: string[] = [];
    let aberto: string[] | null = null;
    for (const linha of md.split("\n")) {
      if (/^```/.test(linha)) {
        if (aberto) {
          out.push(aberto.join("\n"));
          aberto = null;
        } else aberto = [];
      } else if (aberto) aberto.push(linha);
      else if (/^#{1,6} /.test(linha)) out.push(`#${linha}`);
    }
    if (aberto) out.push("<<aberto>>");
    return out;
  };

  it("os blocos de código fecham e nenhum título fica dentro de bloco", () => {
    const b = blocos(notices);
    expect(b).not.toContain("<<aberto>>");
    for (const h of ["## DOMPurify", "## Crates Rust"]) {
      expect(b.some((x) => x.startsWith(`#${h}`)), `título "${h}" fora de bloco`).toBe(true);
    }
    expect(b.filter((x) => x.includes("Pseudocódigo"))).toEqual([]);
  });

  it.each([
    ["Apache-2.0", /Apache License\s+Version 2\.0/, /END OF TERMS AND CONDITIONS/, 9_000],
    ["MPL-2.0", /Mozilla Public License Version 2\.0/, /Exhibit B - "Incompatible With Secondary Licenses" Notice/, 15_000],
  ])("o texto da %s está inteiro num bloco só", (_nome, inicio, fim, minimo) => {
    const bloco = blocos(notices).find((x) => !x.startsWith("#") && inicio.test(x));
    expect(bloco, "bloco da licença").toBeTruthy();
    expect(bloco!).toMatch(fim);
    expect(bloco!.length).toBeGreaterThan(minimo);
  });

  it("o parser enxerga a seção: texto sem a seção não lista nada", () => {
    expect(pacotes("# Terceiros\n\n## npm\n\n| a | b | npm |\n")).toEqual([]);
  });
});
