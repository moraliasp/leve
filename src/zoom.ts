/**
 * Zoom do documento (`leve.zoom`): decisão pura; aplicar e gravar é efeito de `main.ts`.
 * Passo de 10 %, arredondado para o número não acumular erro de ponto flutuante.
 */

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.5;

/** Valor salvo; ausente, zero ou lixo é 100 %. */
export function parseZoom(raw: string | null): number {
  return Number(raw ?? "1") || 1;
}

/** Só o limite do lado do passo: um valor salvo fora da faixa volta aos poucos, sem salto. */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const next = Math.round((zoom + dir * 0.1) * 10) / 10;
  return dir > 0 ? Math.min(ZOOM_MAX, next) : Math.max(ZOOM_MIN, next);
}

export function zoomLabel(zoom: number): string {
  return `${Math.round(zoom * 100)} %`;
}
