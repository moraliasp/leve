import { defineConfig, type Plugin } from "vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

/**
 * O CSS do KaTeX declara cada fonte em woff2, woff e ttf. Os WebViews do app (WebKit no macOS,
 * WebView2 no Windows, WebKitGTK no Linux) leem woff2, então woff e ttf só incham o binário
 * (~590 KB). Tira os dois do `src` antes de o Vite resolver os arquivos.
 */
function katexWoff2Only(): Plugin {
  return {
    name: "katex-woff2-only",
    enforce: "pre",
    transform(code, id) {
      if (!/katex(\.min)?\.css($|\?)/.test(id)) return null;
      const out = code.replace(/,\s*url\([^)]*\.(?:woff|ttf)\)\s*format\("(?:woff|truetype)"\)/g, "");
      return { code: out, map: null };
    },
  };
}

/**
 * O Mermaid registra o layout ELK com `import()` do elkjs (EPL-2.0), o maior asset do `dist`
 * (1.462 KB, 456 KB gzip) para um layout que o Leve não pede (`layout: "dagre"` em `render.ts`).
 * Sem o registro, `getRegisteredLayoutAlgorithm` cai para dagre e o chunk some. Falha o build
 * se o padrão mudar, para um upgrade do Mermaid não trazer o ELK de volta em silêncio.
 */
const ELK_SPREAD = /\.\.\.elkLayoutLoaders\(\)/g;
function mermaidSemElk(): Plugin {
  return {
    name: "mermaid-sem-elk",
    enforce: "pre",
    transform(code, id) {
      if (!/[\\/]mermaid[\\/]dist[\\/]/.test(id) || !code.includes("elkLayoutLoaders")) return null;
      const n = code.match(ELK_SPREAD)?.length ?? 0;
      if (n !== 1) throw new Error(`mermaid-sem-elk: esperava 1 \`...elkLayoutLoaders()\` em ${id}, achei ${n}`);
      return { code: code.replace(ELK_SPREAD, ""), map: null };
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [katexWoff2Only(), mermaidSemElk()],

  // O dev server pré-empacota o Mermaid (`optimizeDeps`) sem passar pelos plugins acima; o corte
  // do ELK precisa valer lá também, senão o modo navegador ainda carrega o elkjs.
  optimizeDeps: {
    rolldownOptions: { plugins: [mermaidSemElk()] },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
