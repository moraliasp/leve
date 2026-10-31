/**
 * Abrir no editor e comando `leve` (Preferências › Integração). O frontend manda só id + caminho
 * concedido; o Rust monta o comando (`src-tauri/src/editor.rs`). A escolha do editor em si,
 * pura, está em `editor.ts`.
 */
import { invoke } from "@tauri-apps/api/core";
import { isClip } from "./clip";
import { confirmDialog } from "./dialog";
import { $ } from "./dom";
import { type EditorInfo, editablePath, editorOptions, editorPref } from "./editor";
import { t } from "./i18n";
import type { Platform } from "./shortcuts";

export interface EditorHost {
  tauri: boolean;
  platform: Platform;
  flash(msg: string, isError?: boolean, sticky?: boolean): void;
  /** Caminho do documento ativo, se houver. */
  currentPath(): string | null;
}

/** Lista vinda do Rust (`list_editors`), lida ao abrir as Preferências e antes de abrir no editor. */
let editors: EditorInfo[] = [];

export async function loadEditors(h: EditorHost): Promise<EditorInfo[]> {
  if (!h.tauri) return editors;
  try {
    editors = await invoke<EditorInfo[]>("list_editors");
  } catch (e) {
    h.flash(String(e), true);
  }
  return editors;
}

/** Arquivo › Abrir no editor: o documento ativo no editor escolhido. O Rust monta o comando. */
export async function openInEditor(h: EditorHost): Promise<void> {
  const current = h.currentPath();
  if (current === null) {
    h.flash(t("editor.noDoc"));
    return;
  }
  const path = editablePath(current);
  if (!path) {
    h.flash(isClip(current) ? t("clip.saveFirst") : t("editor.sample"));
    return;
  }
  if (!h.tauri) {
    h.flash(t("editor.browser"), true);
    return;
  }
  const id = editorPref();
  try {
    await invoke("open_in_editor", { editor: id, path });
    const name = editors.find((e) => e.id === id)?.name ?? (await loadEditors(h)).find((e) => e.id === id)?.name ?? id;
    h.flash(t("editor.opened", { name }));
  } catch (e) {
    h.flash(String(e), true);
  }
}

interface CliOutcome {
  status: "installed" | "needs-admin" | "cancelled";
  path?: string;
}

/** Leve › Instalar comando 'leve' (macOS): sem senha se der; senão pergunta antes de pedir a senha. */
export async function installCli(h: EditorHost): Promise<void> {
  if (!h.tauri || h.platform !== "mac") {
    h.flash(t("cli.pc"));
    return;
  }
  try {
    let out = await invoke<CliOutcome>("install_cli", { admin: false });
    if (out.status === "needs-admin") {
      const ok = await confirmDialog(t("cli.adminTitle"), t("cli.adminText", { path: out.path ?? "" }), t("cli.adminOk"));
      if (!ok) return;
      out = await invoke<CliOutcome>("install_cli", { admin: true });
    }
    if (out.status === "installed") h.flash(t("cli.installed", { path: out.path ?? "" }), false, true);
    else if (out.status === "cancelled") h.flash(t("cli.cancelled"));
  } catch (e) {
    h.flash(String(e), true);
  }
}

/** Preenche o seletor de editor com o que está instalado e o escolhido (mesmo se sumiu). */
export function renderEditorSelect(): void {
  const sel = $<HTMLSelectElement>("prefs-editor");
  const chosen = editorPref();
  const list = editors.length ? editors : [{ id: "system", name: t("prefs.editorSystem"), available: true, selfDefault: false } as EditorInfo];
  sel.replaceChildren(
    ...editorOptions(list, chosen).map((o) => {
      const opt = document.createElement("option");
      opt.value = o.id;
      // "Aplicativo padrão" indisponível é o caso do padrão ser o Leve: a dica abaixo explica.
      opt.textContent = o.missing && o.id !== "system" ? t("prefs.editorMissing", { name: o.name }) : o.name;
      return opt;
    }),
  );
  sel.value = chosen;
  const self = editors.find((e) => e.id === "system")?.selfDefault && chosen === "system";
  $("prefs-editor-hint").textContent = self ? t("prefs.editorSelf") : t("prefs.editorHint");
}
