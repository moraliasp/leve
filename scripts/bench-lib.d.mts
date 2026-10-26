export interface Resumo {
  n: number;
  median: number;
  p90: number;
  min: number;
  max: number;
}
export function median(xs: number[]): number;
export function percentile(xs: number[], p: number): number;
export function summarize(xs: number[]): Resumo;
export function mulberry32(seed: number): () => number;
export function generateDoc(targetBytes: number, seed?: number): string;
export interface BenchLine {
  doc: string;
  runMs: number;
  epochMs: number;
  pageMs: number;
  measures: { name: string; ms: number }[];
}
export function parseBenchLine(line: string): BenchLine | null;
export interface Proc {
  pid: number;
  comm: string;
}
export type Kind = "app" | "WebContent" | "GPU" | "Networking";
export function parsePs(text: string): Proc[];
export function webkitKind(comm: string): Exclude<Kind, "app"> | null;
export function attribute(procs: Proc[], responsible: Map<number, number>, mainPid: number): (Proc & { kind: Kind })[];
export function parseFootprint(text: string): number;
export function mb(bytes: number, locale?: string): string;
