/**
 * Preferências do app: uma chave de localStorage por preferência, listadas aqui. A tela
 * Preferências (Mod+,) e o menu Exibir leem e escrevem as mesmas chaves pelas mesmas ações
 * de `main.ts`; o menu nativo é só espelho (`sync_view_menu`/`sync_remote_menu` no Rust).
 * Recentes, pontos de leitura e abas (`src/recent.ts`, `leve.tabs`) não são preferências:
 * "Restaurar padrões" não toca neles. Por quê: docs/decisoes.md, "Preferências em localStorage".
 * Até a 0.2.0 as chaves eram `mdview.*`; `migrateLegacyKeys` as renomeia ao carregar este módulo.
 */
import type { ScrollAnchor } from "./scroll";

export const PREF_KEYS = {
  theme: "leve.theme",
  width: "leve.width",
  font: "leve.font",
  zoom: "leve.zoom",
  toc: "leve.toc",
  remote: "leve.remote",
  /** Reabrir no ponto de leitura guardado (desligado: sempre no topo). */
  restoreScroll: "leve.restoreScroll",
  /** Reabrir as abas da última sessão ao iniciar. */
  restoreTabs: "leve.restoreTabs",
  /** Idioma da interface ("pt-BR", "en"); ausente = o do sistema (`src/i18n.ts`). */
  lang: "leve.lang",
  /** Procurar atualização uma vez por dia (desligado por padrão: privacidade). */
  autoUpdate: "leve.autoUpdate",
} as const;

/** Chaves de dados que ficam fora de "Restaurar padrões". */
export const TABS_KEY = "leve.tabs";
const SCROLL_KEY = "leve.scroll";
/** Dica da primeira abertura já mostrada. */
export const TIP_KEY = "leve.tip";

const LEGACY_PREFIX = "mdview.";
const PREFIX = "leve.";

/**
 * Renomeia `mdview.*` (nome antigo do app, até a 0.2.0) para `leve.*`, sem perder preferências,
 * recentes, posições nem abas. Roda no carregamento deste módulo, que todo leitor de
 * localStorage importa, então nada lê antes da migração. Chave nova já gravada vence a antiga.
 */
export function migrateLegacyKeys(): void {
  const legacy: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(LEGACY_PREFIX)) legacy.push(k);
  }
  for (const old of legacy) {
    const key = PREFIX + old.slice(LEGACY_PREFIX.length);
    const v = localStorage.getItem(old);
    if (localStorage.getItem(key) === null && v !== null) localStorage.setItem(key, v);
    localStorage.removeItem(old);
  }
}

migrateLegacyKeys();

export function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}

/** Liga/desliga gravado como "1"/"0"; qualquer outra coisa (ausente, lixo) é o padrão. */
export function boolPref(key: string, fallback: boolean): boolean {
  const v = localStorage.getItem(key);
  return v === "1" ? true : v === "0" ? false : fallback;
}

export function setBoolPref(key: string, on: boolean): void {
  localStorage.setItem(key, on ? "1" : "0");
}

/** Apaga só as preferências; quem chama reaplica os padrões. */
export function resetPrefs(): void {
  for (const k of Object.values(PREF_KEYS)) localStorage.removeItem(k);
}

export const TOP: ScrollAnchor = { top: 0, index: 0, offset: 0 };

type ScrollStore = Record<string, ScrollAnchor | number>;

/** Ponto de leitura guardado do arquivo, ou o topo com "Restaurar posição de leitura" desligado. */
export function savedAnchor(path: string): ScrollAnchor {
  if (!boolPref(PREF_KEYS.restoreScroll, true)) return TOP;
  const v = readJson<ScrollStore>(SCROLL_KEY, {})[path];
  // Formato antigo: só o pixel.
  if (typeof v === "number") return { top: v, index: 0, offset: 0 };
  return v ?? TOP;
}

/** Abas da última sessão, ou nenhuma com "Reabrir abas ao iniciar" desligado. */
export function savedTabs(): { paths: string[]; active: number } {
  if (!boolPref(PREF_KEYS.restoreTabs, true)) return { paths: [], active: 0 };
  const saved = readJson<{ paths?: unknown; active?: unknown }>(TABS_KEY, {});
  const paths = Array.isArray(saved.paths) ? saved.paths.filter((p): p is string => typeof p === "string") : [];
  return { paths, active: typeof saved.active === "number" ? saved.active : 0 };
}
