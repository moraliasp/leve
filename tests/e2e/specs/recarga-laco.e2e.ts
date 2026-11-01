import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { browser } from "@wdio/globals";
import { acionarMenu, esperarDocumento } from "../helpers";
import { EXEMPLO } from "../paths";

// Regressão do laço de recarga no Linux (#107): o inotify avisa também a ABERTURA do arquivo, e o vigia
// tratava o aviso como mudança, então cada recarga (que lê o arquivo) pedia a próxima, a cada ~200 ms.
// O roteiro assina `file-changed` na página, recarrega por Arquivo › Recarregar (`reload`) e exige silêncio;
// depois escreve de verdade no arquivo aberto e exige o evento e o documento novo.
//
// O arquivo é o próprio `docs/exemplo.md`, o único que o app tem aberto e vigiado: no Linux não há como
// entregar outro arquivo a um app já aberto sem uma 2ª instância (o `helpers.ts` só faz isso no Windows).
// O texto original volta no `finally`.

const ESPERA_SILENCIO = 2_500;

/** Assina `file-changed` como o `listen` do frontend (`plugin:event|listen` + `transformCallback`). */
async function assinarFileChanged(): Promise<void> {
  await browser.execute(
    "window.__fileChanged = [];" +
      "var I = window.__TAURI_INTERNALS__;" +
      "var handler = I.transformCallback(function (e) { window.__fileChanged.push(e.payload); });" +
      "I.invoke('plugin:event|listen', { event: 'file-changed', target: { kind: 'Any' }, handler: handler });",
  );
  await browser.pause(500);
}

const eventos = (): Promise<string[]> => browser.execute("return window.__fileChanged.slice();") as Promise<string[]>;

const contem = (texto: string) => (): Promise<boolean> =>
  browser.execute("return document.getElementById('content').textContent.indexOf(arguments[0]) >= 0;", texto) as Promise<boolean>;

describe("recarga sem laço", () => {
  before(esperarDocumento);

  it("ler o arquivo na recarga não gera file-changed", async () => {
    await assinarFileChanged();
    // Marca o título atual: a recarga refaz o `innerHTML`, e a marca some junto.
    await browser.execute("document.querySelector('#content h1').setAttribute('data-e2e-marca', '1');");
    await acionarMenu("reload");
    await browser.waitUntil(
      () => browser.execute("return !document.querySelector('#content h1[data-e2e-marca]');") as Promise<boolean>,
      { timeoutMsg: "o documento não foi recarregado" },
    );
    await browser.pause(ESPERA_SILENCIO);
    expect(await eventos()).toEqual([]);
  });

  it("escrever no arquivo gera file-changed e recarrega, por escrita e por rename", async () => {
    const original = readFileSync(EXEMPLO);
    try {
      writeFileSync(EXEMPLO, `${original.toString("utf8")}\n\n## Recarga e2e por escrita\n`);
      await browser.waitUntil(contem("Recarga e2e por escrita"), { timeoutMsg: "a escrita não recarregou o documento" });
      expect((await eventos()).length).toBeGreaterThanOrEqual(1);

      // Editor que salva por rename: escreve ao lado e troca. O vigia observa a pasta, não o arquivo.
      const lateral = `${EXEMPLO}.e2e-novo`;
      writeFileSync(lateral, `${original.toString("utf8")}\n\n## Recarga e2e por rename\n`);
      renameSync(lateral, EXEMPLO);
      await browser.waitUntil(contem("Recarga e2e por rename"), { timeoutMsg: "o rename não recarregou o documento" });
    } finally {
      writeFileSync(EXEMPLO, original);
    }
    await browser.waitUntil(async () => !(await contem("Recarga e2e por")()), { timeoutMsg: "o documento não voltou ao original" });
  });
});
