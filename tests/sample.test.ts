import { describe, expect, it } from "vitest";
import pt from "../src/sample/pt-BR.md?raw";
import en from "../src/sample/en.md?raw";
import { render } from "../src/render";
import { type LaunchFacts, isSample, sampleOnLaunch, samplePath, sampleText, sampleToReplace } from "../src/sample";
import { loadYaml } from "../src/yaml";

// O front matter do exemplo lê o `yaml`, que o app carrega sob demanda (src/yaml.ts). Antes do
// `describe.each`, que renderiza na coleta.
await loadYaml();

const base: LaunchFacts = { fileArrived: false, restoredTabs: false, prefOn: true, reload: false, sampleWasOpen: false };

describe("abre o exemplo na abertura?", () => {
  it("abertura direta, sem abas e com a preferência ligada: abre", () => {
    expect(sampleOnLaunch(base)).toBe(true);
  });

  it("arquivo pedido pelo SO (ou ?file=) sempre vence", () => {
    expect(sampleOnLaunch({ ...base, fileArrived: true })).toBe(false);
    expect(sampleOnLaunch({ ...base, fileArrived: true, reload: true, sampleWasOpen: true })).toBe(false);
  });

  it("abas restauradas ou preferência desligada: não abre", () => {
    expect(sampleOnLaunch({ ...base, restoredTabs: true })).toBe(false);
    expect(sampleOnLaunch({ ...base, prefOn: false })).toBe(false);
  });

  it("recarga da página (troca de idioma) só devolve o exemplo se ele estava aberto", () => {
    expect(sampleOnLaunch({ ...base, reload: true })).toBe(false);
    expect(sampleOnLaunch({ ...base, reload: true, sampleWasOpen: true, restoredTabs: true, prefOn: false })).toBe(true);
  });
});

describe("arquivo do SO depois da abertura: fecha o exemplo?", () => {
  const sample = { path: "sample:pt-BR" };
  const file = { path: "/notas/a.md" };

  it("fecha só o exemplo da abertura, único e intocado", () => {
    expect(sampleToReplace([sample], sample)).toBe(sample);
  });

  it("mantém se o leitor mexeu (sem marca), se há outras abas ou se a marca não é exemplo", () => {
    expect(sampleToReplace([sample], null)).toBeNull();
    expect(sampleToReplace([sample, file], sample)).toBeNull();
    // Marca apontando para a aba de um arquivo (corrida na abertura): nunca fecha a aba do leitor.
    expect(sampleToReplace([file], file)).toBeNull();
    expect(sampleToReplace([{ path: "sample:pt-BR" }], sample)).toBeNull();
  });
});

describe("documento em memória", () => {
  it("caminho sintético por idioma, nunca confundido com arquivo", () => {
    expect(samplePath("pt-BR")).toBe("sample:pt-BR");
    expect(samplePath("en")).toBe("sample:en");
    expect(isSample("sample:en")).toBe(true);
    expect(isSample("/docs/sample.md")).toBe(false);
    expect(isSample("C:\\notas\\a.md")).toBe(false);
  });

  it("o texto segue o idioma do caminho", async () => {
    expect(await sampleText(samplePath("pt-BR"))).toBe(pt);
    expect(await sampleText(samplePath("en"))).toBe(en);
  });
});

describe.each([
  ["pt-BR", pt],
  ["en", en],
])("exemplo %s", (_lang, src) => {
  const html = render(src);
  const count = (s: string): number => html.split(s).length - 1;

  it("mostra os recursos do Leve", () => {
    expect(html).toContain('class="frontmatter"');
    expect(html).toContain("<table>");
    expect(html).toContain('class="alert alert-tip"');
    expect(html).toContain('class="alert alert-important"');
    expect(html).toContain('class="alert alert-warning"');
    expect(html).toContain("<details");
    expect(html).toContain('class="wikilink"');
    expect(html).toContain('class="math math-inline"');
    expect(html).toContain('class="math math-block"');
    expect(count('<pre class="mermaid">')).toBe(2);
    expect(html).toContain('class="language-python"');
    expect(html).toContain('class="task-list-item');
    expect(count('class="footnote-ref"')).toBe(2);
  });

  it("é para o leitor final: sem erro proposital, sem recurso remoto, sem caminho local", () => {
    expect(html).not.toContain("render-error");
    expect(html).not.toContain("data-remote-");
    expect(html).not.toMatch(/<img/);
    // Links só externos (https) ou âncoras: nada relativo, que o exemplo não tem pasta. Wikilink
    // é tratado à parte (o clique usa `data-path`, que o exemplo nunca recebe).
    const box = document.createElement("div");
    box.innerHTML = html;
    for (const a of box.querySelectorAll("a[href]:not(.wikilink)")) expect(a.getAttribute("href")).toMatch(/^(https:|#)/);
  });

  it("não escreve atalho fixo (⌘/Ctrl): descreve pelo menu", () => {
    expect(src).not.toMatch(/[⌘⇧⌥]|Ctrl\+|Cmd\+/);
  });
});

it("os dois idiomas têm a mesma estrutura", () => {
  // Títulos, alertas, cercas de código (com a linguagem), tarefas e tabelas, na ordem.
  const shape = (src: string): string[] =>
    src.split("\n").flatMap((l) => l.match(/^(#{1,3} |> \[!\w+\]-?|```\w*|- \[[ x]\]|\|---)/)?.[0] ?? []);
  expect(shape(en)).toEqual(shape(pt));
});
