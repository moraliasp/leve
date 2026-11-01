import { join } from "node:path";
import { $, $$, browser, expect } from "@wdio/globals";
import {
  abas,
  abrirPeloSistema,
  acionarMenu,
  caminhoAtivo,
  copiarFixture,
  criarTemporario,
  esperarAbas,
  esperarDocumento,
  esperarAtivo,
  fecharAbasExtras,
  removerTemporario,
} from "../helpers";

// Abrir rápido sem pasta: a lista são os Recentes (`leve.recent`, que o `loadDoc` alimenta), e a busca
// é aproximada (`fuzzy.ts`). A ação `quick-open` é a do menu (Mod+P vive no menu nativo).
describe("abrir rápido", () => {
  let dir: string | undefined;

  before(async () => {
    await esperarDocumento();
    await fecharAbasExtras();
    dir = criarTemporario();
    copiarFixture("rapido-alfa.md", dir);
    copiarFixture("rapido-beta.md", dir);
    // Abrir pelo SO concede o arquivo e o põe nos Recentes.
    abrirPeloSistema(join(dir, "rapido-alfa.md"));
    await esperarAbas(["exemplo.md", "rapido-alfa.md"], "rapido-alfa.md");
    abrirPeloSistema(join(dir, "rapido-beta.md"));
    await esperarAbas(["exemplo.md", "rapido-alfa.md", "rapido-beta.md"], "rapido-beta.md");
  });

  after(async () => {
    await fecharAbasExtras();
    removerTemporario(dir);
  });

  const primeiro = "#quick-list li:first-child";

  it("lista os Recentes", async () => {
    await acionarMenu("quick-open");
    await browser.waitUntil(() => browser.execute("var q = document.getElementById('quick'); return !!q && q.open;"), {
      timeoutMsg: "a caixa do Abrir rápido não abriu",
    });
    await expect($("#quick input")).toBeFocused();
    const titulos = (await $$("#quick-list li")).length;
    expect(titulos).toBeGreaterThanOrEqual(3);
    await expect($("#quick-list li[title$='rapido-alfa.md']")).toExist();
    await expect($("#quick-list li[title$='rapido-beta.md']")).toExist();
  });

  it("a busca aproximada acha o arquivo", async () => {
    await $("#quick input").setValue("rapido-alfa");
    await browser.waitUntil(async () => ((await $(primeiro).getAttribute("title")) ?? "").endsWith("rapido-alfa.md"), {
      timeoutMsg: "o primeiro resultado não é o rapido-alfa.md",
    });
    // Sem casamento nenhum, a caixa diz que não achou e a lista fica vazia.
    await $("#quick input").setValue("zzqqxxjjkk");
    await browser.waitUntil(async () => (await $$("#quick-list li")).length === 0, { timeoutMsg: "a lista não esvaziou" });
    await expect($("#quick .quick-empty")).toBeDisplayed();
    await $("#quick input").setValue("rapido-alfa");
    await browser.waitUntil(async () => ((await $(primeiro).getAttribute("title")) ?? "").endsWith("rapido-alfa.md"));
  });

  it("escolher o resultado abre o documento e fecha a caixa", async () => {
    // A ativa é a beta; escolher o alfa tem de mudar o documento.
    expect(await caminhoAtivo()).toMatch(/\/rapido-beta\.md$/);
    await $(primeiro).click();
    await esperarAtivo("rapido-alfa.md");
    await expect($("#content h1")).toHaveText("Rapido alfa");
    expect(await browser.execute("return document.getElementById('quick').open;")).toBe(false);
    // Sem ⌘/Ctrl a escolha navega na aba ativa (a do beta), como qualquer abertura sem `target: "new"`:
    // continuam três abas.
    expect((await abas()).length).toBe(3);
  });
});
