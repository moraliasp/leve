import { spawn } from "node:child_process";
import { browser, $ } from "@wdio/globals";
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
