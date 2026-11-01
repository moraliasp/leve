import { browser, $ } from "@wdio/globals";

// Os scripts vão como texto: o wdio serializa a função, e o que o esbuild injeta num callback
// (`__name`) não existe dentro da página.

/** Espera o documento do argv aparecer: `#content` visível e com título renderizado. */
export async function esperarDocumento(): Promise<void> {
  await browser.waitUntil(
    () =>
      browser.execute(
        "var c = document.getElementById('content');" +
          "return !!c && !c.hidden && c.querySelectorAll('h1, h2').length > 0;",
      ),
    { timeout: 30_000, timeoutMsg: "o documento não apareceu em #content" },
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
