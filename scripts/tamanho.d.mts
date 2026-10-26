export type Medida = "total" | "totalGzip" | "abertura" | "aberturaGzip" | "maior";
export type Orcamento = Partial<Record<Medida, number>>;
export const ORCAMENTO: Record<Medida, number>;
export function openingAssets(html: string): string[];
export function measure(dir: string): {
  values: Record<Medida, number>;
  opening: string[];
  largest: string;
  count: number;
};
export interface Linha {
  key: Medida;
  label: string;
  value: number;
  limit: number;
  over: number;
  ok: boolean;
}
export function check(values: Record<Medida, number>, budget?: Orcamento): Linha[];
export function report(rows: Linha[]): string;
