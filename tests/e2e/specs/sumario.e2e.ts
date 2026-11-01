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
    // Distância do título ao topo do painel de rolagem (#main), no mesmo referencial antes e depois.
    const distancia =
      "return document.getElementById('tabelas').getBoundingClientRect().top - document.getElementById('main').getBoundingClientRect().top;";
    // O título fica bem abaixo da primeira tela (o exemplo é longo); a rolagem inicial não é zero
    // em todo sistema, então o ponto de partida é a distância, não o `scrollTop`.
    expect(Number(await browser.execute(distancia))).toBeGreaterThan(400);

    await $("#toc a[href='#tabelas']").click();

    // `scrollToAnchor` deixa o título a 16 px do topo; o item vira o atual (`aria-current`).
    await browser.waitUntil(async () => Math.abs(Number(await browser.execute(distancia))) < 60, {
      timeoutMsg: "o título #tabelas não chegou ao topo do painel depois do clique no sumário",
    });
    await expect($("#toc a[href='#tabelas']")).toHaveAttribute("aria-current", "location");
  });
});
