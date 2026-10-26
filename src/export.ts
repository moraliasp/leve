import { MD_EXT } from "./wikilinks";
import { remoteHost } from "./remote";
import { t } from "./i18n";

/**
 * Exportar HTML: o documento renderizado vira UM arquivo `.html` que abre em qualquer navegador,
 * sem rede e sem script. Este módulo é a parte pura: recebe um clone do `#content` já desenhado
 * (Mermaid em SVG, KaTeX, realce), o CSS já montado e as imagens locais já lidas, e devolve a
 * string. Quem lê imagem, monta o CSS e grava fica fora daqui (`main.ts`, `export-css.ts` e o
 * comando `save_html` no Rust). Por quê: docs/decisoes.md, "Exportar HTML: um arquivo, sem script".
 */

/** Imagem local acima disso não entra no arquivo: fica com o caminho relativo e o leitor é avisado. */
export const EXPORT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Links para outros `.md`: texto com o caminho, ou link para o `.html` de mesmo nome. */
export type MdLinkMode = "text" | "html";

/** Imagem local lida para o arquivo: data URI, grande demais, ou indisponível (`data` nulo). */
export interface ImageEmbed {
  data: string | null;
  tooBig: boolean;
}

export interface ExportInput {
  /** Nome do arquivo de origem: título quando o documento não tem `h1`. */
  fileName: string;
  /** Idioma do `<html lang>`. */
  lang: string;
  /** CSS completo, embutido num `<style>`. */
  css: string;
  mdLinks: MdLinkMode;
  /** Por caminho relativo decodificado (`relOf`), o resultado da leitura. */
  images: Record<string, ImageEmbed>;
}

export interface ExportResult {
  html: string;
  title: string;
  /** Imagens locais acima de `EXPORT_IMAGE_MAX_BYTES`, que ficaram com o caminho relativo. */
  oversized: number;
}

/**
 * Cores da interface que o CSS do documento usa (document.css), no tema claro. Espelha o `:root`
 * de styles.css; `tests/export.test.ts` confere que os valores batem.
 */
export const EXPORT_TOKENS: Record<string, string> = {
  "--bar-bg": "#f6f8fa",
  "--bar-fg": "#1f2328",
  "--bar-muted": "#656d76",
  "--border": "#d0d7de",
  "--error": "#cf222e",
  "--hover": "rgba(0, 0, 0, 0.06)",
};

/** Moldura da página exportada: a coluna de leitura do app, sem a interface em volta. */
export const PAGE_CSS = `:root{${Object.entries(EXPORT_TOKENS)
  .map(([k, v]) => `${k}:${v}`)
  .join(";")}}
html{background:#fff;color-scheme:light}
body{margin:0}
.markdown-body{box-sizing:border-box;min-width:200px;max-width:920px;margin:0 auto;padding:40px 48px 96px}
@media (max-width:719px){.markdown-body{padding:24px 20px 72px}}
@media print{.markdown-body{max-width:none;padding:0}}`;

/** Avisos de licença do que vai embutido no `<style>`; o arquivo é distribuído por quem exporta. */
export const CSS_NOTICE = `/*! Leve (MIT). Estilos embutidos: github-markdown-css (MIT, (c) Sindre Sorhus); highlight.js, tema GitHub (BSD-3-Clause, (c) 2006 Ivan Sagalaev); KaTeX e fontes KaTeX (MIT, (c) Khan Academy e colaboradores); ícones Lucide (ISC). */`;

/**
 * Política da página: nenhum script, nenhum formulário, fontes só embutidas. Imagens de qualquer
 * origem porque as remotas que o leitor carregou mantêm a URL e as grandes demais ficam relativas.
 */
const CSP = "default-src 'none'; img-src * data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'";

/** Atributos que só servem ao app (foco, filas de realce, fontes guardadas, caminhos locais). */
const UI_ATTRS = ["tabindex", "data-hl", "data-rendered", "data-src", "data-local-src", "data-path", "data-target", "data-hash", "data-tooltip", "data-shortcut"];

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Esquema explícito (`https:`, `mailto:`, `data:`…): não é caminho relativo. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Caminho relativo como o app o resolve (`hydrateImages`): decodificado se der. */
export function relOf(src: string): string {
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
}

/** Cópia do `#content` desenhado, dentro de um `<article class="markdown-body">`, sem tocar a página. */
export function cloneContent(content: HTMLElement): HTMLElement {
  const article = content.ownerDocument.createElement("article");
  article.className = "markdown-body";
  for (const n of content.childNodes) article.appendChild(n.cloneNode(true));
  return article;
}

/** Caminhos relativos (decodificados, sem repetição) das imagens locais do clone. */
export function localImageRels(root: ParentNode): string[] {
  const out = new Set<string>();
  for (const img of root.querySelectorAll<HTMLImageElement>("img[data-local-src]")) out.add(relOf(img.dataset.localSrc ?? ""));
  out.delete("");
  return [...out];
}

/** Título da página: o primeiro `h1`, ou o nome do arquivo sem a extensão. */
export function pageTitle(root: ParentNode, fileName: string): string {
  const h1 = root.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim();
  return h1 || fileName.replace(/\.[^.]+$/, "") || fileName;
}

/** Tira o que é interface: botões de copiar, placeholders de imagem remota, atributos do app, scripts. */
function stripUi(root: HTMLElement): void {
  // Botões do app (copiar código, carregar imagem remota); `<button>` do próprio documento fica.
  root.querySelectorAll("script, noscript, .code-copy, button.img-remote").forEach((el) => el.remove());
  // `<style>` só existe dentro do SVG do Mermaid (o sanitize proíbe no documento); fora dele, sai.
  for (const s of root.querySelectorAll("style")) if (!s.closest("svg")) s.remove();
  for (const tools of root.querySelectorAll(".code-tools")) if (!tools.childElementCount) tools.remove();
  for (const el of [root, ...root.querySelectorAll("*")]) {
    for (const a of UI_ATTRS) el.removeAttribute(a);
    for (const attr of Array.from(el.attributes)) if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    el.classList.remove("remote-hidden");
    if (el.getAttribute("class") === "") el.removeAttribute("class");
  }
}

/**
 * Recurso remoto que o leitor não carregou sai bloqueado: a URL guardada em `data-remote-*` não volta.
 * Imagem bloqueada vira um aviso fixo com o texto alternativo e o host (texto, nada é buscado).
 */
function keepRemoteBlocked(root: HTMLElement): void {
  const doc = root.ownerDocument;
  for (const el of root.querySelectorAll<HTMLElement>("[data-remote]")) {
    const url = el.getAttribute("data-remote-src") ?? el.getAttribute("data-remote-srcset") ?? "";
    for (const attr of Array.from(el.attributes)) if (attr.name.startsWith("data-remote")) el.removeAttribute(attr.name);
    if (el.tagName.toLowerCase() !== "img") continue;
    const span = doc.createElement("span");
    span.className = "img-missing img-blocked";
    const alt = doc.createElement("span");
    alt.className = "img-missing-alt";
    alt.textContent = (el as HTMLImageElement).alt || t("export.remoteBlocked");
    span.append(alt);
    if (url) {
      const host = doc.createElement("code");
      host.textContent = remoteHost(url);
      span.append(" ", host);
    }
    el.replaceWith(span);
  }
}

/** Link relativo para outro `.md`: texto com o caminho, ou o `.html` irmão. Wikilink sem nota vira texto. */
function rewriteMdLinks(root: HTMLElement, mode: MdLinkMode): void {
  const doc = root.ownerDocument;
  for (const a of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("#") || HAS_SCHEME.test(href) || href.startsWith("//")) continue;
    const cut = href.indexOf("#");
    const rawPath = cut < 0 ? href : href.slice(0, cut);
    const hash = cut < 0 ? "" : href.slice(cut);
    const path = relOf(rawPath);
    const missing = a.classList.contains("wikilink") && a.classList.contains("missing");
    if (!MD_EXT.test(path) && !missing) continue;
    if (mode === "html" && !missing) {
      a.setAttribute("href", rawPath.replace(/\.[^./\\]+$/, ".html") + hash);
      a.removeAttribute("title");
      continue;
    }
    const span = doc.createElement("span");
    span.className = "md-link";
    const text = (a.textContent ?? "").trim();
    span.textContent = text && text !== path ? `${a.textContent} (${path})` : path || (a.textContent ?? "");
    a.replaceWith(span);
  }
}

/** Imagens locais: data URI quando couber; senão o caminho relativo original (e conta as grandes). */
function embedImages(root: HTMLElement, images: Record<string, ImageEmbed>): number {
  let oversized = 0;
  for (const img of root.querySelectorAll<HTMLImageElement>("img[data-local-src]")) {
    const src = img.dataset.localSrc ?? "";
    const got = images[relOf(src)];
    if (got?.data) img.setAttribute("src", got.data);
    else {
      img.setAttribute("src", src);
      if (got?.tooBig) oversized++;
    }
    img.removeAttribute("loading");
  }
  return oversized;
}

/**
 * Limpeza comum ao Exportar HTML e ao Copiar como texto formatado (`src/rich.ts`): remoto bloqueado
 * continua bloqueado, imagens locais embutidas, links `.md` reescritos, interface fora. Devolve
 * quantas imagens ficaram de fora por tamanho.
 */
export function prepareClone(root: HTMLElement, images: Record<string, ImageEmbed>, mdLinks: MdLinkMode): number {
  keepRemoteBlocked(root);
  const oversized = embedImages(root, images);
  rewriteMdLinks(root, mdLinks);
  stripUi(root);
  return oversized;
}

/**
 * Monta o arquivo. `root` é o clone (`cloneContent`) já com Mermaid, KaTeX e realce, e é alterado
 * aqui: sai a interface, ficam as âncoras dos títulos (o sumário do leitor continua por `#id`).
 */
export function buildExportHtml(root: HTMLElement, input: ExportInput): ExportResult {
  const title = pageTitle(root, input.fileName);
  const oversized = prepareClone(root, input.images, input.mdLinks);
  const css = `${CSS_NOTICE}\n${input.css}\n${PAGE_CSS}`.replace(/<\/style/gi, "<\\/style");
  const html = `<!doctype html>
<html lang="${escapeHtml(input.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="generator" content="Leve">
<title>${escapeHtml(title)}</title>
<style>
${css}
</style>
</head>
<body>
${root.outerHTML}
</body>
</html>
`;
  return { html, title, oversized };
}

/**
 * Fontes do KaTeX embutidas: cada `@font-face` usado vira só o woff2 em data URI; os não usados saem
 * (o texto deles não existe no documento). `used(família, estilo, peso)` diz o que a página carregou
 * (`document.fonts`); `fetchData(url)` devolve o data URI, ou `null` para deixar a regra de fora.
 */
export async function inlineFontFaces(
  css: string,
  used: (family: string, style: string, weight: string) => boolean,
  fetchData: (url: string) => Promise<string | null>,
): Promise<string> {
  const faces = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)];
  const out: string[] = [];
  let last = 0;
  for (const m of faces) {
    const rule = m[0];
    out.push(css.slice(last, m.index));
    last = m.index + rule.length;
    const prop = (name: string): string => new RegExp(`${name}\\s*:\\s*([^;}]+)`).exec(rule)?.[1].trim().replace(/^["']|["']$/g, "") ?? "";
    const url = /url\(\s*["']?([^"')]+\.woff2[^"')]*)["']?\s*\)/.exec(rule)?.[1];
    if (!url || !used(prop("font-family"), prop("font-style") || "normal", normalWeight(prop("font-weight")))) continue;
    const data = await fetchData(url);
    if (!data) continue;
    out.push(rule.replace(/src\s*:[^;}]+/, `src:url(${data}) format("woff2")`));
  }
  out.push(css.slice(last));
  return out.join("");
}

/** "normal" → "400", "bold" → "700"; o resto como veio. */
export function normalWeight(w: string): string {
  const v = w.trim().toLowerCase();
  return v === "" || v === "normal" ? "400" : v === "bold" ? "700" : v;
}

/** Blob → data URI (base64), pelo `FileReader`. */
export function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
