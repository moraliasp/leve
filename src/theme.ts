import markdownCss from "./markdown.css?inline";

import { PREF_KEYS } from "./prefs";

/**
 * Base do documento (visual GitHub + realce) com os dois conjuntos de tokens: o tema só troca
 * `data-theme` no `<html>`. Também embutida pelo Exportar HTML (src/export-css.ts), que fica no claro
 * porque o arquivo não tem `data-theme`. Os estilos (src/doc-style.ts) entram depois, por cima.
 */
export const DOC_CSS = markdownCss;

export type ThemeMode = "auto" | "light" | "dark";

const KEY = PREF_KEYS.theme;
const mq = matchMedia("(prefers-color-scheme: dark)");
const styleEl = document.createElement("style");
styleEl.id = "theme-css";
styleEl.textContent = DOC_CSS;
document.head.appendChild(styleEl);

let mode: ThemeMode = (localStorage.getItem(KEY) as ThemeMode | null) ?? "auto";
const listeners = new Set<(dark: boolean) => void>();

export function getMode(): ThemeMode {
  return mode;
}

export function isDark(): boolean {
  return mode === "dark" || (mode === "auto" && mq.matches);
}

function apply(): void {
  const dark = isDark();
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  for (const l of listeners) l(dark);
}

/** Grava e aplica; a tela Preferências e o menu passam por aqui. */
export function setMode(m: ThemeMode): void {
  mode = m;
  localStorage.setItem(KEY, mode);
  apply();
}

export function cycle(): ThemeMode {
  setMode(mode === "auto" ? "light" : mode === "light" ? "dark" : "auto");
  return mode;
}

export function onChange(l: (dark: boolean) => void): void {
  listeners.add(l);
}

mq.addEventListener("change", () => {
  if (mode === "auto") apply();
});

apply();
