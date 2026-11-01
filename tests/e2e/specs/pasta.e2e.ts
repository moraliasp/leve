import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import {
  abrirPeloSistema,
  acionarMenu,
  caminhoAtivo,
  concederPasta,
  copiarFixture,
  criarTemporario,
  esperarAbas,
  esperarAtivo,
  esperarDocumento,
  fecharAbasExtras,
  removerTemporario,
} from "../helpers";

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
    const nativo = process.platform === "win32" ? canonica.replace(/\//g, "\\") : canonica;
    await concederPasta(nativo);

    await browser.reloadSession();
    await esperarDocumento();
    await browser.execute("localStorage.setItem(arguments[0], arguments[1]);", "leve.folder", JSON.stringify({ root: nativo, expanded: [] }));
    await browser.refresh();
    await $("#tree").waitForExist({ timeoutMsg: "a pasta concedida não abriu a árvore" });
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
    await expect($("#tree li[data-path='raiz.md']")).toHaveAttribute("aria-current", "page");
  });

  it("expandir a subpasta mostra o arquivo dela, e clicar o abre", async () => {
    await $("#tree li[data-path='sub']").click();
    await expect($("#tree li[data-path='sub']")).toHaveAttribute("aria-expanded", "true");
    await $("#tree li[data-path='sub/aninhado.md']").waitForDisplayed();

    await $("#tree li[data-path='sub/aninhado.md']").click();
    await esperarAtivo("aninhado.md");
    await expect($("#content h1")).toHaveText("Aninhado");
    await expect($("#tree li[data-path='sub/aninhado.md']")).toHaveAttribute("aria-current", "page");
    // Exemplo, raiz e aninhado: cada arquivo da árvore abre na sua aba.
    await esperarAbas(["exemplo.md", "raiz.md", "aninhado.md"], "aninhado.md");
  });

  it("o Abrir rápido passa a listar os arquivos da pasta", async () => {
    await acionarMenu("quick-open");
    await $("#quick-list li[title='sub/aninhado.md']").waitForDisplayed({ timeoutMsg: "o Abrir rápido não listou a pasta" });
    await expect($("#quick-list li[title='raiz.md']")).toExist();
    await browser.execute("document.getElementById('quick').close();");
  });
});
