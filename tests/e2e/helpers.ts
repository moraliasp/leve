import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browser, $, $$ } from "@wdio/globals";
import { BINARIO, EXEMPLO, WIN } from "./paths";

// Os scripts vão como texto: o wdio serializa a função, e o que o esbuild injeta num callback
// (`__name`) não existe dentro da página.

/**
 * Windows: entrega o exemplo como o SO faz com o app já aberto, uma 2ª instância com o arquivo no argv
 * (o plugin single-instance repassa à 1ª e a 2ª sai). No Linux o exemplo já foi no argv da 1ª instância.
 */
function abrirExemplo(): void {
  if (WIN) spawn(BINARIO, [EXEMPLO], { stdio: "ignore", detached: true }).unref();
}

/**
 * Espera o documento do exemplo aparecer. O exemplo embutido também tem títulos, então a condição é o
 * arquivo do disco: `#title` guarda o caminho no `title`. Depois, `#content` visível e com título.
 */
export async function esperarDocumento(): Promise<void> {
  abrirExemplo();
  await browser.waitUntil(
    () =>
      browser.execute(
        "var c = document.getElementById('content'), t = document.getElementById('title');" +
          "var caminho = ((t && t.title) || '').replace(/\\\\/g, '/');" +
          "return !!c && !c.hidden && c.querySelectorAll('h1, h2').length > 0 && caminho.endsWith('/docs/exemplo.md');",
      ),
    { timeout: 30_000, timeoutMsg: "o exemplo do disco não apareceu em #content" },
  );
  await $("#content h1").waitForDisplayed();
}

/**
 * Faz o que o menu nativo faz: o Rust emite o evento `menu` com o id da ação (`menu.rs`) e o
 * frontend mapeia em `actions` (`main.ts`). Menu nativo e tecla do sistema o WebDriver não alcança
 * (#100); o evento é o mesmo caminho a partir dali. Fica sem `await` no resultado: o `execute`
 * clássico não espera promessa.
 */
export async function acionarMenu(id: string): Promise<void> {
  await browser.execute(
    "window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'menu', payload: arguments[0] });",
    id,
  );
}

// ---------- fluxos (#99): arquivos de teste, 2ª instância, abas e concessões ----------

/** Documentos de teste dos roteiros; cada um é copiado para um diretório temporário antes de abrir. */
export const FIXTURES = join(import.meta.dirname, "fixtures");

/** Prefixo dos diretórios temporários: o roteiro do export procura por ele no HTML gerado. */
export const PREFIXO_TEMP = "leve-e2e-fx-";

export function criarTemporario(): string {
  return mkdtempSync(join(tmpdir(), PREFIXO_TEMP));
}

export function removerTemporario(dir: string | undefined): void {
  if (dir) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
}

/**
 * Copia uma fixture (arquivo ou pasta) para `dir` e devolve o caminho da cópia. `trocas` substitui
 * `{{chave}}` no texto, para o que só se sabe na hora (o caminho do diretório temporário).
 */
export function copiarFixture(nome: string, dir: string, trocas: Record<string, string> = {}): string {
  const destino = join(dir, nome);
  mkdirSync(join(destino, ".."), { recursive: true });
  cpSync(join(FIXTURES, nome), destino, { recursive: true });
  if (Object.keys(trocas).length > 0) {
    let texto = readFileSync(destino, "utf8");
    for (const [chave, valor] of Object.entries(trocas)) texto = texto.replaceAll(`{{${chave}}}`, valor);
    writeFileSync(destino, texto);
  }
  return destino;
}

/**
 * Arquivo pedido pelo SO com o app aberto: uma 2ª instância com o caminho no argv, que o
 * `single-instance` repassa à 1ª (`request_open`, que concede o arquivo, e `loadDoc` em aba nova). É o
 * caminho do duplo-clique no Finder/Explorer, nos dois sistemas.
 */
export function abrirPeloSistema(caminho: string): void {
  const filho = spawn(BINARIO, [caminho], { stdio: "ignore", detached: true });
  filho.once("error", (e) => console.error("2ª instância:", e));
  filho.unref();
}

/** Caminho do documento ativo (`#title` guarda o caminho no `title`), com `/` nos dois sistemas. */
export async function caminhoAtivo(): Promise<string> {
  const t = await browser.execute("var t = document.getElementById('title'); return t ? t.title : '';");
  return String(t).replace(/\\/g, "/");
}

/** Espera o documento ativo ter este nome de arquivo (o caminho canônico pode diferir do pedido). */
export async function esperarAtivo(nome: string): Promise<void> {
  try {
    await browser.waitUntil(async () => (await caminhoAtivo()).endsWith(`/${nome}`));
  } catch {
    // A mensagem diz o que a página mostrava, que é o que falta para entender a falha.
    const h1 = await browser.execute("var h = document.querySelector('#content h1'); return h ? h.textContent : '(sem h1)';");
    const erros = await browser.execute("return JSON.stringify({ erros: window.__erros || null, barra: document.getElementById('status').textContent });");
    throw new Error(
      `o documento ativo não virou ${nome}: era ${await caminhoAtivo()}, h1 "${String(h1)}", abas ${JSON.stringify(await abas())}, ${String(erros)}`,
    );
  }
}

export interface Aba {
  nome: string;
  ativa: boolean;
}

/** Abas na ordem da barra: nome do arquivo (do `title`, que é o caminho) e se é a selecionada. */
export async function abas(): Promise<Aba[]> {
  return (await browser.execute(
    "return Array.from(document.querySelectorAll('#tabs [role=tab]')).map(function (t) {" +
      "var p = (t.title || '').replace(/\\\\/g, '/');" +
      "return { nome: p.split('/').pop(), ativa: t.getAttribute('aria-selected') === 'true' };" +
      "});",
  )) as Aba[];
}

/** Espera a lista de abas (por nome de arquivo, em ordem) e, se dada, qual está ativa. */
export async function esperarAbas(nomes: string[], ativa?: string): Promise<void> {
  let ultima: Aba[] = [];
  try {
    await browser.waitUntil(async () => {
      ultima = await abas();
      if (JSON.stringify(ultima.map((a) => a.nome)) !== JSON.stringify(nomes)) return false;
      return ativa === undefined || ultima.find((a) => a.ativa)?.nome === ativa;
    });
  } catch (e) {
    const doc = await caminhoAtivo().catch(() => "?");
    const salvo = await browser.execute("return localStorage.getItem('leve.tabs');").catch(() => "?");
    throw new Error(
      `abas esperadas ${JSON.stringify(nomes)} (ativa ${ativa ?? "qualquer"}), vistas ${JSON.stringify(ultima)}; documento ativo ${doc}; leve.tabs ${String(salvo)}; ${String(e)}`,
    );
  }
}

/**
 * Clica no nome da aba `i` (não no botão de fechar). A barra é refeita a cada mudança de aba, então o
 * elemento pode envelhecer entre achar e clicar: tenta de novo.
 */
async function clicarNomeDaAba(i: number): Promise<void> {
  await browser.waitUntil(
    async () => {
      try {
        await (await $$("#tabs [role=tab]"))[i].$(".tab-name").click();
        return true;
      } catch {
        return false;
      }
    },
    { timeoutMsg: `não consegui clicar na aba ${i}` },
  );
}

/** Clica na aba de índice `i` e espera ela ficar ativa. */
export async function ativarAba(i: number): Promise<void> {
  await clicarNomeDaAba(i);
  await browser.waitUntil(async () => (await abas())[i]?.ativa === true, { timeoutMsg: `a aba ${i} não ficou ativa` });
}

/**
 * Deixa só a aba do exemplo: as sessões dos roteiros compartilham o perfil, e as abas que um deixa
 * (`leve.tabs`) voltariam no seguinte. Aba de arquivo que já não existe se fecha sozinha ao ativar.
 */
export async function fecharAbasExtras(): Promise<void> {
  for (let volta = 0; volta < 10; volta++) {
    const lista = await abas();
    const i = lista.findIndex((a) => a.nome !== "exemplo.md");
    if (i < 0) break;
    await ativarAbaOuSumir(i, lista.length);
    if ((await abas()).length === lista.length) {
      await acionarMenu("close-tab");
      await browser.waitUntil(async () => (await abas()).length < lista.length, { timeoutMsg: "a aba não fechou" });
    }
  }
  const lista = await abas();
  const i = lista.findIndex((a) => a.nome === "exemplo.md");
  if (i >= 0 && !lista[i].ativa) await ativarAba(i);
}

async function ativarAbaOuSumir(i: number, total: number): Promise<void> {
  await clicarNomeDaAba(i);
  await browser.waitUntil(async () => {
    const l = await abas();
    return l.length < total || l[i]?.ativa === true;
  });
}

/** Pasta de dados do app (`app_local_data_dir`), onde fica o `grants.json`, pela API de caminhos do Tauri. */
export async function pastaDadosDoApp(): Promise<string> {
  const r = (await browser.executeAsyncScript(
    "var feito = arguments[arguments.length - 1];" +
      // 15 = BaseDirectory.AppLocalData. `core:default` já permite `resolve_directory`.
      "window.__TAURI_INTERNALS__.invoke('plugin:path|resolve_directory', { directory: 15 })" +
      ".then(feito, function (e) { feito({ erro: String(e) }); });",
    [],
  )) as string | { erro: string };
  if (typeof r !== "string") throw new Error(`resolve_directory: ${r.erro}`);
  return r;
}

/**
 * Concede uma pasta como dado do perfil de teste: acrescenta a raiz (forma canônica, a que o Rust
 * devolve) ao `grants.json`. O Rust lê o arquivo só ao iniciar, então vale na próxima sessão
 * (`browser.reloadSession()`). É o que o diálogo `pick_folder` grava; o WebDriver não alcança o diálogo.
 */
export async function concederPasta(raiz: string): Promise<void> {
  const dados = await pastaDadosDoApp();
  mkdirSync(dados, { recursive: true });
  const arquivo = join(dados, "grants.json");
  let lista: string[] = [];
  try {
    const lido: unknown = JSON.parse(readFileSync(arquivo, "utf8"));
    if (Array.isArray(lido)) lista = lido.filter((p): p is string => typeof p === "string");
  } catch {
    // sem arquivo ainda
  }
  if (!lista.includes(raiz)) lista.push(raiz);
  writeFileSync(arquivo, JSON.stringify(lista));
}

/** Guarda em `window.__erros` o que a página deixaria passar (rejeição sem tratamento, erro de script), para o diagnóstico. */
export async function vigiarErrosDaPagina(): Promise<void> {
  await browser.execute(
    "window.__erros = [];" +
      "window.addEventListener('unhandledrejection', function (e) { window.__erros.push('rejeicao: ' + String(e.reason)); });" +
      "window.addEventListener('error', function (e) { window.__erros.push('erro: ' + e.message); });" +
      // Rastro dos comandos que o app chama, na ordem, com o arquivo quando há.
      "var invoke = window.__TAURI_INTERNALS__.invoke;" +
      "window.__TAURI_INTERNALS__.invoke = function (cmd, args) {" +
      "if (!/^plugin:/.test(cmd)) window.__erros.push('invoke ' + cmd + ' ' + String((args && (args.path || args.rel)) || ''));" +
      "return invoke.apply(this, arguments); };",
  );
}
