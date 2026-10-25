/**
 * Modo documento grande (docs/decisoes.md, "Modo documento grande"). Acima do limiar o documento
 * abre sem links automáticos, sem realce de código e com o sumário só até h2: são as partes que
 * multiplicam nós no DOM sem mudar o texto. O teto de leitura continua no Rust (`MAX_DOC_BYTES`).
 */
export const LARGE_DOC_BYTES = 2 * 1024 * 1024;

/** Nível mais fundo de título no sumário do modo grande. */
export const LARGE_TOC_MAX_LEVEL = 2;

/**
 * Texto acima de `LARGE_DOC_BYTES` em UTF-8. Cada unidade UTF-16 vale de 1 a 3 bytes em UTF-8
 * (par substituto: 2 unidades, 4 bytes), então só a faixa do meio precisa codificar.
 */
export function isLargeDoc(text: string): boolean {
  if (text.length > LARGE_DOC_BYTES) return true;
  if (text.length * 3 <= LARGE_DOC_BYTES) return false;
  return new TextEncoder().encode(text).length > LARGE_DOC_BYTES;
}
