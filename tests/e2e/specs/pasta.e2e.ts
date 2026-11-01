import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import {
  abrirPeloSistema,
  acionarMenu,
  caminhoAtivo,
  concederPasta,
  copiarFixture,
  criarTemporario,
  esperarAtivo,
  abas,
  esperarDocumento,
  estadoDaPagina,
  fecharAbasExtras,
  removerTemporario,
  vigiarErrosDaPagina,
} from "../helpers";
import { WIN } from "../paths";

// Pasta aberta: árvore lateral e abertura de arquivo por ela (`open_in_folder`). A concessão da pasta só
// nasce do diálogo nativo (`pick_folder`), que o WebDriver não alcança; o roteiro faz o que o diálogo
// deixaria como dado do perfil: a raiz em `grants.json` (o Rust lê ao iniciar, então a sessão recomeça) e
// `leve.folder` no localStorage (a página recarrega, e `main` abre a pasta salva). Nada no app muda.
describe("pasta", () => {
  let dir: string | undefined;

  before(async () => {
    await esperarDocumento();
    await fecharAbasExtras();
    dir = criarTemporario();
    const raiz = copiarFixture("pasta", dir);

    // A raiz canônica vem do próprio app: abre um arquivo dela pelo SO e tira o diretório do caminho
    // que o Rust devolveu (é a forma exata que `granted_folder` compara).
    abrirPeloSistema(join(raiz, "raiz.md"));
    await esperarAtivo("raiz.md");
    const arquivo = await caminhoAtivo();
    const canonica = arquivo.slice(0, arquivo.lastIndexOf("/"));
    const nativo = WIN ? canonica.replace(/\//g, "\\") : canonica;
    // A aba da raiz não precisa voltar na próxima partida: o resto do roteiro a abre pela árvore.
    await fecharAbasExtras();
    await concederPasta(nativo);

    // `grants.json` só é lido na partida do app, então a sessão recomeça. `leve.folder` é o que `main` lê para
    // abrir a pasta salva: o WebKitGTK o leva ao disco, e a sessão nova já o encontra; o WebView2 não guarda o
    // localStorage de um app morto pelo driver (ver abas.e2e.ts), então ali a página recarrega depois.
    const salva = JSON.stringify({ root: nativo, expanded: [] });
    const guardar = "localStorage.setItem(arguments[0], arguments[1]);";
    if (!WIN) {
      await browser.execute(guardar, "leve.folder", salva);
      await browser.pause(3000);
    }
    await browser.reloadSession();
    await esperarDocumento();
    if (WIN) {
      await browser.execute(guardar, "leve.folder", salva);
      await browser.refresh();
    }
    await $("#tree").waitForExist({ timeoutMsg: "a pasta concedida não abriu a árvore" });
    await esperarAtivo("exemplo.md");
    await vigiarErrosDaPagina();
    console.log("pasta, partida:", await estadoDaPagina(), JSON.stringify(await abas()));
    await browser.pause(2000);
    console.log("pasta, 2 s depois:", await estadoDaPagina(), JSON.stringify(await abas()));
  });

  after(async () => {
    await acionarMenu("close-folder");
    await fecharAbasExtras();
    removerTemporario(dir);
  });

  it("mostra a árvore com a pasta e o arquivo da raiz", async () => {
    await expect($("#btn-tree")).toHaveAttribute("aria-expanded", "true");
    await expect($("#tree li[data-path='sub']")).toBeDisplayed();
    await expect($("#tree li[data-path='sub']")).toHaveAttribute("aria-expanded", "false");
    await expect($("#tree li[data-path='raiz.md']")).toBeDisplayed();
    // Ainda fechada: o que está dentro da subpasta não aparece.
    await expect($("#tree li[data-path='sub/aninhado.md']")).not.toExist();
  });

  it("clicar num arquivo da árvore o abre numa aba", async () => {
    await $("#tree li[data-path='raiz.md']").click();
    await esperarAtivo("raiz.md");
    await expect($("#content h1")).toHaveText("Raiz da pasta");
    try {
      await expect($("#tree li[data-path='raiz.md']")).toHaveAttribute("aria-current", "page");
    } catch (e) {
      const rastro = await browser.execute("return JSON.stringify(window.__erros);");
      throw new Error(`${String(e)}; ativo ${await caminhoAtivo()}; rastro ${String(rastro)}`);
    }
  });

  it("expandir a subpasta mostra o arquivo dela, e clicar o abre", async () => {
    await $("#tree li[data-path='sub']").click();
    await expect($("#tree li[data-path='sub']")).toHaveAttribute("aria-expanded", "true");
    await $("#tree li[data-path='sub/aninhado.md']").waitForDisplayed();

    await $("#tree li[data-path='sub/aninhado.md']").click();
    await esperarAtivo("aninhado.md");
    await expect($("#content h1")).toHaveText("Aninhado");
    await expect($("#tree li[data-path='sub/aninhado.md']")).toHaveAttribute("aria-current", "page");
  });

  it("o Abrir rápido passa a listar os arquivos da pasta", async () => {
    await acionarMenu("quick-open");
    await $("#quick-list li[title='sub/aninhado.md']").waitForDisplayed({ timeoutMsg: "o Abrir rápido não listou a pasta" });
    await expect($("#quick-list li[title='raiz.md']")).toExist();
    await browser.execute("document.getElementById('quick').close();");
  });
});
