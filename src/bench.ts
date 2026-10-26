import { invoke } from "@tauri-apps/api/core";

// Gancho de benchmark (`scripts/bench.mjs`, método em docs/benchmark.md). Só o app aberto com
// `LEVE_BENCH=1` tem `window.__LEVE_BENCH__` (plugin `bench` em lib.rs); sem ela, `reportPainted`
// é uma leitura de propriedade e mais nada.

declare global {
  interface Window {
    __LEVE_BENCH__?: boolean;
  }
}

export const BENCH_MEASURES = ["leve:render", "leve:dom", "leve:layout"] as const;

export interface BenchMeasure {
  name: string;
  /** Duração da medida. */
  ms: number;
  /** Fim da medida desde o início da página (`startTime + duration`). */
  end: number;
}

/** Última entrada de cada nome pedido, na ordem pedida: o `performance` acumula uma por documento. */
export function lastMeasures(entries: readonly { name: string; startTime: number; duration: number }[], names: readonly string[]): BenchMeasure[] {
  const out: BenchMeasure[] = [];
  for (const name of names) {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].name === name) {
        out.push({ name, ms: entries[i].duration, end: entries[i].startTime + entries[i].duration });
        break;
      }
    }
  }
  return out;
}

/**
 * Duas linhas por documento: `layout` na hora (o `loadDoc` acabou de medir `leve:layout`, com o
 * layout já calculado) e `paint` no primeiro quadro depois disso (rAF e uma volta de tarefa). O
 * WebKit não dá quadro a janela coberta por outras, então `paint` pode demorar ou não vir; o
 * `bench.mjs` usa `layout` como marco e `paint` só quando chega.
 */
export function reportPainted(path: string): void {
  if (!window.__LEVE_BENCH__) return;
  const send = (phase: "layout" | "paint") => {
    const measures = lastMeasures(performance.getEntriesByType("measure"), BENCH_MEASURES);
    invoke("bench_report", { doc: path, phase, pageMs: performance.now(), measures }).catch((e) => console.warn("bench:", e));
  };
  send("layout");
  requestAnimationFrame(() => setTimeout(() => send("paint"), 0));
}
