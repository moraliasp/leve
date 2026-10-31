import { beforeAll, describe, expect, it } from "vitest";
import {
  barras,
  caminhoGrafico,
  classificar,
  comprimentoMaximo,
  FIM,
  gerar,
  grafico,
  INICIO,
  instaladores,
  mb,
  secao,
  tabela,
  textoAlternativo,
  trocarSecao,
  type Dados,
} from "../scripts/comparativo.mjs";

// Sem @types/node no projeto: módulos do Node por import dinâmico, tipados só no que o teste usa.
let lerArquivo: (caminho: string) => string;
beforeAll(async () => {
  const fs = (await import("node:fs" as string)) as { readFileSync(p: string, e: "utf8"): string };
  const raiz = decodeURI(new URL(import.meta.url).pathname).replace(/tests\/[^/]*$/, "");
  lerArquivo = (caminho) => fs.readFileSync(raiz + caminho, "utf8");
});

const dados: Dados = {
  consultado: "2026-10-31",
  apps: [
    { nome: "Grande", repo: "x/grande", versao: "v2", publicado: "2026-10-02", assets: [{ nome: "grande.dmg", bytes: 200_000_000 }, { nome: "grande-x64-setup.exe", bytes: 100_000_000 }] },
    { nome: "Leve", repo: "moraliasp/leve", versao: "v1", publicado: "2026-10-01", assets: [{ nome: "Leve_universal.dmg", bytes: 6_533_038 }] },
    { nome: "Só Linux", repo: "x/linux", versao: "v3", publicado: "2026-10-03", assets: [{ nome: "linux_amd64.deb", bytes: 9_000_000 }, { nome: "linux_amd64.AppImage", bytes: 90_000_000 }] },
  ],
};

describe("classificar", () => {
  it("reconhece instaladores por plataforma, formato e arquitetura", () => {
    expect(classificar("Leve_0.5.0_universal.dmg")).toEqual({ plataforma: "macos", formato: ".dmg", arq: "universal" });
    expect(classificar("MDHero_0.2.10_aarch64.dmg")).toEqual({ plataforma: "macos", formato: ".dmg", arq: "silicon" });
    expect(classificar("marktext-mac-x64-0.23.0.dmg")).toEqual({ plataforma: "macos", formato: ".dmg", arq: "intel" });
    expect(classificar("Leve_0.5.0_x64-setup.exe")).toEqual({ plataforma: "windows", formato: "setup.exe", arq: "x64" });
    expect(classificar("Moji.Setup.1.0.7.exe")).toEqual({ plataforma: "windows", formato: "setup.exe", arq: "naoInformada" });
    expect(classificar("Leve_0.5.0_x64_en-US.msi")?.formato).toBe(".msi");
    expect(classificar("mdview-4.0.2-x64.exe")?.formato).toBe(".exe");
    expect(classificar("Leve_0.5.0_amd64.AppImage")).toEqual({ plataforma: "linux", formato: "AppImage", arq: "x64" });
    expect(classificar("Leve-0.5.0-1.x86_64.rpm")?.formato).toBe(".rpm");
    expect(classificar("Leve_0.5.0_x86_64.flatpak")?.formato).toBe(".flatpak");
  });

  it("marca portátil pelo nome e o tinta.exe, que não traz a palavra", () => {
    expect(classificar("MD-Reader-0.3.12-windows-x64-portable.exe")?.formato).toBe("portatil");
    expect(classificar("tinta.exe")?.formato).toBe("portatil");
  });

  it("deixa de fora ARM no PC, compactados, atualização e o que não é o app", () => {
    for (const nome of [
      "MDHero_0.2.10_arm64-setup.exe",
      "MDHero_0.2.10_arm64.deb",
      "marktext-linux-arm64-0.23.0.rpm",
      "MarkdownReader.zip",
      "Moji-1.0.7-universal.zip",
      "Leve_0.5.0_universal.app.tar.gz",
      "marktext-linux-0.23.0.tar.gz",
      "Imark-0.6.9-update.dmg",
      "MicrosoftEdgeWebView2RuntimeInstallerX64.exe",
      "mdview-4.0.2-x64.exe.sha1",
      "appcast.xml",
    ])
      expect(classificar(nome), nome).toBeNull();
  });
});

describe("barras", () => {
  it("uma por app que publica na plataforma, a menor de cada, em ordem crescente", () => {
    expect(barras(dados, "macos").map((b) => b.nome)).toEqual(["Leve", "Grande"]);
    expect(barras(dados, "linux")).toEqual([{ nome: "Só Linux", repo: "x/linux", bytes: 9_000_000, formato: ".deb" }]);
    expect(instaladores(dados.apps[2], "linux").map((a) => a.formato)).toEqual([".deb", "AppImage"]);
  });
});

describe("mb", () => {
  it("usa MB de 10⁶ bytes e o separador do idioma", () => {
    expect(mb(6_533_038, "en")).toBe("6.5 MB");
    expect(mb(6_533_038, "pt-BR")).toBe("6,5 MB");
  });
});

describe("grafico", () => {
  const larguras = (svg: string) => [...svg.matchAll(/<path d="M\d+ [\d.]+h([\d.]+)a(\d+)/g)].map((m) => Number(m[1]) + Number(m[2]));

  it("usa escala linear a partir do zero", () => {
    const [leve, grande] = larguras(grafico(dados, "macos", "en", "light"));
    expect(leve / grande).toBeCloseTo(6_533_038 / 200_000_000, 2);
  });

  it("só o Leve leva a cor da marca, em cada tema", () => {
    expect(grafico(dados, "macos", "en", "light").match(/#431a60/g)).toHaveLength(1);
    expect(grafico(dados, "macos", "en", "dark").match(/#c9a6f2/g)).toHaveLength(1);
  });

  it("escreve a regra e não depende de fonte externa nem de fundo próprio", () => {
    const svg = grafico(dados, "macos", "pt-BR", "dark");
    expect(svg).toContain("Menor instalador de cada app, última release no GitHub, 2026-10-31");
    expect(svg).toContain("6,5 MB");
    expect(svg).not.toMatch(/@import|url\(|<rect|<image/);
  });

  it("mantém todo rótulo dentro da largura", () => {
    const linhas = [{ bytes: 100, rotulo: 200 }, { bytes: 1, rotulo: 300 }];
    const comprimento = comprimentoMaximo(linhas, 560, 158);
    for (const l of linhas) expect(158 + (l.bytes / 100) * comprimento + 8 + l.rotulo).toBeLessThanOrEqual(560);
  });

  it("traz os números no texto alternativo", () => {
    expect(textoAlternativo(dados, "macos", "en")).toBe("macOS, smallest installer of each app: Leve 6.5 MB (.dmg), Grande 200.0 MB (.dmg).");
  });
});

describe("README", () => {
  it("põe o Leve primeiro na tabela e mantém os links dos outros", () => {
    const linhas = tabela(dados, "en").split("\n");
    expect(linhas[2]).toBe("| **Leve** | v1 (2026-10-01) | 6.5 MB `.dmg` (universal) | — | — |");
    expect(linhas[3]).toContain("[Só Linux](https://github.com/x/linux)");
    expect(linhas[3]).toContain("9.0 MB `.deb` · 90.0 MB AppImage");
  });

  it("descreve o portátil na célula, com a nota de quem não tem instalador", () => {
    const so = (nome: string, bytes: number): Dados => ({ consultado: "", apps: [{ nome: "X", repo: "x/x", versao: "v1", publicado: "", assets: [{ nome, bytes }] }] });
    expect(tabela(so("tinta.exe", 3_120_640), "en")).toContain("3.1 MB portable `tinta.exe`, no installer (not stated)");
    expect(tabela(so("tinta.exe", 3_120_640), "pt-BR")).toContain("3,1 MB `tinta.exe` portátil, sem instalador (não informada)");
    expect(tabela(so("x-x64-portable.exe", 6_469_120), "pt-BR")).toContain("6,5 MB `.exe` portátil (x64)");
  });

  it("marca a tabela recolhida e um <picture> claro/escuro por plataforma", () => {
    const s = secao(dados, "en");
    expect(s.match(/<picture>/g)).toHaveLength(3);
    expect(s).toContain(`srcset="${caminhoGrafico("macos", "en", "dark")}"`);
    expect(s).toContain(`src="${caminhoGrafico("linux", "en", "light")}"`);
    expect(s.indexOf("<picture>")).toBeLessThan(s.indexOf("<details>"));
    expect(s.indexOf("| App |")).toBeGreaterThan(s.indexOf("<details>"));
  });

  it("troca só o trecho entre marcadores e recusa README sem eles", () => {
    expect(trocarSecao(`a\n${INICIO}\nvelho\n${FIM}\nb`, "novo")).toBe("a\nnovo\nb");
    expect(() => trocarSecao("sem nada", "novo")).toThrow("marcadores");
  });

  it("os arquivos no repositório batem com docs/comparativo.json (`pnpm comparativo`)", () => {
    const real = JSON.parse(lerArquivo("docs/comparativo.json")) as Dados;
    for (const [arquivo, conteudo] of Object.entries(gerar(real, lerArquivo))) expect(lerArquivo(arquivo), arquivo).toBe(conteudo);
  });
});
