import { $, browser, expect } from "@wdio/globals";
import { acionarMenu, esperarDocumento } from "../helpers";

// (c) A busca encontra um termo do exemplo e marca o resultado. O atalho Mod+F vive no menu nativo,
// então a busca abre pela mesma ação (`find`) que o menu dispara; teclado do sistema é a #100.
describe("busca", () => {
  before(esperarDocumento);

  it("abre a barra de busca e foca o campo", async () => {
    await acionarMenu("find");
    await browser.waitUntil(() => browser.execute("return !document.getElementById('find').classList.contains('hidden');"), {
      timeoutMsg: "a barra de busca não abriu",
    });
    await expect($("#find-input")).toBeFocused();
  });

  it("encontra o termo e marca o resultado", async () => {
    await $("#find-input").setValue("tauri");
    // O contador é "<n>/<total>", sem texto de idioma.
    await browser.waitUntil(async () => /^1\/\d+$/.test(await $("#find-count").getText()), {
      timeoutMsg: "a busca não achou 'tauri' no exemplo",
    });
    const total = Number((await $("#find-count").getText()).split("/")[1]);
    expect(total).toBeGreaterThan(1);
    // As marcas são da CSS Custom Highlight API: todas em "find", a atual em "find-current".
    const marcas = await browser.execute(
      "return { todas: CSS.highlights.get('find').size, atual: CSS.highlights.get('find-current').size };",
    );
    expect(marcas).toEqual({ todas: total, atual: 1 });
  });

  it("o botão de próximo vai para o resultado seguinte", async () => {
    await $("#find-next").click();
    await expect($("#find-count")).toHaveText(expect.stringMatching(/^2\/\d+$/));
  });

  it("fechar limpa as marcas", async () => {
    await $("#find-close").click();
    await expect($("#find")).toHaveElementClass("hidden");
    expect(await browser.execute("return CSS.highlights.has('find');")).toBe(false);
  });
});
