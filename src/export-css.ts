import documentCss from "./document.css?inline";
import { LIGHT_DOC_CSS } from "./theme";
import { iconCssVars } from "./icons";
import { blobToDataUri, inlineFontFaces, normalWeight } from "./export";

/**
 * CSS do HTML exportado, sempre no tema claro: GitHub (markdown + realce), o CSS do documento do
 * app (document.css: alerts, front matter, Mermaid, código, matemática), os ícones como variáveis
 * e, só se houver fórmula, o KaTeX com as fontes usadas embutidas em woff2. Importado sob demanda
 * por `main.ts` (fora do caminho de abertura). A montagem do arquivo em si está em `export.ts`.
 */
export async function exportCss(root: ParentNode): Promise<string> {
  const parts = [LIGHT_DOC_CSS.markdown, LIGHT_DOC_CSS.highlight, documentCss, iconCssVars()];
  if (root.querySelector(".katex")) {
    const { default: katexCss } = await import("katex/dist/katex.min.css?inline");
    parts.push(await inlineFontFaces(katexCss, await loadedFonts(), fontDataUri));
  }
  return parts.join("\n");
}

/**
 * Quais fontes a página de fato carregou (`document.fonts`), por família, estilo e peso: o KaTeX
 * declara 20 e um documento costuma usar 3 ou 4. Sem a API, ou sem nada carregado, embute todas.
 */
async function loadedFonts(): Promise<(family: string, style: string, weight: string) => boolean> {
  const fonts = document.fonts;
  if (!fonts) return () => true;
  await fonts.ready;
  const keys = new Set<string>();
  fonts.forEach((f) => {
    if (f.status === "loaded") keys.add(`${f.family.replace(/^["']|["']$/g, "")}|${f.style}|${normalWeight(f.weight)}`);
  });
  if (keys.size === 0) return () => true;
  return (family, style, weight) => keys.has(`${family}|${style}|${weight}`);
}

/** Fonte do próprio app (mesma origem, `connect-src 'self'`) como data URI woff2. */
async function fontDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(new URL(url, location.href));
    if (!res.ok) return null;
    return await blobToDataUri(new Blob([await res.arrayBuffer()], { type: "font/woff2" }));
  } catch (e) {
    console.warn("export: fonte", url, e);
    return null;
  }
}
