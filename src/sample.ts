/**
 * Documento de exemplo: um primer de Markdown que também mostra o que o Leve renderiza. Abre na
 * abertura direta do app (ícone, Dock, menu Iniciar) quando não há abas a restaurar, e a qualquer
 * momento por Ajuda › Documento de exemplo. Por quê e como: docs/decisoes.md, "Documento de exemplo".
 *
 * É um documento em memória, nunca um arquivo: o texto vem do bundle (`?raw`, importado sob
 * demanda para não pesar no chunk de abertura), com caminho sintético `sample:<idioma>`. Não lê
 * nem concede nada no Rust, não tem vigia, não entra nos Recentes, nos pontos de leitura nem em
 * `leve.tabs`.
 */
import type { Lang } from "./i18n";

export const SAMPLE_SCHEME = "sample:";

export const samplePath = (l: Lang): string => `${SAMPLE_SCHEME}${l}`;

export const isSample = (path: string): boolean => path.startsWith(SAMPLE_SCHEME);

/** Texto do exemplo no idioma do caminho (`sample:en` → inglês; o resto, português). */
export async function sampleText(path: string): Promise<string> {
  const m = path === samplePath("en") ? await import("./sample/en.md?raw") : await import("./sample/pt-BR.md?raw");
  return m.default;
}

/** Marca de sessão (sessionStorage sobrevive à recarga da página, não ao fechar o app). */
export const SESSION_KEY = "leve.session";
/** Estado do exemplo no momento da recarga: "active" (aba ativa), "open" (aba aberta) ou ausente. */
export const SAMPLE_SESSION_KEY = "leve.sampleTab";

export interface LaunchFacts {
  /** Chegou um arquivo pelo SO (argv, duplo-clique) ou por `?file=` no navegador. */
  fileArrived: boolean;
  /** Alguma aba salva abriu de fato (lida e com concessão válida). */
  restoredTabs: boolean;
  /** Preferência "Mostrar documento de exemplo ao abrir". */
  prefOn: boolean;
  /** A página recarregou (troca de idioma), não é uma abertura do app. */
  reload: boolean;
  /** Na recarga: o exemplo estava aberto antes. */
  sampleWasOpen: boolean;
}

/**
 * Aba do exemplo a fechar quando um arquivo chega do SO depois da abertura: só a aba marcada na
 * abertura direta (`auto`, ainda intocada), se for de fato `sample:*` e a única aberta.
 */
export function sampleToReplace<T extends { path: string }>(tabs: readonly T[], auto: T | null): T | null {
  return auto !== null && tabs.length === 1 && tabs[0] === auto && isSample(auto.path) ? auto : null;
}

/**
 * Abre o exemplo? Arquivo pedido sempre vence. Recarga da página só devolve o exemplo se ele já
 * estava aberto (no idioma novo). Abertura direta mostra o exemplo com a preferência ligada e
 * nenhuma aba restaurada.
 */
export function sampleOnLaunch(f: LaunchFacts): boolean {
  if (f.fileArrived) return false;
  if (f.reload) return f.sampleWasOpen;
  return f.prefOn && !f.restoredTabs;
}
