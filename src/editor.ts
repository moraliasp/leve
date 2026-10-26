/**
 * Arquivo › Abrir no editor (Mod+E) e a escolha do editor nas Preferências. O frontend só
 * guarda e manda um id da lista fechada (`EDITOR_IDS`, espelho de `editor::Editor` em
 * `src-tauri/src/editor.rs`); quem acha o editor e monta o comando é o Rust (`open_in_editor`),
 * e o caminho que vai junto tem de estar concedido. Por quê: docs/decisoes.md, "Abrir no editor".
 */
import { PREF_KEYS } from "./prefs";
import { isSample } from "./sample";

export const EDITOR_IDS = ["system", "vscode", "cursor", "zed", "sublime", "text"] as const;
export type EditorId = (typeof EDITOR_IDS)[number];

/** O que `list_editors` devolve: nome já no idioma do app e se está instalado aqui. */
export interface EditorInfo {
  id: EditorId;
  name: string;
  available: boolean;
  /** Só "Aplicativo padrão": o padrão para .md é o próprio Leve (abrir voltaria para cá). */
  selfDefault: boolean;
}

export function isEditorId(v: unknown): v is EditorId {
  return typeof v === "string" && (EDITOR_IDS as readonly string[]).includes(v);
}

/** Editor escolhido; ausente ou lixo vale "Aplicativo padrão". */
export function editorPref(): EditorId {
  const v = localStorage.getItem(PREF_KEYS.editor);
  return isEditorId(v) ? v : "system";
}

export function setEditorPref(id: EditorId): void {
  localStorage.setItem(PREF_KEYS.editor, id);
}

/**
 * Opções do seletor: só o que está instalado, mais o escolhido mesmo que não esteja (para o
 * leitor ver o que está valendo e trocar). Indisponível sai marcado com `missing`.
 */
export function editorOptions(list: EditorInfo[], chosen: EditorId): { id: EditorId; name: string; missing: boolean }[] {
  return list
    .filter((e) => e.available || e.id === chosen)
    .map((e) => ({ id: e.id, name: e.name, missing: !e.available }));
}

/** Documento ativo que pode ir para um editor: arquivo em disco, nunca o exemplo em memória. */
export function editablePath(path: string | null | undefined): string | null {
  return path && !isSample(path) ? path : null;
}
