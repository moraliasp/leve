import { EXPORT_IMAGE_MAX_BYTES, localImageRels, prepareClone, type ImageEmbed } from "./export";
import { highlightAll } from "./highlight";
import { renderMermaid } from "./render";
import { t } from "./i18n";

/**
 * Copiar como texto formatado: o documento (ou a seleção) vira um fragmento HTML com estilo INLINE,
 * para colar no Google Docs, Gmail/Apple Mail, Word, Notion e Slack mantendo títulos, listas, links,
 * tabelas e código. Esses destinos ignoram `<style>` e classes, então cada elemento leva o seu
 * `style`. Parte pura (testada em jsdom): `toRichHtml`. A rasterização do Mermaid (`svgToPng`) usa
 * canvas e roda só no WebView. Quem monta o clone e escreve na área de transferência é `main.ts`.
 * Por quê: docs/decisoes.md, "Copiar como texto formatado".
 */

const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif";
const FG = "#1f2328";
const MUTED = "#59636e";
const BORDER = "#d1d9e0";
const CODE_BG = "#f6f8fa";
const LINK = "#0969da";
const ERROR = "#cf222e";

/** Cores dos callouts (tema claro), as mesmas de `document.css`. */
export const ALERT_COLORS: Record<string, string> = {
  note: "#0969da",
  tip: "#1a7f37",
  important: "#8250df",
  warning: "#9a6700",
  caution: "#cf222e",
};

/** Realce: classe do highlight.js → estilo, do tema GitHub claro (`highlight.js/styles/github.css`). */
const HLJS: [string, string][] = [
  ["hljs-comment", "color:#6a737d"],
  ["hljs-code", "color:#6a737d"],
  ["hljs-formula", "color:#6a737d"],
  ["hljs-doctag", "color:#d73a49"],
  ["hljs-keyword", "color:#d73a49"],
  ["hljs-template-tag", "color:#d73a49"],
  ["hljs-template-variable", "color:#d73a49"],
  ["hljs-type", "color:#d73a49"],
  ["hljs-title", "color:#6f42c1"],
  ["hljs-attr", "color:#005cc5"],
  ["hljs-attribute", "color:#005cc5"],
  ["hljs-literal", "color:#005cc5"],
  ["hljs-meta", "color:#005cc5"],
  ["hljs-number", "color:#005cc5"],
  ["hljs-operator", "color:#005cc5"],
  ["hljs-variable", "color:#005cc5"],
  ["hljs-selector-attr", "color:#005cc5"],
  ["hljs-selector-class", "color:#005cc5"],
  ["hljs-selector-id", "color:#005cc5"],
  ["hljs-regexp", "color:#032f62"],
  ["hljs-string", "color:#032f62"],
  ["hljs-built_in", "color:#e36209"],
  ["hljs-symbol", "color:#e36209"],
  ["hljs-name", "color:#22863a"],
  ["hljs-quote", "color:#22863a"],
  ["hljs-selector-tag", "color:#22863a"],
  ["hljs-selector-pseudo", "color:#22863a"],
  ["hljs-section", "color:#005cc5;font-weight:bold"],
  ["hljs-bullet", "color:#735c0f"],
  ["hljs-emphasis", "font-style:italic"],
  ["hljs-strong", "font-weight:bold"],
  ["hljs-addition", "color:#22863a;background-color:#f0fff4"],
  ["hljs-deletion", "color:#b31d28;background-color:#ffeef0"],
];

const HEADING_SIZE: Record<string, string> = { h1: "2em", h2: "1.5em", h3: "1.25em", h4: "1em", h5: "0.875em", h6: "0.85em" };

/** Estilo por tag. Elemento dentro de `pre` (o `code` do bloco) recebe o seu à parte. */
const TAG_STYLE: Record<string, string> = {
  p: "margin:0 0 16px",
  blockquote: `margin:0 0 16px;padding:0 1em;color:${MUTED};border-left:4px solid ${BORDER}`,
  ul: "margin:0 0 16px;padding-left:2em",
  ol: "margin:0 0 16px;padding-left:2em",
  li: "margin:0.25em 0",
  dl: "margin:0 0 16px",
  dt: "font-weight:600;margin-top:16px",
  dd: "margin:0 0 16px;padding:0 16px",
  table: `border-collapse:collapse;border-spacing:0;margin:0 0 16px;font-family:${SANS};font-size:14px`,
  th: `border:1px solid ${BORDER};padding:6px 13px;font-weight:600;background-color:${CODE_BG};text-align:left`,
  td: `border:1px solid ${BORDER};padding:6px 13px`,
  pre: `margin:0 0 16px;padding:16px;background-color:${CODE_BG};border-radius:6px;font-family:${MONO};font-size:13px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word;color:${FG}`,
  code: `font-family:${MONO};font-size:85%;padding:0.2em 0.4em;background-color:#eff1f3;border-radius:6px`,
  kbd: `font-family:${MONO};font-size:85%;padding:0.2em 0.4em;border:1px solid ${BORDER};border-radius:6px;background-color:${CODE_BG}`,
  a: `color:${LINK};text-decoration:underline`,
  hr: `border:0;border-top:2px solid ${BORDER};margin:24px 0`,
  img: "max-width:100%",
  mark: "background-color:#fff8c5",
};

/** Esquema explícito (`https:`, `mailto:`): só esses links continuam link depois de colados. */
const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

/** Uma linha só: quebras e espaços repetidos da fonte TeX viram um espaço. */
const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Troca o elemento por outro de tag diferente, levando filhos e o `style` já posto. */
function retag(el: Element, tag: string): HTMLElement {
  const out = el.ownerDocument.createElement(tag);
  while (el.firstChild) out.appendChild(el.firstChild);
  el.replaceWith(out);
  return out;
}

function unwrap(el: Element): void {
  el.replaceWith(...Array.from(el.childNodes));
}

/**
 * Acrescenta ao `style`. Por padrão o que já estava vence (vem depois): `text-align` de célula, o
 * estilo de callout posto antes do estilo por tag. Com `override`, o novo vence.
 */
function addStyle(el: Element, css: string, override = false): void {
  const prev = el.getAttribute("style");
  el.setAttribute("style", !prev ? css : override ? `${prev};${css}` : `${css};${prev}`);
}

/**
 * Fórmulas: a fonte TeX como texto (`$x$`, `$$x$$`). O HTML do KaTeX depende do CSS e das fontes
 * dele, que nenhum destino tem: colado, vira símbolos soltos e o texto duplicado (MathML + HTML).
 */
export function mathToSource(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>(".math")) {
    const src = oneLine(el.dataset.src ?? el.textContent ?? "");
    if (el.classList.contains("math-block")) {
      const p = el.ownerDocument.createElement("p");
      p.setAttribute("style", "text-align:center");
      p.textContent = `$$${src}$$`;
      el.replaceWith(p);
    } else el.replaceWith(el.ownerDocument.createTextNode(`$${src}$`));
  }
}

/** Imagem rasterizada de um diagrama. */
export interface RasterImage {
  data: string;
  width: number;
  height: number;
}

/** Largura máxima do diagrama colado, em px CSS: cabe na coluna de um documento ou e-mail. */
export const MERMAID_MAX_WIDTH = 640;

/**
 * Mermaid: o SVG inline não sobrevive à colagem na maioria dos destinos; vira `<img>` PNG em data
 * URI pela função dada (`svgToPng`, canvas no WebView). O que não rasterizar fica para
 * `toRichHtml`, que põe a fonte do diagrama no lugar.
 */
export async function mermaidToImages(root: HTMLElement, rasterize: (svg: SVGSVGElement) => Promise<RasterImage | null>): Promise<void> {
  for (const pre of root.querySelectorAll<HTMLElement>("pre.mermaid:not(.has-error)")) {
    const svg = pre.querySelector<SVGSVGElement>(":scope > svg");
    if (!svg) continue;
    let got: RasterImage | null = null;
    try {
      got = await rasterize(svg);
    } catch (e) {
      console.warn("rich: mermaid", e);
    }
    if (!got) continue;
    const img = root.ownerDocument.createElement("img");
    img.setAttribute("src", got.data);
    const w = Math.min(got.width, MERMAID_MAX_WIDTH);
    img.setAttribute("width", String(Math.round(w)));
    img.setAttribute("height", String(Math.round((got.height * w) / got.width)));
    img.setAttribute("alt", t("rich.mermaidAlt"));
    svg.replaceWith(img);
  }
}

/** Diagrama sem imagem: rótulo e a fonte num bloco de código. Com imagem: só a imagem num parágrafo. */
function mermaidBlocks(root: HTMLElement): void {
  const doc = root.ownerDocument;
  for (const pre of root.querySelectorAll<HTMLElement>("pre.mermaid")) {
    if (pre.classList.contains("has-error")) {
      unwrap(pre);
      continue;
    }
    const img = pre.querySelector(":scope > img");
    if (img) {
      const p = doc.createElement("p");
      p.appendChild(img);
      pre.replaceWith(p);
      continue;
    }
    const label = doc.createElement("p");
    label.setAttribute("style", `color:${MUTED};font-size:0.875em;margin:0 0 4px`);
    label.textContent = t("rich.mermaidSource");
    const block = doc.createElement("pre");
    const code = doc.createElement("code");
    code.textContent = (pre.dataset.src ?? pre.textContent ?? "").replace(/\n$/, "");
    block.appendChild(code);
    pre.replaceWith(label, block);
  }
}

/** `<details>` dos callouts e do front matter: destinos não abrem; o conteúdo fica sempre à mostra. */
function flattenDetails(root: HTMLElement): void {
  for (const s of root.querySelectorAll("summary")) {
    const p = retag(s, "p");
    if (s.classList.contains("alert-title")) p.className = "alert-title";
    else p.setAttribute("style", `margin:0 0 8px;color:${MUTED};font-size:0.75em;font-weight:600;letter-spacing:0.08em;text-transform:uppercase`);
  }
  for (const d of root.querySelectorAll("details")) {
    const div = retag(d, "div");
    div.className = d.className;
  }
}

/** Callouts: borda colorida à esquerda e título na cor do tipo (o ícone é máscara CSS e não cola). */
function styleAlerts(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>(".alert")) {
    const kind = Array.from(el.classList).find((c) => c.startsWith("alert-") && c.slice(6) in ALERT_COLORS)?.slice(6) ?? "note";
    const color = ALERT_COLORS[kind];
    addStyle(el, `margin:0 0 16px;padding:8px 16px;border-left:4px solid ${color}`);
    for (const title of el.querySelectorAll(":scope > .alert-title")) addStyle(title, `margin:0 0 8px;font-weight:600;color:${color}`);
  }
}

/** Caixa de tarefa: `<input>` não cola em lugar nenhum; vira ☐/☑. */
function taskBoxes(root: HTMLElement): void {
  for (const box of root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    box.replaceWith(root.ownerDocument.createTextNode(box.hasAttribute("checked") || box.checked ? "☑" : "☐"));
  }
  for (const li of root.querySelectorAll(".task-list-item")) addStyle(li, "list-style-type:none");
}

/** Links: só os absolutos (`https:`, `mailto:`) continuam; âncora interna e caminho relativo viram texto. */
function links(root: HTMLElement): void {
  for (const a of root.querySelectorAll("a")) {
    if (a.classList.contains("footnote-backref") || a.classList.contains("header-anchor")) {
      a.remove();
      continue;
    }
    const href = a.getAttribute("href") ?? "";
    if (!ABSOLUTE.test(href) || /^(javascript|data|vbscript):/i.test(href)) unwrap(a);
  }
}

/** Remove o que não é conteúdo: interface que sobrou, `<style>`/`<link>`/`<script>`, atributos internos. */
function scrub(root: HTMLElement): void {
  root.querySelectorAll("script, style, link, meta, noscript, template, iframe, object, embed, .code-tools, button, input, select, textarea, form").forEach((el) => el.remove());
  for (const wrap of root.querySelectorAll(".code-wrap")) unwrap(wrap);
  for (const el of [root, ...root.querySelectorAll("*")]) {
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      if (n.startsWith("on") || n === "id" || n === "class" || n.startsWith("data-") || n.startsWith("aria-") || n === "role" || n === "tabindex") el.removeAttribute(attr.name);
    }
  }
}

/** Estilos por tag e por classe de realce. Roda antes do `scrub`, que tira as classes. */
function inlineStyles(root: HTMLElement): void {
  for (const el of root.querySelectorAll<HTMLElement>("*")) {
    const tag = el.tagName.toLowerCase();
    if (tag === "span") {
      const style = HLJS.filter(([c]) => el.classList.contains(c)).map(([, s]) => s)[0];
      if (style) addStyle(el, style);
      continue;
    }
    if (tag in HEADING_SIZE) {
      const rule = tag === "h1" || tag === "h2" ? `;padding-bottom:0.3em;border-bottom:1px solid ${BORDER}` : "";
      addStyle(el, `margin:24px 0 16px;font-weight:600;line-height:1.25;font-size:${HEADING_SIZE[tag]}${rule}${tag === "h6" ? `;color:${MUTED}` : ""}`);
      continue;
    }
    if (tag === "code" && el.closest("pre")) {
      addStyle(el, `font-family:${MONO};font-size:100%;padding:0;background-color:transparent`);
      continue;
    }
    const style = TAG_STYLE[tag];
    if (style) addStyle(el, style);
  }
  // Rótulo do front matter e células dele: mesma tabela, primeira coluna em mono e cinza.
  for (const th of root.querySelectorAll(".frontmatter th")) addStyle(th, `font-family:${MONO};font-size:12px;font-weight:500;color:${MUTED};background-color:transparent`, true);
  for (const tag of root.querySelectorAll(".fm-tag")) addStyle(tag, `padding:1px 7px;border-radius:10px;background-color:#eff1f3;font-size:12px`);
  for (const el of root.querySelectorAll(".img-missing, .md-link")) addStyle(el, `color:${MUTED}`);
  // Erro de render (Mermaid inválido): mesmo bloco da tela, título em vermelho e borda.
  for (const el of root.querySelectorAll(".render-error")) addStyle(el, `margin:0 0 16px;padding:8px 12px;border-left:4px solid ${ERROR};background-color:${CODE_BG};font-size:13px`, true);
  for (const el of root.querySelectorAll(".render-error-title")) addStyle(el, `color:${ERROR};font-weight:600;white-space:pre-wrap`, true);
}

export interface RichResult {
  /** Fragmento com estilo inline, prefixado por `<meta charset>` (como o Chrome escreve). */
  html: string;
  /** Imagens locais acima do limite, que ficaram com o caminho relativo. */
  oversized: number;
}

/**
 * Converte o clone (documento inteiro ou seleção) no fragmento colável. `root` é alterado.
 * Pré-requisitos no clone: realce feito e, se for o caso, `mermaidToImages` já rodado.
 */
export function toRichHtml(root: HTMLElement, images: Record<string, ImageEmbed> = {}): RichResult {
  mathToSource(root);
  mermaidBlocks(root);
  flattenDetails(root);
  // Links `.md` viram texto com o caminho: colado fora, não há `.html` irmão.
  const oversized = prepareClone(root, images, "text");
  styleAlerts(root);
  taskBoxes(root);
  links(root);
  inlineStyles(root);
  scrub(root);
  const div = retag(root, "div");
  div.setAttribute("style", `font-family:${SANS};font-size:16px;line-height:1.5;color:${FG}`);
  return { html: `<meta charset="utf-8">${div.outerHTML}`, oversized };
}

/**
 * SVG → PNG em data URI, pelo canvas, com fundo branco e 2× de densidade. O Mermaid precisa ter
 * sido desenhado sem `htmlLabels` (sem `<foreignObject>`): no WebKit, SVG com `foreignObject`
 * suja o canvas e `toDataURL` recusa. Devolve `null` se não der.
 */
export async function svgToPng(svg: SVGSVGElement, scale = 2): Promise<RasterImage | null> {
  const vb = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  const width = vb && vb.length === 4 && vb[2] > 0 ? vb[2] : parseFloat(svg.getAttribute("width") ?? "");
  const height = vb && vb.length === 4 && vb[3] > 0 ? vb[3] : parseFloat(svg.getAttribute("height") ?? "");
  if (!(width > 0 && height > 0)) return null;
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(width));
  copy.setAttribute("height", String(height));
  copy.removeAttribute("style");
  const xml = new XMLSerializer().serializeToString(copy);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { data: canvas.toDataURL("image/png"), width, height };
}

/**
 * Seleção dentro do documento, ampliada para não cortar fórmula nem diagrama ao meio; `null` se ela
 * sai do documento (Mod+A pega a interface também: aí vale o documento todo).
 */
export function docRange(content: HTMLElement, range: Range | null): Range | null {
  if (!range || range.collapsed) return null;
  if (!content.contains(range.startContainer) || !content.contains(range.endContainer)) return null;
  const whole = (n: Node): Element | null | undefined => (n.nodeType === 1 ? (n as Element) : n.parentElement)?.closest(".math, pre.mermaid");
  const start = whole(range.startContainer);
  if (start) range.setStartBefore(start);
  const end = whole(range.endContainer);
  if (end) range.setEndAfter(end);
  return range;
}

export interface CopyJob extends RichResult {
  plain: string;
  /** Copiou só a seleção. */
  partial: boolean;
}

/**
 * Do documento (ou da seleção) ao par HTML + texto. O clone: realce completo (fora do modo
 * documento grande, como na tela), Mermaid redesenhado no tema claro sem `htmlLabels` e
 * rasterizado em PNG, imagens locais embutidas (`readImages`, a mesma leitura do Exportar HTML).
 * A página não é tocada.
 */
export async function richCopyJob(o: {
  content: HTMLElement;
  range: Range | null;
  selText: string;
  source: string;
  large: boolean;
  readImages: (rels: string[], max: number) => Promise<Record<string, ImageEmbed>>;
}): Promise<CopyJob> {
  const range = docRange(o.content, o.range);
  const root = o.content.ownerDocument.createElement("article");
  if (range) root.append(range.cloneContents());
  else root.append(...Array.from(o.content.childNodes, (n) => n.cloneNode(true)));
  if (!o.large) await highlightAll(root);
  if (root.querySelector("pre.mermaid")) {
    await renderMermaid(root, false, undefined, { htmlLabels: false });
    await mermaidToImages(root, (svg) => svgToPng(svg));
  }
  const rich = toRichHtml(root, await o.readImages(localImageRels(root), EXPORT_IMAGE_MAX_BYTES));
  return { ...rich, plain: range ? o.selText : o.source, partial: range !== null };
}

/**
 * Espera a escrita começada no gesto; se ela foi recusada (ou não havia `ClipboardItem`), tenta
 * `copyWithExecCommand`. Devolve o aviso da barra.
 */
export async function finishCopy(job: Promise<CopyJob>, write: Promise<void>): Promise<{ message: string; oversized: number }> {
  const copied = await write.then(
    () => true,
    (e) => {
      console.warn("rich: clipboard.write", e);
      return false;
    },
  );
  const j = await job;
  if (!copied) copyWithExecCommand(j.html, j.plain);
  return { message: t(j.partial ? "rich.copiedSelection" : "rich.copied"), oversized: j.oversized };
}

/**
 * Reserva sem `ClipboardItem` (ou com a escrita recusada): `execCommand("copy")` sobre um elemento
 * oculto com o HTML, que no WebKit leva o texto formatado; o evento `copy` põe os dois tipos.
 */
export function copyWithExecCommand(html: string, plain: string): void {
  const holder = document.createElement("div");
  holder.contentEditable = "true";
  holder.style.cssText = "position:fixed;left:-10000px;top:0;opacity:0;pointer-events:none";
  // Fragmento gerado aqui mesmo (`toRichHtml`), a partir do documento já sanitizado e sem script.
  holder.innerHTML = html;
  document.body.appendChild(holder);
  const onCopy = (e: ClipboardEvent): void => {
    if (!e.clipboardData) return;
    e.clipboardData.setData("text/html", html);
    e.clipboardData.setData("text/plain", plain);
    e.preventDefault();
  };
  document.addEventListener("copy", onCopy);
  const sel = window.getSelection();
  const saved = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
  sel?.selectAllChildren(holder);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } finally {
    document.removeEventListener("copy", onCopy);
    holder.remove();
    sel?.removeAllRanges();
    if (saved) sel?.addRange(saved);
  }
  if (!ok) throw new Error("execCommand(copy) recusado");
}
