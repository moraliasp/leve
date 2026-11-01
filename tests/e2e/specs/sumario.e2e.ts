import { $, $$, browser, expect } from "@wdio/globals";
import { esperarDocumento } from "../helpers";

// (b) O sumário lista os títulos do documento, e clicar num item rola até o título.
describe("sumário", () => {
  before(esperarDocumento);

  it("lista um item por título com id", async () => {
    // O sumário é visível na janela larga (1100 px) e por padrão; o botão da barra só confere o estado.
    await expect($("#btn-toc")).toHaveAttribute("aria-expanded", "true");
    await expect($("#toc")).toBeDisplayed();
    const titulos = await browser.execute(
      "return document.querySelectorAll('#content h1[id], #content h2[id], #content h3[id], #content h4[id], #content h5[id], #content h6[id]').length;",
    );
    const itens = await $$("#toc li a");
    expect(itens.length).toBeGreaterThan(5);
    expect(itens.length).toBe(titulos);
    await expect($("#toc a[href='#tabelas']")).toExist();
  });

  it("clicar num item rola até o título", async () => {
    const posicao = "return document.getElementById('main').scrollTop;";
    expect(await browser.execute(posicao)).toBeLessThan(5);

    await $("#toc a[href='#tabelas']").click();

    await browser.waitUntil(async () => Number(await browser.execute(posicao)) > 100, {
      timeoutMsg: "o documento não rolou depois do clique no sumário",
    });
    // O título fica perto do topo do painel (`scrollToAnchor` deixa 16 px) e o item vira o atual.
    await browser.waitUntil(
      async () =>
        Number(
          await browser.execute(
            "return document.getElementById('tabelas').getBoundingClientRect().top - document.getElementById('main').getBoundingClientRect().top;",
          ),
        ) < 60,
      { timeoutMsg: "o título #tabelas não chegou ao topo do painel" },
    );
    await expect($("#toc a[href='#tabelas']")).toHaveAttribute("aria-current", "location");
  });
});
