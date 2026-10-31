/**
 * Tela Preferências (`#prefs`, Mod+,), importada sob demanda: lê e escreve as mesmas chaves e chama as mesmas ações do
 * menu. Não guarda estado: `syncPrefsUI` só reflete, ao abrir e depois de cada ação. O que mora em
 * `main.ts` (leitura, tema, abas, Sobre, atualização) vem pelo `PrefsHost`.
 */
import { invoke } from "@tauri-apps/api/core";
import { confirmDialog } from "./dialog";
import type { DocStyle } from "./doc-style";
import { $ } from "./dom";
import { isEditorId, setEditorPref } from "./editor";
import { type EditorHost, installCli, loadEditors, renderEditorSelect } from "./editor-ui";
import { detectLang, lang, langPref, setLangPref, t, type LangPref } from "./i18n";
import { type Toggle, isOn, resetPrefs, setOn } from "./prefs";
import { clearRecent } from "./recent";
import { type RecentHost, askClearRecent, renderRecent } from "./recent-ui";
import * as theme from "./theme";
import { zoomLabel } from "./zoom";

export interface PrefsHost extends RecentHost, EditorHost {
  reading(): { style: DocStyle; font: string; width: string; zoom: number };
  /** A ação do menu, sem reler a tela (quem chama relê). */
  action(id: string): void;
  /** A ação do menu e a tela relida. */
  runAction(id: string): void;
  setTheme(mode: theme.ThemeMode): void;
  setTocVisible(on: boolean): void;
  /** Reaplica os padrões ao que está em memória. */
  resetView(): void;
  /** O que continua concedido em "Esquecer arquivos autorizados": abas abertas e pasta do painel. */
  keepPaths(): string[];
  saveTabs(): void;
  dailyCheck(): void;
  openShortcuts(): void;
  openAbout(): void;
  checkUpdates(): void;
}

/**
 * Interruptores da tela: `name` do `<input>` (o id é `prefs-<name>`) → preferência. Sem `set`,
 * ligar e desligar só grava; com `set`, a ação de sempre grava e aplica.
 */
const SWITCHES: Record<string, { pref: Toggle; set?: (h: PrefsHost, on: boolean) => void }> = {
  toc: { pref: "toc", set: (h, on) => h.setTocVisible(on) },
  "restore-scroll": { pref: "restoreScroll" },
  "restore-tabs": { pref: "restoreTabs" },
  sample: { pref: "sample" },
  remote: { pref: "remote", set: (h, on) => on !== isOn("remote") && h.action("remote-auto") },
  hidden: { pref: "showHidden", set: (h, on) => on !== isOn("showHidden") && h.action("show-hidden") },
  "auto-update": {
    pref: "autoUpdate",
    set: (h, on) => {
      setOn("autoUpdate", on);
      if (on) h.dailyCheck();
    },
  },
};

/** Este módulo vem na primeira abertura da tela, e os controles se ligam nela. */
let wired = false;

/** Lê o estado vivo para os controles da tela; chamada ao abrir e depois de cada ação. */
export function syncPrefsUI(h: PrefsHost): void {
  const dlg = $<HTMLDialogElement>("prefs");
  if (!dlg.open) return;
  const choose = (name: string, value: string): void => {
    for (const r of dlg.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)) r.checked = r.value === value;
  };
  const { style, font, width, zoom } = h.reading();
  choose("theme", theme.getMode());
  choose("style", style);
  choose("font", font);
  choose("width", width);
  $("prefs-zoom-value").textContent = zoomLabel(zoom);
  for (const [name, { pref }] of Object.entries(SWITCHES)) $<HTMLInputElement>(`prefs-${name}`).checked = isOn(pref);
  choose("lang", langPref());
  renderEditorSelect();
}

/**
 * Troca de idioma recarrega a página: todo texto (inclusive o do documento renderizado, como
 * títulos de alerta) sai de novo no idioma novo, e o menu nativo acompanha por `set_locale`.
 * As abas e o ponto de leitura voltam pelo `beforeunload`.
 */
function changeLang(p: LangPref): void {
  const before = lang();
  setLangPref(p);
  const next = p === "auto" ? detectLang(navigator.languages) : p;
  if (next !== before) location.reload();
}

export function openPreferences(h: PrefsHost): void {
  if (!wired) {
    wired = true;
    wirePreferences(h);
  }
  const dlg = $<HTMLDialogElement>("prefs");
  const first = !dlg.open;
  if (first) dlg.showModal();
  syncPrefsUI(h);
  // A detecção roda no Rust (LaunchServices, PATH); a lista chega depois e o seletor se refaz.
  if (first) void loadEditors(h).then(() => syncPrefsUI(h));
  // O diálogo foca o primeiro rádio na ordem do DOM; o foco vai para o que está marcado.
  if (first) dlg.querySelector<HTMLInputElement>('input[name="theme"]:checked')?.focus();
}

/** Apaga as chaves de preferência e reaplica os padrões; recentes e abas ficam. */
function resetPreferences(h: PrefsHost): void {
  const langBefore = langPref();
  resetPrefs();
  h.resetView();
  syncPrefsUI(h);
  h.flash(t("prefs.restored"));
  if (langBefore !== "auto") location.reload();
}

/**
 * Esquece as concessões de leitura do Rust (menos as abas abertas, que continuam funcionando),
 * os recentes e os pontos de leitura. A lista de abas salva já é só a das abas abertas.
 */
async function askForgetGrants(h: PrefsHost): Promise<void> {
  const ok = await confirmDialog(t("prefs.forgetTitle"), t("prefs.forgetText"), t("prefs.forgetOk"));
  if (!ok) return;
  if (h.tauri) {
    try {
      await invoke("forget_grants", { keep: h.keepPaths() });
    } catch (e) {
      h.flash(String(e), true);
      return;
    }
  }
  clearRecent();
  h.saveTabs();
  if (!h.hasDoc()) renderRecent(h);
  h.flash(t("prefs.forgotten"));
}

function wirePreferences(h: PrefsHost): void {
  const dlg = $<HTMLDialogElement>("prefs");
  dlg.addEventListener("change", (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLInputElement)) return;
    const sw = SWITCHES[el.name];
    switch (el.name) {
      case "theme":
        h.setTheme(el.value as theme.ThemeMode);
        break;
      case "style":
      case "font":
      case "width":
        h.action(`${el.name}-${el.value}`);
        break;
      case "lang":
        changeLang(el.value as LangPref);
        return;
      default:
        if (sw?.set) sw.set(h, el.checked);
        else if (sw) setOn(sw.pref, el.checked);
    }
    syncPrefsUI(h);
  });
  $<HTMLSelectElement>("prefs-editor").addEventListener("change", (ev) => {
    const v = (ev.target as HTMLSelectElement).value;
    if (isEditorId(v)) setEditorPref(v);
    syncPrefsUI(h);
  });
  $("prefs-cli-hint").textContent = h.platform === "mac" ? t("prefs.cliHintMac") : t("prefs.cliHintPc");
  $("prefs-cli-actions").hidden = h.platform !== "mac";
  $("prefs-cli-install").addEventListener("click", () => void installCli(h));
  $("prefs-zoom-out").addEventListener("click", () => h.runAction("zoom-out"));
  $("prefs-zoom-in").addEventListener("click", () => h.runAction("zoom-in"));
  $("prefs-zoom-reset").addEventListener("click", () => h.runAction("zoom-reset"));
  $("prefs-clear-recent").addEventListener("click", () => void askClearRecent(h));
  $("prefs-forget-grants").addEventListener("click", () => void askForgetGrants(h));
  // Abrem por cima da tela; Esc volta para ela.
  $("prefs-shortcuts").addEventListener("click", h.openShortcuts);
  $("prefs-about").addEventListener("click", h.openAbout);
  $("prefs-check-update").addEventListener("click", h.checkUpdates);
  $("prefs-reset").addEventListener("click", () => resetPreferences(h));
}
