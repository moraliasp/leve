import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { browser } from "@wdio/globals";
import type { Options } from "@wdio/types";

// Teste de ponta a ponta do Leve com tauri-driver + WebdriverIO (docs/decisoes.md, "Teste de ponta a
// ponta"). Roda em Windows e Linux; o tauri-driver não existe no macOS. O binário é o build debug sem
// bundle (`pnpm tauri build --debug --no-bundle`), com o documento de exemplo pelo argv.

const RAIZ = resolve(import.meta.dirname, "../..");
const WIN = process.platform === "win32";
const BINARIO = process.env.LEVE_BIN ?? join(RAIZ, "src-tauri", "target", "debug", WIN ? "leve.exe" : "leve");
const EXEMPLO = join(RAIZ, "docs", "exemplo.md");
const ARTEFATOS = join(import.meta.dirname, "artifacts");
const PORTA = 4444;

let driver: ChildProcess | undefined;
let perfil: string | undefined;

/**
 * Perfil descartável por rodada: o app lê e grava preferências, abas e concessões em disco, e o
 * teste não pode herdar (nem sujar) os de quem roda. O tauri-driver passa o próprio ambiente adiante,
 * até o app.
 * Linux: HOME e os XDG_*. Windows: APPDATA e LOCALAPPDATA (o WebView2 guarda o perfil em
 * `LOCALAPPDATA\br.com.moralia.leve`).
 */
function ambienteIsolado(dir: string): NodeJS.ProcessEnv {
  const sub = (nome: string): string => {
    const p = join(dir, nome);
    mkdirSync(p, { recursive: true });
    return p;
  };
  if (WIN) return { ...process.env, APPDATA: sub("appdata"), LOCALAPPDATA: sub("localappdata") };
  return {
    ...process.env,
    HOME: sub("home"),
    XDG_CONFIG_HOME: sub("config"),
    XDG_DATA_HOME: sub("data"),
    XDG_CACHE_HOME: sub("cache"),
  };
}

function portaAberta(): Promise<boolean> {
  return new Promise((ok) => {
    const s = connect(PORTA, "127.0.0.1");
    s.once("connect", () => (s.destroy(), ok(true)));
    s.once("error", () => (s.destroy(), ok(false)));
  });
}

async function esperarPorta(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (driver?.exitCode !== null && driver?.exitCode !== undefined) throw new Error(`tauri-driver saiu com código ${driver.exitCode}`);
    if (await portaAberta()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`tauri-driver não abriu a porta ${PORTA} em 30 s`);
}

function nomeDeArquivo(titulo: string): string {
  return titulo.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "teste";
}

export const config: Options.Testrunner & { capabilities: unknown[] } = {
  runner: "local",
  hostname: "127.0.0.1",
  port: PORTA,
  specs: ["./specs/**/*.e2e.ts"],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      // Sem BiDi: o WebKitWebDriver e o msedgedriver por trás do tauri-driver falam só o clássico.
      "wdio:enforceWebDriverClassic": true,
      "tauri:options": { application: BINARIO, args: [EXEMPLO] },
    },
  ],
  logLevel: "warn",
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: { ui: "bdd", timeout: 90_000 },
  waitforTimeout: 15_000,
  connectionRetryCount: 1,

  async onPrepare() {
    perfil = mkdtempSync(join(tmpdir(), "leve-e2e-"));
    mkdirSync(ARTEFATOS, { recursive: true });
    // Windows: o msedgedriver tem de ser o da versão do WebView2 (msedgedriver-tool, no workflow).
    const args = process.env.MSEDGEDRIVER ? ["--native-driver", process.env.MSEDGEDRIVER] : [];
    driver = spawn("tauri-driver", args, { env: ambienteIsolado(perfil), stdio: ["ignore", "inherit", "inherit"] });
    driver.once("error", (e) => console.error("tauri-driver:", e));
    await esperarPorta();
  },

  onComplete() {
    if (driver && driver.exitCode === null) driver.kill();
    driver = undefined;
    if (perfil) rmSync(perfil, { recursive: true, force: true, maxRetries: 3 });
    perfil = undefined;
  },

  // Na falha: captura de tela e o HTML do documento, para o artefato do workflow.
  async afterTest(test, _context, { passed }) {
    if (passed) return;
    const base = join(ARTEFATOS, `${process.platform}-${nomeDeArquivo(test.title)}`);
    try {
      await browser.saveScreenshot(`${base}.png`);
    } catch (e) {
      console.error("captura de tela falhou:", e);
    }
    try {
      const html = await browser.execute("var c = document.getElementById('content'); return c ? c.outerHTML : '(sem #content)';");
      writeFileSync(`${base}.content.html`, String(html));
    } catch (e) {
      console.error("HTML de #content falhou:", e);
    }
  },
};
