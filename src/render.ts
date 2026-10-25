import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import taskLists from "markdown-it-task-lists";
import footnote from "markdown-it-footnote";
import alerts from "./alerts";
import frontMatter from "markdown-it-front-matter";
import YAML from "yaml";
import DOMPurify from "dompurify";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { scrubMermaidSource, stripRemote, stripRemoteTree } from "./remote";
import { math } from "./math";
import { wikilinks } from "./wikilinks";
import { t } from "./i18n";

/** Slug no estilo GitHub: minúsculas, sem pontuação, espaços viram hífen. */
export function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight(str: string, lang: string): string {
    if (lang === "mermaid") {
      return `<pre class="mermaid">${escapeHtml(str)}</pre>`;
    }
    // Só marca a linguagem; o realce vem depois, sob demanda (src/highlight.ts).
    const l = /^[\w+#.-]+$/.test(lang) ? lang : "text";
    return `<pre class="hljs"><code class="language-${l}">${escapeHtml(str)}</code></pre>`;
  },
})
  .use(anchor, { slugify })
  .use(taskLists, { label: true })
  .use(footnote)
  .use(math)
  .use(wikilinks)
  .use(alerts)
  .use(frontMatter, (fm: string) => {
    pendingFrontMatter = fm;
  });

/** Preenchido pelo plugin durante `md.render`; consumido logo em seguida por `render`. */
let pendingFrontMatter: string | null = null;

function isScalar(v: unknown): v is string | number | boolean | null | Date {
  return v === null || typeof v !== "object" || v instanceof Date;
}

function formatScalar(v: string | number | boolean | null | Date): string {
  if (v === null) return "—";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v ? t("doc.yes") : t("doc.no");
  return String(v);
}

function formatValue(v: unknown): string {
  if (isScalar(v)) return `<span class="fm-scalar">${escapeHtml(formatScalar(v))}</span>`;
  if (Array.isArray(v) && v.every(isScalar)) {
    return v.map((x) => `<span class="fm-tag">${escapeHtml(formatScalar(x))}</span>`).join(" ");
  }
  return `<pre class="fm-nested">${escapeHtml(YAML.stringify(v).trimEnd())}</pre>`;
}

/** Frontmatter YAML → bloco de metadados colapsável. YAML inválido vira bloco de código. */
function renderFrontMatter(fm: string): string {
  let data: unknown;
  try {
    data = YAML.parse(fm);
  } catch {
    return `<details class="frontmatter" open><summary>${escapeHtml(t("doc.metadataInvalid"))}</summary><pre>${escapeHtml(fm)}</pre></details>`;
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return `<details class="frontmatter" open><summary>${escapeHtml(t("doc.metadata"))}</summary><pre>${escapeHtml(fm)}</pre></details>`;
  }
  const rows = Object.entries(data as Record<string, unknown>)
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${formatValue(v)}</td></tr>`)
    .join("");
  return `<details class="frontmatter" open><summary>${escapeHtml(t("doc.metadata"))}</summary><table>${rows}</table></details>`;
}

/**
 * `position: fixed` num `style` do documento escapa de `#main` e cobre a barra do app (barra falsa,
 * botão falso). Só essa declaração sai; o resto do CSS inline fica. Comentários são removidos antes
 * (`position:/**／fixed` é fixed para o navegador). `style` com barra invertida (escape CSS, que
 * esconde `\70osition`) ou com `var(` (`--p:fixed; position:var(--p)` computa fixed sem a palavra na
 * posição certa) é descartado inteiro. Roda ANTES de `stripRemote`: o que ele guarda em
 * `data-remote-style` volta no "Carregar imagens remotas", e não pode voltar com `fixed`.
 * `absolute` fica confinado a `#main`, que é `position: relative`.
 */
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const FIXED = /(^|;)\s*position\s*:\s*fixed\b[^;]*/gi;
export function stripFixed(el: Element): void {
  const style = el.getAttribute("style");
  if (!style) return;
  if (style.includes("\\") || /var\s*\(/i.test(style.replace(CSS_COMMENT, ""))) {
    el.removeAttribute("style");
    return;
  }
  if (!/fixed/i.test(style)) return;
  const out = style.replace(CSS_COMMENT, "").replace(FIXED, "$1");
  if (out !== style) el.setAttribute("style", out);
}

// Privacidade: todo recurso remoto sai do HTML aqui, antes de chegar à página (src/remote.ts).
// Janela: o documento não cobre a interface (stripFixed, antes de stripRemote guardar o style).
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeType !== 1) return;
  stripFixed(node as Element);
  stripRemote(node as Element);
});

// `form`: num visualizador não tem o que enviar, e `action`/`formaction` navegariam a janela para fora.
// `dialog` + `command="show-modal"`/`commandfor` e `popover`: entram na camada superior do navegador
// (fixed por padrão, fora de qualquer contenção) e cobririam a barra sem `style` nem JS.
const PURIFY = {
  FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "dialog"],
  FORBID_ATTR: ["popover", "popovertarget", "popovertargetaction", "command", "commandfor"],
  ADD_ATTR: ["align"],
};

export interface RenderOpts {
  /**
   * Modo documento grande (`isLargeDoc`, src/limits.ts): sem links automáticos. O resto do render
   * é o mesmo; realce e sumário reduzidos ficam por conta de quem chama (`loadDoc`).
   */
  large?: boolean;
}

function toHtml(src: string, opts: RenderOpts): string {
  pendingFrontMatter = null;
  // Opção lida a cada render pela regra de linkify; render é síncrono, então não vaza para outro.
  md.set({ linkify: !opts.large });
  const body = md.render(src);
  const head = pendingFrontMatter ? renderFrontMatter(pendingFrontMatter) : "";
  return head + body;
}

/**
 * Renderiza e sanitiza. HTML cru do .md é permitido, scripts e estilos não; recurso remoto fica bloqueado.
 * String + `innerHTML` e não `RETURN_DOM_FRAGMENT`: medido em 2026-10-23, o fragmento importado nó a nó
 * é mais lento num documento de 1 MB do que serializar e o navegador analisar de novo.
 */
export function render(src: string, opts: RenderOpts = {}): string {
  return DOMPurify.sanitize(toHtml(src, opts), PURIFY);
}

const ABSOLUTE_URL = /^(https?:|data:|blob:|asset:|file:)/i;

/** Junta caminho relativo à pasta do documento, respeitando o separador do SO. */
export function joinPath(dir: string, rel: string): string {
  if (rel.startsWith("/") || /^[A-Za-z]:[\\/]/.test(rel)) return rel;
  const sep = dir.includes("\\") ? "\\" : "/";
  const parts = dir.split(/[\\/]/);
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length > 1) parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join(sep);
}

/**
 * Bloco de erro de render, visível ao leitor: título com a origem e a mensagem, fonte abaixo.
 * Mesmo padrão para Mermaid, imagens e o que vier (KaTeX já mostra a fonte em vermelho).
 */
export function renderErrorBlock(origin: string, message: string, source?: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "render-error";
  const title = document.createElement("div");
  title.className = "render-error-title";
  title.textContent = `${origin}: ${message}`;
  box.appendChild(title);
  if (source) {
    const pre = document.createElement("pre");
    pre.className = "render-error-source";
    pre.textContent = source;
    box.appendChild(pre);
  }
  return box;
}

/** Imagem que não carregou vira um aviso discreto com o `alt` e o caminho tentado. */
export function markBrokenImage(img: HTMLImageElement, shown: string): void {
  const span = document.createElement("span");
  span.className = "img-missing";
  span.title = t("doc.imageMissing", { path: shown });
  const alt = document.createElement("span");
  alt.className = "img-missing-alt";
  alt.textContent = img.alt || t("doc.image");
  const path = document.createElement("code");
  path.textContent = shown;
  span.append(alt, " ", path);
  img.replaceWith(span);
}

/**
 * Reaponta imagens relativas para a pasta do arquivo. No Tauri, pede ao backend que libere
 * cada imagem no asset protocol (arquivo por arquivo, nunca a pasta); imagem recusada ou
 * ausente dispara `error` e vira o aviso com o caminho tentado.
 */
export async function hydrateImages(container: HTMLElement, dir: string, viaAsset = true): Promise<void> {
  const pending: { img: HTMLImageElement; rel: string }[] = [];
  for (const img of container.querySelectorAll<HTMLImageElement>("img[src]")) {
    const src = img.getAttribute("src") ?? "";
    if (ABSOLUTE_URL.test(src)) {
      img.addEventListener("error", () => markBrokenImage(img, src), { once: true });
      continue;
    }
    let rel = src;
    try {
      rel = decodeURIComponent(src);
    } catch {
      /* mantém como veio */
    }
    img.loading = "lazy";
    pending.push({ img, rel });
  }
  if (pending.length === 0) return;
  if (!viaAsset) {
    for (const { img, rel } of pending) {
      const abs = joinPath(dir, rel);
      img.addEventListener("error", () => markBrokenImage(img, abs), { once: true });
      img.src = abs;
    }
    return;
  }
  const rels = [...new Set(pending.map((p) => p.rel))];
  let allowed: Record<string, string | null> = {};
  try {
    allowed = await invoke<Record<string, string | null>>("allow_assets", { dir, rels });
  } catch (e) {
    console.warn("allow_assets:", e);
  }
  for (const { img, rel } of pending) {
    const abs = allowed[rel];
    img.addEventListener("error", () => markBrokenImage(img, abs ?? joinPath(dir, rel)), { once: true });
    if (abs) img.src = convertFileSrc(abs);
    else img.src = "asset://localhost/recusado/" + encodeURIComponent(rel);
  }
}

let mermaidSeq = 0;

/**
 * Renderiza blocos ```mermaid sob demanda (lib carregada só quando há diagrama), um a um:
 * diagrama com erro vira bloco de erro com a mensagem do parser e a fonte, sem afetar os outros.
 */
export type MermaidLike = {
  initialize(config: Record<string, unknown>): void;
  render(id: string, src: string): Promise<{ svg: string; bindFunctions?: (el: Element) => void }>;
};
export async function renderMermaid(container: HTMLElement, dark: boolean, lib?: MermaidLike): Promise<void> {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>("pre.mermaid"));
  if (nodes.length === 0) return;
  const mermaid: MermaidLike = lib ?? (await import("mermaid")).default;
  // `layout: "dagre"`: o Mermaid 12 usa elk como padrão, e aí todo fluxograma baixa e interpreta
  // 1,4 MB de elk. Dagre era o padrão até o 11; quem quiser elk pede no próprio diagrama
  // (`config: layout: elk` no frontmatter dele) e ele carrega só nesse caso.
  // Conteúdo remoto: o Mermaid desenha num contêiner da página antes de devolver o SVG, então
  // `themeCSS` com `url()` (diretiva ou frontmatter do diagrama; o Mermaid só confere chaves
  // balanceadas) já buscaria a URL. `secure` tira o CSS do alcance do documento; o nó-imagem é
  // limpo na fonte (`scrubMermaidSource`); e o SVG final ainda passa por `stripRemoteTree`.
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? "dark" : "default",
    securityLevel: "strict",
    layout: "dagre",
    secure: ["secure", "securityLevel", "startOnLoad", "maxTextSize", "suppressErrorRendering", "maxEdges", "themeCSS", "fontFamily", "altFontFamily"],
  });
  for (const n of nodes) {
    if (n.dataset.src === undefined) n.dataset.src = n.textContent ?? "";
    const src = scrubMermaidSource(n.dataset.src).src;
    const id = `leve-mermaid-${mermaidSeq++}`;
    try {
      const { svg, bindFunctions } = await mermaid.render(id, src);
      n.innerHTML = svg;
      stripRemoteTree(n);
      n.classList.remove("has-error");
      bindFunctions?.(n);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      n.classList.add("has-error");
      n.replaceChildren(renderErrorBlock("Mermaid", msg, src));
      // Em erro o Mermaid deixa um contêiner temporário (com o ícone de bomba) solto no body.
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  }
}
