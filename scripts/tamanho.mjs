#!/usr/bin/env node
// Orçamento de tamanho do frontend: `pnpm size` (depois de `pnpm build`) mede `dist/` e sai com
// erro se algo passar do limite. Subir um limite é decisão consciente, no mesmo PR, com o motivo
// (ver "Orçamento de tamanho" em docs/decisoes.md). Medido em kB de 1000 bytes, como o Vite.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Limites em bytes. `total`, `totalGzip` e `maior`: ~10% acima do medido em 2026-10-25, já sem o
 * layout ELK do Mermaid. `abertura` e `aberturaGzip`: ~3% acima do medido em 2026-10-29, com `yaml`,
 * atualizador e os módulos `window`/`webview` da API fora do chunk de abertura (era 429.943 / 135.700).
 * Aqui é o único lugar a ajustar: CSS embutido no chunk de exportação mexe em `total`, e em
 * `abertura` só se o chunk de abertura crescer. Tamanho que cai de verdade leva o limite junto.
 */
export const ORCAMENTO = {
  total: 4_880_000, // medido 4.438.557; em 2026-10-29, 4.539.492
  totalGzip: 1_590_000, // medido 1.442.173 (gzip nível 9, arquivo a arquivo); em 2026-10-29, 1.478.520
  abertura: 319_000, // JS + CSS de dist/index.html; medido 309.975
  aberturaGzip: 104_500, // medido 101.673
  maior: 692_000, // maior arquivo (chunk-*.js do Mermaid); medido 629.043
};

const ROTULOS = {
  total: "dist total",
  totalGzip: "dist total (gzip)",
  abertura: "chunk de abertura",
  aberturaGzip: "chunk de abertura (gzip)",
  maior: "maior arquivo",
};

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/**
 * Arquivos que `index.html` carrega ao abrir: `<script type="module" src>`, `<link rel="stylesheet" href>`
 * e `<link rel="modulepreload" href>` (chunk que o Vite separa mas a abertura importa de cara).
 */
export function openingAssets(html) {
  const tags = html.match(/<(script|link)\b[^>]*>/gi) ?? [];
  const attr = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
  const out = [];
  for (const tag of tags) {
    const isScript = /^<script/i.test(tag);
    if (isScript && attr(tag, "type") === "module" && attr(tag, "src")) out.push(attr(tag, "src"));
    if (!isScript && ["stylesheet", "modulepreload"].includes(attr(tag, "rel")?.toLowerCase()) && attr(tag, "href")) out.push(attr(tag, "href"));
  }
  return out.map((u) => u.replace(/^\.?\//, ""));
}

/** Mede um `dist/`. Erro se faltar `index.html` ou algo que ele referencia: medir zero passaria calado. */
export function measure(dir) {
  const files = walk(dir).map((p) => {
    const buf = readFileSync(p);
    return { path: relative(dir, p).split("\\").join("/"), bytes: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
  });
  const byPath = new Map(files.map((f) => [f.path, f]));
  const index = byPath.get("index.html");
  if (!index) throw new Error(`${dir} sem index.html: rode \`pnpm build\` antes`);
  const opening = openingAssets(readFileSync(join(dir, "index.html"), "utf8")).map((p) => {
    const f = byPath.get(p);
    if (!f) throw new Error(`index.html referencia ${p}, que não está em ${dir}`);
    return f;
  });
  if (!opening.some((f) => f.path.endsWith(".js"))) throw new Error("index.html sem <script type=\"module\" src>");
  const sum = (list, k) => list.reduce((n, f) => n + f[k], 0);
  const largest = files.reduce((a, b) => (b.bytes > a.bytes ? b : a));
  return {
    values: {
      total: sum(files, "bytes"),
      totalGzip: sum(files, "gzip"),
      abertura: sum(opening, "bytes"),
      aberturaGzip: sum(opening, "gzip"),
      maior: largest.bytes,
    },
    opening: opening.map((f) => f.path),
    largest: largest.path,
    count: files.length,
  };
}

/** Compara medidas com o orçamento. Limite ausente no orçamento não é checado. */
export function check(values, budget = ORCAMENTO) {
  return Object.keys(ROTULOS)
    .filter((k) => budget[k] != null)
    .map((k) => {
      const value = values[k];
      const limit = budget[k];
      return { key: k, label: ROTULOS[k], value, limit, over: Math.max(0, value - limit), ok: value <= limit };
    });
}

const kb = (n) => `${(n / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kB`;

export function report(rows) {
  const w = Math.max(...rows.map((r) => r.label.length));
  return rows
    .map((r) => {
      const pct = ((r.value / r.limit) * 100).toFixed(0);
      const tail = r.ok ? `${pct}%` : `ESTOUROU por ${kb(r.over)} (${pct}%)`;
      return `  ${r.label.padEnd(w)}  ${kb(r.value).padStart(11)} / ${kb(r.limit).padStart(11)}  ${tail}`;
    })
    .join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const dir = process.argv[2] ?? fileURLToPath(new URL("../dist", import.meta.url));
  try {
    statSync(dir);
  } catch {
    console.error(`${dir} não existe: rode \`pnpm build\` antes de \`pnpm size\``);
    process.exit(1);
  }
  const m = measure(dir);
  const rows = check(m.values);
  console.log(`Tamanho de ${relative(process.cwd(), dir) || dir} (${m.count} arquivos)`);
  console.log(`  abertura: ${m.opening.join(" + ")}`);
  console.log(`  maior:    ${m.largest}`);
  console.log(report(rows));
  const bad = rows.filter((r) => !r.ok);
  if (bad.length) {
    console.error(`\n${bad.length} limite(s) estourado(s). Se o aumento é intencional, suba ORCAMENTO em scripts/tamanho.mjs no mesmo PR, com o motivo.`);
    process.exit(1);
  }
}
