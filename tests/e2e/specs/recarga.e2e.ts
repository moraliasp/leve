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

    // O vigia só existe depois de o `loadDoc` terminar, e o `notify` leva um instante para armar: salva
    // de novo a cada volta até a tela mudar, em vez de adivinhar uma espera.
    let volta = 0;
    await browser.waitUntil(
      async () => {
        volta++;
        writeFileSync(arquivo, `# Recarga\n\nVersao DEPOIS do salvamento, volta ${volta}.\n`);
        await browser.pause(800);
        return String(await $("#content").getText()).includes("DEPOIS");
      },
      { timeout: 30_000, interval: 200, timeoutMsg: "#content não mudou depois de reescrever o arquivo aberto" },
    );
    const texto = String(await $("#content").getText());
    expect(texto).not.toContain("ANTES");
    // Continua a mesma aba, no mesmo documento.
    await esperarAbas(["exemplo.md", "recarga.md"], "recarga.md");
  });
});
