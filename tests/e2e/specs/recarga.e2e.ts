import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import {
  abrirPeloSistema,
  copiarFixture,
  criarTemporario,
  esperarAbas,
  esperarDocumento,
  fecharAbasExtras,
  removerTemporario,
} from "../helpers";

// Recarga ao salvar: o vigia (`watch_file`) avisa `file-changed` e o frontend recarrega (`reloadCurrent`).
describe("recarga ao salvar", () => {
  let dir: string | undefined;

  before(async () => {
    await esperarDocumento();
    await fecharAbasExtras();
    dir = criarTemporario();
    copiarFixture("recarga.md", dir);
  });

  after(async () => {
    await fecharAbasExtras();
    removerTemporario(dir);
  });

  it("reescrever o arquivo aberto atualiza #content sem tocar em nada", async () => {
    const arquivo = join(dir!, "recarga.md");
    abrirPeloSistema(arquivo);
    await esperarAbas(["exemplo.md", "recarga.md"], "recarga.md");
    await expect($("#content")).toHaveText(expect.stringContaining("ANTES"));

    // O vigia nasce no fim do `loadDoc` e o `notify` leva um instante para armar: uma pausa curta e UM
    // salvamento, como quem salva no editor. Depois, silêncio: nenhum `file-changed` a mais (o laço da #107).
    await browser.pause(1_500);
    await browser.execute(
      "window.__fileChanged = []; var I = window.__TAURI_INTERNALS__;" +
        "I.invoke('plugin:event|listen', { event: 'file-changed', target: { kind: 'Any' }," +
        " handler: I.transformCallback(function (e) { window.__fileChanged.push(e.payload); }) });",
    );
    writeFileSync(arquivo, "# Recarga\n\nVersao DEPOIS do salvamento.\n");
    await browser.waitUntil(async () => String(await $("#content").getText()).includes("DEPOIS"), {
      timeout: 10_000,
      timeoutMsg: "#content não mudou depois de um salvamento do arquivo aberto",
    });
    await browser.execute("window.__fileChanged.length = 0;");
    await browser.pause(2_500);
    expect(await browser.execute("return window.__fileChanged.slice();")).toEqual([]);
    const texto = String(await $("#content").getText());
    expect(texto).not.toContain("ANTES");
    // Continua a mesma aba, no mesmo documento.
    await esperarAbas(["exemplo.md", "recarga.md"], "recarga.md");
  });
});
