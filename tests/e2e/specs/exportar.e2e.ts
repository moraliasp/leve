import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import {
  PREFIXO_TEMP,
  abrirPeloSistema,
  acionarMenu,
  copiarFixture,
  criarTemporario,
  esperarAbas,
  esperarDocumento,
  fecharAbasExtras,
  removerTemporario,
} from "../helpers";

// PNG de 1x1 pixel, gerado aqui: a fixture não carrega binário.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

// Export sem caminho de disco (#92). `save_html` abre o diálogo nativo de salvar, que o WebDriver não
// alcança; `copy-html` monta o mesmo HTML (`buildExport`) e o entrega à área de transferência. A área do
// runner (xvfb, sem gerenciador; WebView2 sem gesto) não é confiável, então o roteiro troca só a ponta:
// `navigator.clipboard.write` na página guarda o texto que o app mandou escrever. O HTML é o do app.
describe("exportar HTML sem caminho de disco", () => {
  let dir: string | undefined;
  let html = "";

  before(async () => {
    await esperarDocumento();
    await fecharAbasExtras();
    dir = criarTemporario();
    writeFileSync(join(dir, "pixel.png"), PNG);
    // Caminho absoluto de imagem como o leitor o escreveria (com `/`, que o Markdown aceita nos dois sistemas).
    const absoluta = join(dir, "pixel.png").replace(/\\/g, "/");
    copiarFixture("exportar.md", dir, { ABSOLUTA: absoluta });
    abrirPeloSistema(join(dir, "exportar.md"));
    await esperarAbas(["exemplo.md", "exportar.md"], "exportar.md");
    // Imagem que não carrega vira o aviso `.img-missing`, que faz parte do documento (e do export).
    await browser.waitUntil(async () => (await browser.execute("return document.querySelectorAll('#content .img-missing').length;")) !== 0, {
      timeoutMsg: "nenhuma imagem ausente apareceu no documento",
    });
  });

  after(async () => {
    await fecharAbasExtras();
    removerTemporario(dir);
  });

  it("Copiar como HTML entrega o documento exportado", async () => {
    // O app só escreve se `ClipboardItem` e `navigator.clipboard.write` existem; a captura define os dois.
    await browser.execute(
      "window.__copiado = null;" +
        "window.ClipboardItem = function (itens) { this.itens = itens; };" +
        "window.ClipboardItem.prototype.getType = function (tipo) { return Promise.resolve(this.itens[tipo]); };" +
        "Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: function (lista) {" +
        "return lista[0].getType('text/plain').then(function (b) { return b.text(); }).then(function (t) { window.__copiado = t; });" +
        "} } });",
    );
    await acionarMenu("copy-html");
    await $("#export-ok").waitForClickable({ timeoutMsg: "a folha de exportar não abriu" });
    await $("#export-ok").click();
    await browser.waitUntil(async () => (await browser.execute("return window.__copiado;")) !== null, {
      timeoutMsg: "o app não escreveu o HTML exportado",
    });
    html = String(await browser.execute("return window.__copiado;"));
    expect(html).toContain('<meta name="generator" content="Leve">');
    expect(html).toContain("Exportar sem caminho");
    expect(html).toContain("Texto do documento exportado.");
  });

  it("a imagem local sai embutida, não apontando para o disco", () => {
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toMatch(/asset(\.|:\/\/)localhost/);
    expect(html).not.toContain("/recusado/");
  });

  it("o aviso de imagem ausente fica, sem o caminho", () => {
    expect(html).toContain("img-missing");
    expect(html).toContain("nao-existe.png");
  });

  it("nenhum caminho do diretório temporário aparece no HTML", () => {
    // O diretório do teste tem nome com prefixo e sufixo aleatório: se ele aparece em qualquer forma
    // (caminho, URL, codificado), este prefixo aparece junto.
    expect(html).not.toContain(PREFIXO_TEMP);
  });
});
