// Funções puras do benchmark (`scripts/bench.mjs`): estatística, documento sintético determinístico
// e leitura das saídas de `ps`, `footprint` e do gancho `LEVE_BENCH`. Testadas em tests/bench.test.ts.

/** Mediana; lista vazia dá NaN. */
export function median(xs) {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Percentil pelo posto mais próximo (sem interpolar): sempre um valor que foi medido. */
export function percentile(xs, p) {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * s.length));
  return s[Math.min(rank, s.length) - 1];
}

export function summarize(xs) {
  return {
    n: xs.length,
    median: median(xs),
    p90: percentile(xs, 90),
    min: xs.length ? Math.min(...xs) : NaN,
    max: xs.length ? Math.max(...xs) : NaN,
  };
}

/** PRNG mulberry32: mesma semente, mesma sequência, em qualquer máquina. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = (
  "leve markdown documento texto leitura janela tabela lista código título seção parágrafo arquivo pasta " +
  "imagem link nota tema fonte largura rolagem âncora sumário busca recarga salvar abrir fechar aba menu " +
  "render realce bloco linha coluna valor nome tipo dado regra teste prova medida tempo memória tamanho"
).split(" ");

/**
 * Markdown sintético com a mistura de um documento técnico (como a bancada de `docs/decisoes.md`,
 * "Modo documento grande"): títulos h1 a h4, parágrafos com URL solta, listas, tabelas e ~10% de
 * blocos de código `ts`. Sem imagem, Mermaid nem matemática, que dependem de carga assíncrona e
 * mediriam outra coisa. Gera blocos até passar de `targetBytes` (UTF-8); o resultado fica um
 * pouco acima do alvo, nunca abaixo.
 */
export function generateDoc(targetBytes, seed = 1) {
  const rnd = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const words = (n) => Array.from({ length: n }, () => pick(WORDS)).join(" ");
  const sentence = () => {
    const w = words(int(6, 16));
    return w[0].toUpperCase() + w.slice(1) + ".";
  };
  const enc = new TextEncoder();
  const parts = [];
  let bytes = 0;
  let section = 0;
  const push = (s) => {
    parts.push(s);
    bytes += enc.encode(s).length;
  };
  while (bytes < targetBytes) {
    section++;
    const level = section % 12 === 1 ? 1 : int(2, 4);
    push(`${"#".repeat(level)} Seção ${section}: ${words(int(2, 5))}\n\n`);
    const blocks = int(3, 7);
    for (let b = 0; b < blocks; b++) {
      const r = rnd();
      if (r < 0.45) {
        const url = rnd() < 0.3 ? ` Veja https://exemplo.invalid/${section}/${b} para mais.` : "";
        push(Array.from({ length: int(2, 5) }, sentence).join(" ") + url + "\n\n");
      } else if (r < 0.65) {
        const ordered = rnd() < 0.4;
        push(Array.from({ length: int(3, 7) }, (_, i) => `${ordered ? `${i + 1}.` : "-"} ${words(int(3, 10))}`).join("\n") + "\n\n");
      } else if (r < 0.8) {
        const cols = int(3, 5);
        const row = () => `| ${Array.from({ length: cols }, () => words(int(1, 3))).join(" | ")} |`;
        push([row(), `|${" --- |".repeat(cols)}`, ...Array.from({ length: int(3, 8) }, row)].join("\n") + "\n\n");
      } else if (r < 0.9) {
        const lines = Array.from({ length: int(4, 12) }, (_, i) => `  const ${pick(WORDS)}${i} = ${int(0, 999)}; // ${words(int(2, 5))}`);
        push("```ts\nfunction bloco" + section + "_" + b + "() {\n" + lines.join("\n") + "\n}\n```\n\n");
      } else {
        push(`> ${sentence()} ${sentence()}\n\n`);
      }
    }
  }
  return parts.join("");
}

/** Linha do gancho (`bench_line` em lib.rs): `LEVE_BENCH {json}`. Outra linha qualquer dá null. */
export function parseBenchLine(line) {
  const m = /^LEVE_BENCH (\{.*\})\s*$/.exec(line);
  if (!m) return null;
  try {
    const v = JSON.parse(m[1]);
    return typeof v.epochMs === "number" && typeof v.doc === "string" ? v : null;
  } catch {
    return null;
  }
}

/** Saída de `ps -axo pid=,comm=` em [{ pid, comm }]. */
export function parsePs(text) {
  return text
    .split("\n")
    .map((l) => /^\s*(\d+)\s+(.+?)\s*$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), comm: m[2] }));
}

/** Tipo do processo do WebKit pelo nome do executável, ou null se não for um. */
export function webkitKind(comm) {
  const m = /com\.apple\.WebKit\.(WebContent|GPU|Networking)\b/.exec(comm);
  return m ? m[1] : null;
}

/**
 * Processos do app: o principal e os do WebKit cujo responsável (`bench-responsavel.swift`) é ele.
 * `responsible` é um Map pid → pid responsável.
 */
export function attribute(procs, responsible, mainPid) {
  const out = [];
  for (const p of procs) {
    if (p.pid === mainPid) out.push({ ...p, kind: "app" });
    else {
      const kind = webkitKind(p.comm);
      if (kind && responsible.get(p.pid) === mainPid) out.push({ ...p, kind });
    }
  }
  return out;
}

/** `phys_footprint` em bytes da saída de `footprint -f bytes`, ou NaN. */
export function parseFootprint(text) {
  const m = /phys_footprint:\s*(\d+)\s*B/.exec(text);
  return m ? Number(m[1]) : NaN;
}

/** Bytes em MB (10^6), uma casa, vírgula decimal ou ponto. */
export function mb(bytes, locale = "pt-BR") {
  return (bytes / 1e6).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
