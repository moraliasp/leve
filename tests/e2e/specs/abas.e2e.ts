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

  it("uma nova sessão no mesmo perfil reabre as abas", async () => {
    // `leve.tabs` é gravado a cada mudança de aba; o WebView grava o localStorage em disco em segundo
    // plano (o Chromium do WebView2, em lote a cada 5 s), então dá tempo antes de matar o app.
    await browser.pause(WIN ? 8000 : 3000);
    await browser.reloadSession();
    await esperarDocumento();
    await browser.pause(1000);

    await esperarAbas(["exemplo.md", "aba-dois.md"]);
    // A aba restaurada abre de verdade: o arquivo segue concedido (`grants.json`).
    await ativarAba(1);
    await expect($("#content h1")).toHaveText("Aba dois");
  });
});
