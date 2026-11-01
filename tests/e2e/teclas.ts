import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { browser } from "@wdio/globals";
import { SCRIPTS, WIN } from "./paths";

// Teclado do sistema (#100). O WebDriver entrega a tecla direto à página, sem passar pelo teclado do SO
// nem pelo menu nativo; quem manda a tecla aqui é um script do sistema (SendInput no Windows, xdotool
// no Linux), e o WebDriver só confere o efeito. Os scripts ficam em `scripts/e2e/`.

export type Layout = "us" | "abnt2";

let layoutAtual: Layout = "us";

/**
 * Roda o script do sistema e imprime o que ele disse (diagnóstico do foco e do layout, que vai para o
 * log do run). Falha do script falha o teste: tecla que não saiu não pode virar "nenhum evento".
 */
function sistema(acao: "foco" | "tecla" | "layout", arg = ""): void {
  const args = arg ? [acao, arg] : [acao];
  const [cmd, argv] = WIN
    ? ["powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", join(SCRIPTS, "teclas-windows.ps1"), ...args, ...(acao === "tecla" ? [layoutAtual] : [])]]
    : ["bash", [join(SCRIPTS, "teclas-linux.sh"), ...args]];
  const r = spawnSync(cmd, argv, { encoding: "utf8", timeout: 60_000 });
  const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (saida) console.log(`[${acao} ${arg}] ${saida}`);
  if (r.error || r.status !== 0) {
    throw new Error(`teclas (${acao} ${arg}) falhou: ${r.error?.message ?? `código ${r.status}`}\n${saida}`);
  }
}

/** Leva a janela do Leve para frente, com o foco do teclado nela (no Windows, com um clique real). */
export function focarJanela(): void {
  sistema("foco");
}

/**
 * Manda um acorde como um teclado físico: modificadores (`ctrl`, `shift`, `alt`, `altgr`) e uma tecla,
 * que é o caractere que o layout ativo produz (letra, `[`, `]`, `/`). Ex.: `ctrl+shift+]`, `altgr+w`, `[`.
 * Antes de mandar, os scripts garantem a janela em primeiro plano.
 */
export function teclas(acorde: string): void {
  sistema("tecla", acorde);
}

/** Liga o layout do teclado do sistema (`abnt2` = pt-BR ABNT2). Vale para as teclas seguintes. */
export function layout(l: Layout): void {
  sistema("layout", l);
  layoutAtual = l;
}

// Eventos `menu`: o que o menu nativo (ou o `accel.rs`, no Windows) emite quando um atalho dispara.
// Assinar o evento prova que a tecla chegou ao Rust e virou ação; o efeito no DOM prova o resto.

/** Passa a registrar em `window.__menu` cada evento `menu` recebido (o id da ação); chamar de novo só zera. */
export async function escutarMenu(): Promise<void> {
  await browser.execute(
    "if (window.__menu) { window.__menu.length = 0; return; }" +
      "var ti = window.__TAURI_INTERNALS__; window.__menu = [];" +
      "var cb = ti.transformCallback(function (e) { window.__menu.push(e.payload); });" +
      "ti.invoke('plugin:event|listen', { event: 'menu', target: { kind: 'Any' }, handler: cb });",
  );
}

export async function eventosMenu(): Promise<string[]> {
  return browser.execute("return window.__menu.slice();") as Promise<string[]>;
}

export async function limparEventos(): Promise<void> {
  await browser.execute("window.__menu.length = 0;");
}

/**
 * Espera exatamente estes eventos, na ordem, e confirma que nada mais chega logo depois (um atalho
 * que dispara duas vezes, ou além da ação esperada, falha aqui).
 */
export async function esperarEventos(esperado: string[]): Promise<void> {
  const igual = async (): Promise<boolean> => JSON.stringify(await eventosMenu()) === JSON.stringify(esperado);
  await browser.waitUntil(igual, {
    timeout: 8_000,
    timeoutMsg: `esperava os eventos de menu ${JSON.stringify(esperado)}`,
  });
  await browser.pause(500);
  const final = await eventosMenu();
  if (JSON.stringify(final) !== JSON.stringify(esperado)) {
    throw new Error(`eventos de menu ${JSON.stringify(final)}, esperava só ${JSON.stringify(esperado)}`);
  }
}

/** Confirma que nenhuma ação do menu disparou no intervalo. */
export async function esperarSemEventos(ms = 1_000): Promise<void> {
  await browser.pause(ms);
  const eventos = await eventosMenu();
  if (eventos.length > 0) throw new Error(`nenhuma ação do menu devia disparar, e vieram ${JSON.stringify(eventos)}`);
}
