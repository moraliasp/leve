import mdLight from "github-markdown-css/github-markdown-light.css?inline";
import mdDark from "github-markdown-css/github-markdown-dark.css?inline";
import hlLight from "highlight.js/styles/github.css?inline";
import hlDark from "highlight.js/styles/github-dark.css?inline";

import { PREF_KEYS } from "./prefs";

/** Tema claro do documento (GitHub + realce), também embutido pelo Exportar HTML (src/export-css.ts). */
export const LIGHT_DOC_CSS = { markdown: mdLight, highlight: hlLight } as const;

export type ThemeMode = "auto" | "light" | "dark";

const KEY = PREF_KEYS.theme;
const mq = matchMedia("(prefers-color-scheme: dark)");
const styleEl = document.createElement("style");
styleEl.id = "theme-css";
document.head.appendChild(styleEl);

let mode: ThemeMode = (localStorage.getItem(KEY) as ThemeMode | null) ?? "auto";
const listeners = new Set<(dark: boolean) => void>();

export function getMode(): ThemeMode {
  return mode;
}

export function isDark(): boolean {
  return mode === "dark" || (mode === "auto" && mq.matches);
}

export function apply(): void {
  const dark = isDark();
  styleEl.textContent = dark ? mdDark + hlDark : mdLight + hlLight;
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
