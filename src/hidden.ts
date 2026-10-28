/**
 * Conteúdo oculto do documento: o que está na fonte e o leitor não vê no render. Três tipos:
 * - comentários HTML: o sanitize os tira (`render.ts` guarda o texto num `CommentSink` e deixa um
 *   marcador vazio no lugar);
 * - caracteres invisíveis e de controle de direção (`INVISIBLE`), nos nós de texto;
 * - elementos escondidos por atributo, estilo ou etiqueta (`hiddenReason`).
 * `<details>` fechado é legítimo: o leitor abre com um clique. Por quê e critérios (ZWJ, tags de
 * bandeira): docs/decisoes.md, "Nada escondido de quem lê".
 *
 * Mostrar (`revealHidden`) só cria texto e muda atributos de exibição, nunca HTML vindo do
 * documento; `stripHiddenMarks` desfaz tudo num clone (Exportar HTML, Copiar formatado).
 */

/** U+200B–U+200F, U+202A–U+202E, U+2060–U+2064, U+2066–U+2069, U+FEFF e o bloco de tags U+E0000–U+E007F. */
const INVISIBLE_RE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿\u{E0000}-\u{E007F}]/u;

export function isInvisible(cp: number): boolean {
  return (
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x2064) ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    cp === 0xfeff ||
    isTag(cp)
  );
}

const isTag = (cp: number): boolean => cp >= 0xe0000 && cp <= 0xe007f;

/** Teste rápido (uma passada de regex) antes de varrer o DOM: documento sem nenhum não paga a varredura. */
export function hasInvisible(text: string): boolean {
  return INVISIBLE_RE.test(text);
}

const PICTO = /\p{Extended_Pictographic}/u;
/** Escritas em que ZWJ/ZWNJ entre letras é ortografia (Unicode, "joiner controls"). */
const JOINING = /[\p{scx=Arabic}\p{scx=Syriac}\p{scx=Nko}\p{scx=Mongolian}\p{scx=Devanagari}\p{scx=Bengali}\p{scx=Gurmukhi}\p{scx=Gujarati}\p{scx=Oriya}\p{scx=Tamil}\p{scx=Telugu}\p{scx=Kannada}\p{scx=Malayalam}\p{scx=Sinhala}]/u;

const ch = (cp: number | undefined): string => (cp === undefined ? "" : String.fromCodePoint(cp));
const isPicto = (cp: number | undefined): boolean => cp !== undefined && PICTO.test(ch(cp));
/** Fim de um emoji antes do ZWJ: o próprio pictograma, VS16 (U+FE0F) ou modificador de pele. */
const endsEmoji = (cp: number | undefined): boolean => cp !== undefined && (isPicto(cp) || cp === 0xfe0f || (cp >= 0x1f3fb && cp <= 0x1f3ff));
const isJoining = (cp: number | undefined): boolean => cp !== undefined && JOINING.test(ch(cp));

/** Sequência de tags de bandeira de subdivisão (🏴 + a–z/0–9 + U+E007F): até 6 tags, como no RGI. */
function flagTagEnd(cps: number[], i: number): number {
  if (cps[i] !== 0x1f3f4) return -1;
  let j = i + 1;
  while (j < cps.length && j - i <= 7 && ((cps[j] >= 0xe0030 && cps[j] <= 0xe0039) || (cps[j] >= 0xe0061 && cps[j] <= 0xe007a))) j++;
  return j > i + 1 && cps[j] === 0xe007f ? j + 1 : -1;
}

export interface InvisibleRun {
  /** Posições em unidades UTF-16 de `text` (as de `Text.splitText`). */
  start: number;
  end: number;
  codes: number[];
}

/**
 * Trechos de caracteres invisíveis seguidos em `text`. Não contam: ZWJ/ZWNJ entre emojis
 * (👩‍💻, 🏳️‍🌈) ou entre letras de escrita que os usa (persa, hindi), tags de bandeira de
 * subdivisão (🏴󠁧󠁢󠁳󠁣󠁴󠁿) e, com `docStart`, o BOM no início do documento.
 */
export function findInvisibleRuns(text: string, docStart = false): InvisibleRun[] {
  if (!hasInvisible(text)) return [];
  const cps: number[] = [];
  const pos: number[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    cps.push(cp);
    pos.push(i);
    i += cp > 0xffff ? 2 : 1;
  }
  pos.push(text.length);
  const runs: InvisibleRun[] = [];
  let cur: InvisibleRun | null = null;
  for (let k = 0; k < cps.length; k++) {
    const flag = flagTagEnd(cps, k);
    if (flag > 0) {
      cur = null;
      k = flag - 1;
      continue;
    }
    const cp = cps[k];
    let hidden = isInvisible(cp);
    if (hidden && (cp === 0x200d || cp === 0x200c)) {
      const prev = cps[k - 1];
      const next = cps[k + 1];
      if (cp === 0x200d && endsEmoji(prev) && isPicto(next)) hidden = false;
      else if (isJoining(prev) && isJoining(next)) hidden = false;
    }
    if (hidden && cp === 0xfeff && k === 0 && docStart) hidden = false;
    if (!hidden) {
      cur = null;
      continue;
    }
    if (cur) {
      cur.end = pos[k + 1];
      cur.codes.push(cp);
    } else {
      cur = { start: pos[k], end: pos[k + 1], codes: [cp] };
      runs.push(cur);
    }
  }
  return runs;
}

const hex = (cp: number): string => "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
const MAX_GROUPS = 6;
const MAX_DECODED = 500;

/**
 * Rótulo do chip: códigos agrupados (`U+200B×3 U+200C`) e, se houver tags, o texto que elas
 * escrevem (U+E0020–U+E007E espelham o ASCII: é assim que se esconde uma frase inteira).
 */
export function runLabel(codes: number[]): string {
  const groups: { key: string; n: number }[] = [];
  let decoded = "";
  for (const cp of codes) {
    const key = isTag(cp) ? "U+E00xx" : hex(cp);
    if (isTag(cp) && cp >= 0xe0020 && cp <= 0xe007e && decoded.length < MAX_DECODED) decoded += String.fromCharCode(cp - 0xe0000);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.n++;
    else groups.push({ key, n: 1 });
  }
  const shown = groups.slice(0, MAX_GROUPS).map((g) => (g.n > 1 ? `${g.key}×${g.n}` : g.key));
  if (groups.length > MAX_GROUPS) shown.push("…");
  return shown.join(" ") + (decoded ? ` “${decoded}”` : "");
}

// ---------- comentários (preenchido por `render`) ----------

/**
 * Comentários tirados pelo sanitize de um render. O marcador no HTML é
 * `<span data-leve-comment="<nonce>:<i>">`; o nonce é novo a cada render, então um marcador
 * escrito no próprio documento não se passa por um do app.
 */
export interface CommentSink {
  nonce: string;
  texts: string[];
}

export function newCommentSink(): CommentSink {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return { nonce: Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""), texts: [] };
}

export const COMMENT_ATTR = "data-leve-comment";

/**
 * O HTML com cada marcador de comentário trocado pelo texto do comentário: igual entre dois renders
 * do mesmo documento (o nonce muda), diferente se o comentário mudou. Para as chaves de `changes.ts`.
 */
export function stableCommentMarks(html: string, sink: CommentSink | null): string {
  if (!sink || sink.texts.length === 0) return html;
  return html.replace(new RegExp(`${COMMENT_ATTR}="${sink.nonce}:(\\d+)"`, "g"), (_, i: string) => `${COMMENT_ATTR}="${sink.texts[Number(i)] ?? ""}"`);
}

/**
 * As marcas do app (classes `leve-*`, atributos `data-leve-*`) não podem vir do documento: um
 * `class="leve-mark"` escaparia da detecção e um `data-leve-orig` faria o export restaurar um
 * atributo que o sanitize nunca viu. Roda no hook do sanitize, em todo elemento do documento; o
 * marcador de comentário só fica com o nonce do render em curso.
 */
export function stripAppMarks(el: Element, nonce: string | null): void {
  for (const attr of Array.from(el.attributes)) {
    if (!attr.name.startsWith("data-leve-")) continue;
    if (attr.name === COMMENT_ATTR && nonce && attr.value.startsWith(`${nonce}:`)) continue;
    el.removeAttribute(attr.name);
  }
  if (el.classList.length === 0) return;
  for (const c of Array.from(el.classList)) if (c.startsWith("leve-")) el.classList.remove(c);
  if (el.getAttribute("class") === "") el.removeAttribute("class");
}

// ---------- elementos escondidos ----------

/** Classes do próprio app que escondem (styles.css); o documento pode usá-las. */
const HIDING_CLASSES = ["hidden", "remote-hidden"];
const HIDDEN_SELECTOR = `[hidden], [style], [data-remote-style], template, datalist, input[type="hidden" i], ${HIDING_CLASSES.map((c) => `.${c}`).join(", ")}`;

let scratch: HTMLElement | null = null;
function parseStyle(doc: Document, css: string): CSSStyleDeclaration {
  if (scratch?.ownerDocument !== doc) scratch = doc.createElement("span");
  scratch.setAttribute("style", css);
  return scratch.style;
}

const zero = (v: string): boolean => v !== "" && parseFloat(v) === 0;

/** Declarações que escondem, na ordem em que viram rótulo. */
const STYLE_RULES: { prop: string; test: (v: string) => boolean; label: string }[] = [
  { prop: "display", test: (v) => v === "none", label: "display:none" },
  { prop: "visibility", test: (v) => v === "hidden" || v === "collapse", label: "visibility:hidden" },
  { prop: "opacity", test: zero, label: "opacity:0" },
  { prop: "font-size", test: zero, label: "font-size:0" },
];

function styleReason(doc: Document, css: string | null): string | null {
  if (!css) return null;
  // Nome de propriedade é sem caixa para o navegador (`DISPLAY: none`); o valor aqui só é testado.
  const s = parseStyle(doc, css.toLowerCase());
  for (const r of STYLE_RULES) if (r.test(s.getPropertyValue(r.prop).trim().toLowerCase())) return r.label;
  return null;
}

/** Por que o elemento não aparece ao leitor, ou `null`. `<details>` fechado não conta. */
export function hiddenReason(el: Element): string | null {
  if (el.hasAttribute(COMMENT_ATTR) || el.classList.contains(MARK)) return null;
  const tag = el.tagName.toLowerCase();
  if (tag === "template" || tag === "datalist") return `<${tag}>`;
  if (tag === "input" && el.getAttribute("type")?.toLowerCase() === "hidden") return 'type="hidden"';
  if (el.hasAttribute("hidden")) return "hidden";
  for (const c of HIDING_CLASSES) if (el.classList.contains(c) && !(c === "remote-hidden" && el.hasAttribute("data-remote"))) return `class="${c}"`;
  return styleReason(el.ownerDocument, el.getAttribute("style")) ?? styleReason(el.ownerDocument, el.getAttribute("data-remote-style"));
}

// ---------- varredura ----------

export interface HiddenScan {
  comments: HTMLElement[];
  /** Só o mais externo: o que está dentro de um escondido aparece junto com ele. */
  elements: { el: HTMLElement; reason: string }[];
  /** Escondidos dentro de outro escondido: não contam, mas aparecem junto. */
  nested: { el: HTMLElement; reason: string }[];
  /** Trechos de caracteres invisíveis (`findInvisibleRuns`). */
  invisible: number;
}

export function hiddenTotal(s: HiddenScan): number {
  return s.comments.length + s.elements.length + s.invisible;
}

/**
 * Nós de texto com algum invisível, fora das marcas do app, e se cada um é o primeiro texto de
 * `root` (para o BOM inicial). O teste da marca (`closest`) só roda em quem tem invisível: num
 * documento de 2,5 MB, rodar em todo nó custava a maior parte da varredura.
 */
function invisibleTextNodes(root: Node): { node: Text; first: boolean }[] {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: { node: Text; first: boolean }[] = [];
  let first = true;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const isFirst = first;
    first = false;
    if (!hasInvisible(n.data) || n.parentElement?.closest(`.${MARK}`)) continue;
    out.push({ node: n, first: isFirst });
  }
  return out;
}

/**
 * Procura o oculto em `root` (o `#content` recém-renderizado). `sink`: comentários do render;
 * marcador com nonce errado (escrito no documento) perde o atributo. `source`: a fonte, para
 * pular a varredura de texto quando não há nenhum invisível (`hasInvisible`).
 */
export function scanHidden(root: HTMLElement, sink: CommentSink | null, source?: string): HiddenScan {
  const comments: HTMLElement[] = [];
  for (const m of root.querySelectorAll<HTMLElement>(`[${COMMENT_ATTR}]`)) {
    const [nonce, i] = (m.getAttribute(COMMENT_ATTR) ?? "").split(":");
    if (sink && nonce === sink.nonce && sink.texts[Number(i)] !== undefined) comments.push(m);
    else m.removeAttribute(COMMENT_ATTR);
  }
  const elements: HiddenScan["elements"] = [];
  const nested: HiddenScan["nested"] = [];
  for (const el of root.querySelectorAll<HTMLElement>(HIDDEN_SELECTOR)) {
    const reason = hiddenReason(el);
    if (!reason) continue;
    // Ordem do documento: um descendente de escondido vem logo dentro do último guardado.
    (elements[elements.length - 1]?.el.contains(el) ? nested : elements).push({ el, reason });
  }
  let invisible = 0;
  if (source === undefined || hasInvisible(source)) {
    for (const { node, first } of invisibleTextNodes(root)) invisible += findInvisibleRuns(node.data, first).length;
  }
  return { comments, elements, nested, invisible };
}

// ---------- mostrar e desfazer ----------

/** Classe de tudo que o app acrescenta ao revelar; o export tira. */
export const MARK = "leve-mark";
const REVEALED_ATTR = "data-leve-hidden";
const ORIG_ATTR = "data-leve-orig";
const TOUCHED = ["hidden", "style", "data-remote-style", "class", "type", "readonly"] as const;

export interface RevealLabels {
  comment: string;
  element: string;
  char: string;
}

function mark(doc: Document, cls: string, label: string, text: string): HTMLElement {
  const box = doc.createElement("span");
  box.className = `${MARK} ${cls}`;
  const tag = doc.createElement("span");
  tag.className = "leve-hidden-tag";
  tag.textContent = label;
  box.append(tag, doc.createTextNode(text));
  return box;
}

/** Tira só as declarações que escondem; o resto do estilo fica. */
function unhideStyle(doc: Document, css: string): string {
  const s = parseStyle(doc, css);
  for (const r of STYLE_RULES) if (r.test(s.getPropertyValue(r.prop).trim().toLowerCase())) s.removeProperty(r.prop);
  return s.cssText;
}

/** Põe um chip depois de cada trecho invisível de `root`. `docStart`: `root` é o documento inteiro. */
export function markInvisibles(root: Node, label: string, docStart = false): number {
  let n = 0;
  for (const { node: t, first } of invisibleTextNodes(root)) {
    const runs = findInvisibleRuns(t.data, docStart && first);
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = runs[i];
      const tail = t.splitText(r.end);
      const chip = t.ownerDocument.createElement("span");
      chip.className = `${MARK} leve-hidden-chip`;
      const code = runLabel(r.codes);
      // Texto por CSS (`attr()`): a busca, a seleção e o realce de código não o veem.
      chip.setAttribute("data-label", code);
      chip.setAttribute("role", "img");
      chip.setAttribute("aria-label", `${label}: ${code}`);
      chip.title = label;
      tail.before(chip);
      n++;
    }
  }
  return n;
}

function revealElement(el: HTMLElement, reason: string, labels: RevealLabels): void {
  const doc = el.ownerDocument;
  const orig: Record<string, string | null> = {};
  for (const a of TOUCHED) orig[a] = el.getAttribute(a);
  el.setAttribute(ORIG_ATTR, JSON.stringify(orig));
  el.removeAttribute("hidden");
  for (const a of ["style", "data-remote-style"] as const) {
    const css = el.getAttribute(a);
    if (css) el.setAttribute(a, unhideStyle(doc, css));
  }
  for (const c of HIDING_CLASSES) el.classList.remove(c);
  const tag = el.tagName.toLowerCase();
  if (tag === "input") {
    el.setAttribute("type", "text");
    el.setAttribute("readonly", "");
  }
  if (tag === "datalist") el.style.display = "block";
  // `<template>` não desenha o conteúdo: vai como texto dentro dele, que passa a desenhar. Dentro,
  // não ao lado: os filhos de topo de `#content` não mudam (marcas de mudança e rolagem contam neles).
  if (el instanceof HTMLTemplateElement) {
    el.style.display = "block";
    el.append(mark(doc, "leve-hidden-text", `${labels.element}: ${reason}`, el.content.textContent ?? ""));
  }
  el.classList.add("leve-hidden-el");
  el.setAttribute(REVEALED_ATTR, `${labels.element}: ${reason}`);
}

/** Mostra tudo que `scan` achou. Comentário vira texto (`textContent`), nunca HTML. */
export function revealHidden(root: HTMLElement, scan: HiddenScan, sink: CommentSink | null, labels: RevealLabels): void {
  const doc = root.ownerDocument;
  for (const m of scan.comments) {
    if (m.classList.contains(MARK)) continue;
    const i = Number((m.getAttribute(COMMENT_ATTR) ?? "").split(":")[1]);
    const text = (sink?.texts[i] ?? "").trim();
    const box = mark(doc, "leve-hidden-comment", labels.comment, text);
    if (m.parentElement === root || text.includes("\n")) box.classList.add("block");
    m.replaceChildren(...box.childNodes);
    m.className = box.className;
  }
  for (const { el, reason } of [...scan.elements, ...scan.nested]) if (!el.hasAttribute(REVEALED_ATTR)) revealElement(el, reason, labels);
  if (scan.invisible > 0) markInvisibles(root, labels.char, true);
}

/**
 * Desfaz as marcas num clone do documento: sai o que o app acrescentou (chips, comentários) e os
 * elementos voltam aos atributos originais. Exportar e copiar levam o documento como ele é.
 */
export function stripHiddenMarks(root: HTMLElement): void {
  root.querySelectorAll(`[${COMMENT_ATTR}], .leve-hidden-chip, .leve-hidden-text`).forEach((el) => el.remove());
  // Junta de volta o texto que os chips dividiram.
  root.normalize();
  for (const el of root.querySelectorAll<HTMLElement>(`[${ORIG_ATTR}]`)) {
    let orig: Record<string, string | null> = {};
    try {
      orig = JSON.parse(el.getAttribute(ORIG_ATTR) ?? "{}") as Record<string, string | null>;
    } catch {
      /* atributo do próprio app; sem ele, só tira as marcas */
    }
    for (const a of TOUCHED) {
      const v = orig[a];
      if (typeof v === "string") el.setAttribute(a, v);
      else el.removeAttribute(a);
    }
    el.removeAttribute(ORIG_ATTR);
    el.removeAttribute(REVEALED_ATTR);
  }
}
