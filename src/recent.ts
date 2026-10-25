/**
 * Recentes e pontos de leitura em localStorage (`leve.recent`, `leve.scroll`). Só lista o que o
 * leitor abriu; apagar daqui não tira a concessão de leitura do Rust (`grants.json`), que continua
 * valendo para as abas salvas.
 */

import { readJson } from "./prefs";

export const RECENT_KEY = "leve.recent";
export const SCROLL_KEY = "leve.scroll";
/** Quantos ficam na lista do estado vazio. */
export const RECENT_MAX = 12;

export function readRecent(): string[] {
  const v = readJson<unknown>(RECENT_KEY, []);
  return Array.isArray(v) ? v.filter((p): p is string => typeof p === "string") : [];
}

function writeRecent(list: string[]): void {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
}

/** Põe no topo; sem repetição. */
export function addRecent(path: string): void {
  writeRecent([path, ...readRecent().filter((p) => p !== path)]);
}

/** Tira um item e o ponto de leitura dele. */
export function removeRecent(path: string): void {
  writeRecent(readRecent().filter((p) => p !== path));
  const scroll = readJson<Record<string, unknown>>(SCROLL_KEY, {});
  if (scroll && typeof scroll === "object" && path in scroll) {
    delete scroll[path];
    localStorage.setItem(SCROLL_KEY, JSON.stringify(scroll));
  }
}

/** Apaga a lista e todos os pontos de leitura guardados. */
export function clearRecent(): void {
  localStorage.removeItem(RECENT_KEY);
  localStorage.removeItem(SCROLL_KEY);
}

/** Nome e pasta para exibir: `/a/b/c.md` → `c.md` e `/a/b/`. */
export function splitPath(p: string): { name: string; dir: string } {
  const name = p.split(/[\\/]/).pop() ?? p;
  return { name, dir: p.slice(0, p.length - name.length) };
}
