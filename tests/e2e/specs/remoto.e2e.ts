import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import { FIXTURES, abrirPeloSistema, esperarAbas, esperarDocumento, fecharAbasExtras } from "../helpers";

// Imagem remota bloqueada: o sanitize tira o `src` e guarda a URL em `data-remote-src` (`remote.ts`); cada
// imagem ganha um botão de carregar e o documento um aviso com "carregar todas" (`remote-ui.ts`). Nada
// depende de a rede responder: o domínio é `.invalid`, e quem lê o atributo o lê no mesmo instante do clique,
// antes de a carga falhar e a imagem virar o aviso de imagem ausente.
describe("imagem remota bloqueada", () => {
  before(async () => {
    await esperarDocumento();
    await fecharAbasExtras();
    abrirPeloSistema(join(FIXTURES, "remoto.md"));
    await esperarAbas(["exemplo.md", "remoto.md"], "remoto.md");
  });

  after(fecharAbasExtras);

  it("abre sem src: a URL fica em data-remote-src, com um botão por imagem e o aviso", async () => {
    const imagens = await browser.execute(
      "return Array.from(document.querySelectorAll('#content img')).map(function (i) {" +
        "return { src: i.getAttribute('src'), remoto: i.getAttribute('data-remote-src') };" +
        "});",
    );
    expect(imagens).toEqual([
      { src: null, remoto: "https://example.invalid/a.png" },
      { src: null, remoto: "https://example.invalid/b.png" },
    ]);
    expect((await $$("#content button.img-remote")).length).toBe(2);
    await expect($("#remote-banner")).toBeDisplayed();
    await expect($("#remote-banner button")).toBeDisplayed();
  });

  it("o botão de uma imagem devolve o atributo só dela", async () => {
    // Um `execute` só: o clique é síncrono, e a carga da imagem (que vai falhar) vem depois.
    const r = await browser.execute(
      "var b = document.querySelector('#content button.img-remote');" +
        "var img = b.previousElementSibling;" +
        "b.click();" +
        "return { src: img.getAttribute('src'), remoto: img.hasAttribute('data-remote-src'), resta: document.querySelectorAll('#content [data-remote]').length };",
    );
    expect(r).toEqual({ src: "https://example.invalid/a.png", remoto: false, resta: 1 });
    // A outra segue bloqueada, e o aviso continua.
    await expect($("#content img[data-remote-src='https://example.invalid/b.png']")).toExist();
    await expect($("#remote-banner")).toBeDisplayed();
  });

  it("Carregar neste documento libera o resto e some com o aviso", async () => {
    await $("#remote-banner button").click();
    await browser.waitUntil(async () => (await $$("#content [data-remote]")).length === 0, { timeoutMsg: "ainda há recurso bloqueado" });
    expect((await $$("#content button.img-remote")).length).toBe(0);
    await expect($("#remote-banner")).not.toBeDisplayed();
  });
});
