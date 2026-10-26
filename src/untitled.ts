/**
 * Documento não salvo (Arquivo › Abrir da área de transferência): vive só em memória, numa aba
 * cujo "caminho" é um id sintético `untitled:N`. Não tem pasta (links, imagens e wikilinks
 * relativos não resolvem), não tem vigia, não entra em Recentes, nas abas salvas nem no ponto de
 * leitura. Salvar (`save_markdown_as` no Rust) troca o id pelo caminho real escolhido no diálogo.
 */

export const UNTITLED_PREFIX = "untitled:";

export function untitledId(n: number): string {
  return `${UNTITLED_PREFIX}${n}`;
}

/** "Sem título", "Sem título 2"…: abas não salvas lado a lado se distinguem. */
export function untitledName(id: string, base: string): string {
  const n = Number(id.slice(UNTITLED_PREFIX.length));
  return Number.isInteger(n) && n > 1 ? `${base} ${n}` : base;
}

/** Caminho de aba que não existe em disco. */
export function isUntitled(path: string | null | undefined): boolean {
  return typeof path === "string" && path.startsWith(UNTITLED_PREFIX);
}

/** Texto lido da área de transferência que vira documento; vazio ou só espaço não vira. */
export function clipboardDoc(text: string | null | undefined): string | null {
  return typeof text === "string" && text.trim() !== "" ? text : null;
}

/** Abas que vão para `leve.tabs`: só as que existem em disco, com o índice da ativa entre elas. */
export function persistableTabs(paths: string[], activeIdx: number): { paths: string[]; active: number } {
  const kept = paths.filter((p) => !isUntitled(p));
  const activePath = paths[activeIdx];
  return { paths: kept, active: activePath === undefined ? -1 : kept.indexOf(activePath) };
}

/**
 * Depois de salvar: índice de outra aba que já mostra o arquivo salvo (sobrescreveu um documento
 * aberto), para focá-la em vez de duplicar; -1 se não houver.
 */
export function otherTabWith(paths: string[], selfIdx: number, path: string): number {
  return paths.findIndex((p, i) => i !== selfIdx && p === path);
}

/** Depois de salvar: o histórico da aba passa a apontar para o arquivo no lugar do id. */
export function replaceInHistory(hist: string[], from: string, to: string): string[] {
  return hist.map((p) => (p === from ? to : p));
}
