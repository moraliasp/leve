import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import {
  abrirPeloSistema,
  acionarMenu,
  ativarAba,
  copiarFixture,
  criarTemporario,
  esperarAbas,
  esperarDocumento,
  fecharAbasExtras,
  removerTemporario,
} from "../helpers";
import { WIN } from "../paths";

// Abas: abrir pelo SO (2ª instância → request_open → loadDoc em aba nova), alternar e fechar pelas ações
// do menu (`next-tab`, `prev-tab`, `close-tab`) e restaurar numa nova sessão do mesmo perfil (`leve.tabs`).
// Nomes de arquivo vêm do `title` das abas (o caminho); o texto da interface não entra.
describe("abas", () => {
  let dir: string | undefined;

  before(async () => {
    await esperarDocumento();
    await fecharAbasExtras();
    dir = criarTemporario();
    copiarFixture("aba-um.md", dir);
    copiarFixture("aba-dois.md", dir);
  });

  after(async () => {
    await fecharAbasExtras();
    removerTemporario(dir);
  });

  it("abre cada documento do SO numa aba nova ao lado da ativa", async () => {
    await esperarAbas(["exemplo.md"], "exemplo.md");

    abrirPeloSistema(join(dir!, "aba-um.md"));
    await esperarAbas(["exemplo.md", "aba-um.md"], "aba-um.md");
    await expect($("#content h1")).toHaveText("Aba um");

    abrirPeloSistema(join(dir!, "aba-dois.md"));
    await esperarAbas(["exemplo.md", "aba-um.md", "aba-dois.md"], "aba-dois.md");
    await expect($("#content h1")).toHaveText("Aba dois");
  });

  it("next-tab e prev-tab alternam, com volta nas pontas", async () => {
    await acionarMenu("next-tab");
    await esperarAbas(["exemplo.md", "aba-um.md", "aba-dois.md"], "exemplo.md");
    await expect($("#content h1[id]")).not.toHaveText("Aba dois");

    await acionarMenu("prev-tab");
    await esperarAbas(["exemplo.md", "aba-um.md", "aba-dois.md"], "aba-dois.md");
    await expect($("#content h1")).toHaveText("Aba dois");
  });

  it("clicar numa aba mostra o documento dela", async () => {
    await ativarAba(1);
    await expect($("#content h1")).toHaveText("Aba um");
  });

  it("close-tab fecha a ativa e passa para a vizinha", async () => {
    await acionarMenu("close-tab");
    await esperarAbas(["exemplo.md", "aba-dois.md"], "aba-dois.md");
    await expect($("#content h1")).toHaveText("Aba dois");
  });

  it("reabre as abas na partida seguinte", async () => {
    if (WIN) {
      // WebView2: o localStorage não sobrevive ao app morto pelo driver (medido: depois de `reloadSession` o
      // `leve.tabs` volta só com o exemplo, mesmo esperando mais que os 5 s do lote do Chromium). Aqui a
      // partida seguinte é a recarga da página, que também passa por `openAtLaunch` e `restoreTabs`.
      await browser.refresh();
    } else {
      // WebKitGTK: sessão nova no mesmo perfil. `leve.tabs` é gravado a cada mudança de aba, mas o WebView
      // só o leva ao disco em segundo plano, então dá tempo antes de matar o app.
      await browser.pause(3000);
      await browser.reloadSession();
    }
    await esperarDocumento();

    await esperarAbas(["exemplo.md", "aba-dois.md"]);
    // A aba restaurada abre de verdade: o arquivo segue concedido (`grants.json`).
    await ativarAba(1);
    await expect($("#content h1")).toHaveText("Aba dois");
  });
});
