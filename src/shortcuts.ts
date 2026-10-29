/**
 * Um mapa só de atalhos, escrito com os nomes neutros `Mod`, `Shift`, `Alt`, `Enter`, `Esc`, e
 * formatado por plataforma: no macOS viram ⌘ ⇧ ⌥ ↩ ⎋; no Windows e no Linux viram Ctrl+, Shift+,
 * Alt+, Enter, Esc. Tooltips (`data-shortcut` em index.html), rótulo das abas e a tela
 * Ajuda › Atalhos leem daqui. A lista espelha o menu nativo (`build_menu` em lib.rs): atalho
 * novo entra lá e aqui.
 */

import { t, type Key } from "./i18n";

export type Platform = "mac" | "windows" | "linux";

interface NavigatorLike {
  platform?: string;
  userAgent?: string;
  userAgentData?: { platform?: string };
}

/**
 * Primeira fonte que diz algo decide: `userAgentData.platform` (WebView2/Chromium), depois
 * `navigator.platform` (WebKit) e por fim o UA. Sem pista, Linux (rótulos por extenso).
 * `\bwin` e não `win`: "Darwin" tem "win" dentro.
 */
export function detectPlatform(nav: NavigatorLike = navigator): Platform {
  for (const hint of [nav.userAgentData?.platform, nav.platform, nav.userAgent]) {
    if (!hint) continue;
    if (/mac|iphone|ipad/i.test(hint)) return "mac";
    if (/\bwin/i.test(hint)) return "windows";
    return "linux";
  }
  return "linux";
}

const MAC: Record<string, string> = { Mod: "⌘", Shift: "⇧", Alt: "⌥", Enter: "↩", Esc: "Esc", Up: "↑", Down: "↓" };
const PC: Record<string, string> = { Mod: "Ctrl+", Shift: "Shift+", Alt: "Alt+", Enter: "Enter", Esc: "Esc", Up: "↑", Down: "↓" };

/** "Mod+Shift+L" → "⌘⇧L" ou "Ctrl+Shift+L". Vários atalhos separados por espaço duplo. */
export function formatKeys(spec: string, platform: Platform): string {
  const names = platform === "mac" ? MAC : PC;
  return spec
    .split("  ")
    .map((combo) => combo.split("+").map((k) => (k === "Click" ? t("keys.click") : names[k] ?? k)).join(""))
    .join("  ");
}

/** Ações do menu com atalho; `label` é a chave do texto da tela Atalhos (`src/i18n.ts`). */
export interface Shortcut {
  id: string;
  label: Key | ((p: Platform) => Key);
  keys: string;
}

export const SHORTCUTS: Shortcut[] = [
  { id: "open", label: "shortcuts.open", keys: "Mod+O" },
  { id: "open-folder", label: "shortcuts.openFolder", keys: "Mod+Shift+O" },
  { id: "reload", label: "shortcuts.reload", keys: "Mod+R" },
  // Mesmo texto do item de menu nativo ("Mostrar no Finder / Explorer"), por plataforma.
  { id: "reveal", label: (p) => (p === "mac" ? "shortcuts.revealMac" : p === "windows" ? "shortcuts.revealPc" : "shortcuts.revealLinux"), keys: "Mod+Shift+R" },
  { id: "open-in-editor", label: "shortcuts.openInEditor", keys: "Mod+E" },
  { id: "print", label: "shortcuts.print", keys: "Mod+P" },
  { id: "copy-rich", label: "shortcuts.copyRich", keys: "Mod+Shift+C" },
  { id: "find", label: "shortcuts.find", keys: "Mod+F" },
  { id: "toggle-toc", label: "shortcuts.toc", keys: "Mod+B" },
  { id: "toggle-tree", label: "shortcuts.tree", keys: "Mod+Shift+E" },
  { id: "changes", label: "shortcuts.changes", keys: "Mod+Shift+Down  Mod+Shift+Up" },
  { id: "cycle-theme", label: "shortcuts.theme", keys: "Mod+Shift+L" },
  { id: "zoom", label: "shortcuts.zoom", keys: "Mod+=  Mod+-  Mod+0" },
  { id: "nav", label: "shortcuts.nav", keys: "Mod+[  Mod+]" },
  { id: "tabs", label: "shortcuts.tabs", keys: "Mod+Shift+]  Mod+Shift+[" },
  { id: "close", label: "shortcuts.close", keys: "Mod+W  Mod+Shift+W" },
  { id: "link-new-tab", label: "shortcuts.linkNewTab", keys: "Mod+Click" },
  { id: "preferences", label: "shortcuts.preferences", keys: "Mod+," },
  { id: "shortcuts", label: "shortcuts.shortcuts", keys: "Mod+/" },
];

/** Atalhos de um controle só (tooltips), fora da lista principal ou com um pedaço dela. */
const TOOLTIP_KEYS: Record<string, string> = {
  back: "Mod+[",
  forward: "Mod+]",
  "close-tab": "Mod+W",
  "zoom-in": "Mod+=",
  "zoom-out": "Mod+-",
  "zoom-reset": "Mod+0",
  "find-prev": "Shift+Enter",
  "find-next": "Enter",
  "find-close": "Esc",
  "next-change": "Mod+Shift+Down",
  "prev-change": "Mod+Shift+Up",
};

/** Teclas formatadas de um id (tooltip), ou vazio se não houver. */
export function keysFor(id: string, platform: Platform): string {
  const spec = TOOLTIP_KEYS[id] ?? SHORTCUTS.find((s) => s.id === id)?.keys;
  return spec ? formatKeys(spec, platform) : "";
}

/** "Sumário" + id → "Sumário (⌘B)" / "Sumário (Ctrl+B)". */
export function tooltip(base: string, id: string, platform: Platform): string {
  const k = keysFor(id, platform);
  return k ? `${base} (${k})` : base;
}

/** Preenche `title` de todo `[data-shortcut]`: o texto base fica no próprio `title` do HTML. */
export function applyTooltips(root: ParentNode, platform: Platform): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-shortcut]")) {
    const base = el.dataset.tooltip ?? el.title;
    el.dataset.tooltip = base;
    el.title = tooltip(base, el.dataset.shortcut ?? "", platform);
  }
}

/** Pares (o quê, teclas) da tela Ajuda › Atalhos. */
export function shortcutRows(platform: Platform): [string, string][] {
  return SHORTCUTS.map((s) => [t(typeof s.label === "function" ? s.label(platform) : s.label), formatKeys(s.keys, platform)]);
}
