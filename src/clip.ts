/**
 * Documento colado (Arquivo › Abrir da área de transferência): mesmo molde do exemplo
 * (src/sample.ts), um documento em memória com caminho sintético `clip:<n>`. O texto fica aqui,
 * lido por `readDoc` sem o Rust; não tem pasta, vigia, Recentes, `leve.scroll` nem `leve.tabs`.
 * Salvar (`save_markdown` no Rust) troca o caminho sintético pelo arquivo escolhido. O fluxo de
 * abrir e salvar fica em src/clip-ui.ts, importado sob demanda. Por quê: docs/decisoes.md.
 */
import { isSample } from "./sample";

export const CLIP_SCHEME = "clip:";

export const isClip = (path: string): boolean => path.startsWith(CLIP_SCHEME);

/** Documento que não é arquivo (exemplo ou colado): fora de Recentes, vigia, `leve.scroll` e `leve.tabs`. */
export const inMemory = (path: string): boolean => isSample(path) || isClip(path);

const texts = new Map<string, string>();
let seq = 0;

/** Guarda o texto colado e devolve o caminho novo (`clip:1`, `clip:2`…; nunca se repete na sessão). */
export function addClip(text: string): string {
  const path = `${CLIP_SCHEME}${++seq}`;
  texts.set(path, text);
  return path;
}

export const clipText = (path: string): string | undefined => texts.get(path);

/** Fechar a aba ou salvar descarta o texto. */
export const dropClip = (path: string): void => void texts.delete(path);

/** "Sem título", "Sem título 2"…: abas coladas lado a lado se distinguem. */
export function clipName(path: string, base: string): string {
  const n = Number(path.slice(CLIP_SCHEME.length));
  return n > 1 ? `${base} ${n}` : base;
}
