/**
 * Abrir da área de transferência e salvar o documento colado (src/clip.ts), importado sob demanda
 * pelas ações `open-clipboard` e `save` de `main.ts`. O clipboard é lido no Rust (`read_clipboard`),
 * só por esse comando do leitor; salvar abre o diálogo no Rust (`save_markdown`), que escreve só no
 * caminho escolhido ali e o concede. O frontend nunca passa destino.
 */
import { invoke } from "@tauri-apps/api/core";
import { addClip, clipText, dropClip, isClip } from "./clip";
import { t } from "./i18n";
import { adoptSaved, type Tab } from "./tabs";

/** O que `main.ts` empresta: abas e efeitos (abrir, reabrir, focar, fechar, avisar). */
export interface ClipHost {
  tauri: boolean;
  flash(msg: string, isError?: boolean): void;
  tabs(): readonly Tab[];
  active(): Tab | null;
  /** Abre em aba nova (`loadDoc(path, { target: "new" })`). */
  open(path: string): Promise<unknown>;
  /** Relê na aba ativa sem mexer no histórico nem na rolagem. */
  reopen(path: string): Promise<unknown>;
  activate(tab: Tab): Promise<void>;
  close(tab: Tab): Promise<void>;
  /** As anotações do colado seguem para o caminho salvo. */
  moved(from: { tab: Tab; path: string }, to: { tab: Tab; path: string }): void;
  renderTabs(): void;
}

/** Texto que vira documento; vazio ou só espaço não vira. */
export function pastedText(raw: string | null | undefined): string | null {
  return typeof raw === "string" && raw.trim() !== "" ? raw : null;
}

/** Arquivo › Abrir da área de transferência: o texto vira "Sem título" numa aba nova. */
export async function openClipboard(h: ClipHost): Promise<void> {
  let raw: string | null;
  try {
    // No navegador (prova manual), a Clipboard API do próprio navegador.
    raw = h.tauri ? await invoke<string | null>("read_clipboard") : await navigator.clipboard.readText();
  } catch (e) {
    // No app o erro vem do Rust (texto grande demais) e aparece; no navegador, permissão negada
    // ou conteúdo que não é texto dão o mesmo aviso do clipboard vazio.
    if (h.tauri) {
      h.flash(String(e), true);
      return;
    }
    raw = null;
  }
  const text = pastedText(raw);
  if (text === null) {
    h.flash(t("clip.empty"));
    return;
  }
  await h.open(addClip(text));
}

/** Diálogo de salvar aberto: um segundo pedido não abre outro. */
let saving = false;

/** Arquivo › Salvar… (só com o documento colado ativo): depois de salvo, é documento comum. */
export async function saveClip(h: ClipHost): Promise<void> {
  const tab = h.active();
  if (saving || !tab || !isClip(tab.path)) return;
  if (!h.tauri) {
    h.flash(t("clip.saveBrowser"), true);
    return;
  }
  const from = tab.path;
  const text = clipText(from);
  if (text === undefined) return;
  let saved: string | null;
  saving = true;
  try {
    saved = await invoke<string | null>("save_markdown", { text });
  } catch (e) {
    h.flash(String(e), true);
    return;
  } finally {
    saving = false;
  }
  if (!saved) return;
  const name = saved.split(/[\\/]/).pop() ?? saved;
  const other = adoptSaved(h.tabs(), tab, from, saved, name);
  dropClip(from);
  h.moved({ tab, path: from }, { tab: other ?? tab, path: saved });
  if (other) {
    await h.activate(other);
    await h.close(tab);
  } else if (tab === h.active()) {
    // Relê do disco na mesma aba: vigia, Recentes e título passam a valer.
    await h.reopen(saved);
  } else h.renderTabs();
  h.flash(t("clip.saved", { name }));
}
