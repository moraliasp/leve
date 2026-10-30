/**
 * Estado das abas, sem efeito: sem DOM, sem `invoke`, sem localStorage. `main.ts` guarda a lista
 * (`tabs`) e a ativa (`active`), faz a leitura, o desenho e a gravação, e pergunta aqui o que muda:
 * onde entra a aba nova, qual fica ativa ao fechar, para onde vai o ciclo, o que o histórico faz e
 * o que vai para `leve.tabs`. Por quê: docs/decisoes.md, "Estado das abas fora de main.ts".
 *
 * As funções mexem na lista e na aba recebidas (como o código fazia em `main.ts`); devolvem só a
 * decisão que `main.ts` precisa para agir.
 */
import { inMemory } from "./clip";
import type { ScrollAnchor } from "./scroll";

export interface Tab {
  id: number;
  path: string;
  name: string;
  hist: string[];
  histIdx: number;
  /** Ponto de leitura ao sair da aba; reaplicado ao voltar. */
  anchor: ScrollAnchor | null;
}

/** Fábrica com id sequencial (1, 2, 3…): o id vira `tab-<id>` no DOM e nunca se repete na sessão. */
export function tabFactory(): (path: string, name: string) => Tab {
  let seq = 0;
  return (path, name) => ({ id: ++seq, path, name, hist: [path], histIdx: 0, anchor: null });
}

/** Insere logo depois da ativa (`afterActive`, sem ativa = no fim) ou no fim. */
export function insertTab(tabs: Tab[], tab: Tab, active: Tab | null, afterActive = true): void {
  const at = afterActive && active ? tabs.indexOf(active) + 1 : tabs.length;
  tabs.splice(at, 0, tab);
}

/** Aba já aberta com esse caminho ("abrir em nova ou focar a existente"). */
export function findTab(tabs: readonly Tab[], path: string): Tab | undefined {
  return tabs.find((t) => t.path === path);
}

/**
 * Tira a aba da lista. `null`: ela não estava lá (nada a fazer). Senão `next` é quem fica ativa:
 * a própria ativa se a fechada era outra; se era a ativa, a vizinha da direita, ou a da esquerda
 * quando era a última; `null` quando era a única (estado vazio).
 */
export function removeTab(tabs: Tab[], tab: Tab, active: Tab | null): { next: Tab | null } | null {
  const i = tabs.indexOf(tab);
  if (i < 0) return null;
  tabs.splice(i, 1);
  if (tab !== active) return { next: active };
  return { next: tabs[i] ?? tabs[i - 1] ?? null };
}

/** Aba ±`delta` com volta nas pontas; `null` sem ativa ou com menos de duas abas. */
export function cycleTarget(tabs: readonly Tab[], active: Tab | null, delta: number): Tab | null {
  if (!active || tabs.length < 2) return null;
  return tabs[(tabs.indexOf(active) + delta + tabs.length) % tabs.length];
}

// ---------- histórico (voltar/avançar) ----------

export const canGoBack = (t: Tab | null): boolean => Boolean(t && t.histIdx > 0);
export const canGoForward = (t: Tab | null): boolean => Boolean(t && t.histIdx < t.hist.length - 1);

/** Passo no histórico: move `histIdx` e devolve o caminho a abrir, ou `null` fora dos limites. */
export function stepHistory(t: Tab, delta: number): string | null {
  const i = t.histIdx + delta;
  if (i < 0 || i >= t.hist.length) return null;
  t.histIdx = i;
  return t.hist[i];
}

/**
 * Documento aberto na aba. Com `push`, entra no histórico depois da posição atual e descarta o
 * "avançar"; sem `push` (voltar/avançar, troca de aba, recarga) o histórico fica como está. O
 * caminho e o nome passam a ser os do documento lido, e a âncora guardada já foi consumida.
 */
export function commitDoc(t: Tab, path: string, name: string, push: boolean): void {
  if (push) {
    t.hist.splice(t.histIdx + 1);
    t.hist.push(path);
    t.histIdx = t.hist.length - 1;
  }
  t.path = path;
  t.name = name;
  t.anchor = null;
}

/**
 * O documento colado `from` foi salvo em `to`. Se outra aba já mostra `to` (salvou por cima de um
 * arquivo aberto), devolve essa aba: ela é focada e a colada sai, para o arquivo não ficar em duas
 * abas. Senão a própria aba passa a ser do arquivo, no caminho, no nome e no histórico.
 */
export function adoptSaved(tabs: readonly Tab[], tab: Tab, from: string, to: string, name: string): Tab | null {
  const other = tabs.find((t) => t !== tab && t.path === to);
  if (other) return other;
  tab.hist = tab.hist.map((p) => (p === from ? to : p));
  if (tab.path === from) {
    tab.path = to;
    tab.name = name;
  }
  return null;
}

// ---------- `leve.tabs` ----------

export interface SavedTabs {
  paths: string[];
  active: number;
}

/**
 * O que vai para `leve.tabs`: `{"paths":[...],"active":n}`, só com abas de arquivo. O exemplo
 * (`sample:*`) e o documento colado (`clip:*`) não são arquivo e ficam de fora; `active` é o
 * índice da ativa entre as que ficaram (-1 sem ativa ou com um deles ativo).
 */
export function serializeTabs(tabs: readonly Tab[], active: Tab | null): string {
  const files = tabs.filter((t) => !inMemory(t.path));
  return JSON.stringify({ paths: files.map((t) => t.path), active: active ? files.indexOf(active) : -1 });
}

/** Lê o que `leve.tabs` guardou, tolerante a lixo: só caminhos de texto, ativa numérica (senão 0). */
export function parseSavedTabs(saved: unknown): SavedTabs {
  const s = (typeof saved === "object" && saved !== null ? saved : {}) as { paths?: unknown; active?: unknown };
  const paths = Array.isArray(s.paths) ? s.paths.filter((p): p is string => typeof p === "string") : [];
  return { paths, active: typeof s.active === "number" ? s.active : 0 };
}

/**
 * Abas salvas voltam no fim da lista, sem repetir caminho já aberto; devolve a que deve ser
 * ativada (a salva como ativa, ou a primeira) ou `null` sem abas.
 */
export function restoreSaved(tabs: Tab[], saved: SavedTabs, make: (path: string) => Tab): Tab | null {
  for (const p of saved.paths) if (!findTab(tabs, p)) insertTab(tabs, make(p), null, false);
  return tabs[saved.active] ?? tabs[0] ?? null;
}
