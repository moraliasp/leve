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

/** Nome e pasta para exibir: `/a/b/c.md` → `c.md` e `/a/b/`; pasta (`/a/b/`) → `b` e `/a/`. */
export function splitPath(p: string): { name: string; dir: string } {
  const bare = p.replace(/[\\/]+$/, "");
  const name = bare.split(/[\\/]/).pop() ?? bare;
  return { name, dir: bare.slice(0, bare.length - name.length) };
}

/**
 * Pasta aberta entra nos Recentes com o separador no fim (`/a/docs/`), na mesma lista e ordem dos
 * arquivos; versão antiga do app tenta abrir como arquivo e o Rust recusa, sem estrago.
 */
export const folderEntry = (root: string): string => (/[\\/]$/.test(root) ? root : `${root}${root.includes("\\") ? "\\" : "/"}`);
export const isFolderEntry = (p: string): boolean => /[\\/]$/.test(p);
