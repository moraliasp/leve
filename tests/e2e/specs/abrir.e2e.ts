import { $, $$, browser, expect } from "@wdio/globals";
import { esperarDocumento } from "../helpers";

// (a) O exemplo chega pelo argv (`markdown_args`, 1ª instância no Windows/Linux) e é renderizado.
// Seletores por id e atributo: o idioma da interface segue o sistema, e o do exemplo é o do arquivo.
describe("abrir pelo argv", () => {
  before(esperarDocumento);

  it("renderiza os títulos do exemplo em #content", async () => {
    const h1 = await $$("#content h1");
    expect(h1.length).toBeGreaterThanOrEqual(1);
    const h2 = await $$("#content h2");
    expect(h2.length).toBeGreaterThanOrEqual(5);
    // Âncora do próprio exemplo (`[a seção de tabelas](#tabelas)`): o título ganhou id.
    await expect($("#content h2[id='tabelas']")).toExist();
  });

  it("mostra o documento e esconde a tela vazia", async () => {
    await expect($("#content")).toBeDisplayed();
    await expect($("#empty")).not.toBeDisplayed();
  });

  it("abriu uma aba com o arquivo, não o exemplo embutido", async () => {
    // O exemplo embutido tem caminho `sample:<idioma>`; o do argv é o arquivo do repositório
    // (`#title` guarda o caminho no `title`) e o título da janela leva o nome dele.
    const caminho = (await $("#title").getAttribute("title")) ?? "";
    expect(caminho.startsWith("sample:")).toBe(false);
    expect(caminho.replace(/\\/g, "/").endsWith("/docs/exemplo.md")).toBe(true);
    expect(await browser.getTitle()).toContain("exemplo.md");
  });
});
