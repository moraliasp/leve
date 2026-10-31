/**
 * Revisão para IA, a parte pura (o desenho está em `review-ui.ts`): cada anotação guarda o trecho
 * por citação, com um pouco de contexto de cada lado, nunca por posição, porque quem muda o arquivo
 * é a IA. A cada recarga a citação é procurada de novo; se sumiu, a anotação foi atendida.
 *
 * O texto vem dos nós de texto de `#content`, fora de Mermaid e fórmula: os dois trocam de texto
 * quando terminam de desenhar, e a citação tem de ser a mesma antes e depois.
 *
 * Tudo em memória: nada vai para o arquivo nem para o disco. Decisão em `docs/decisoes.md`.
 */

export interface Note {
  id: number;
  /** Citação como aparece no texto do documento, com os espaços reduzidos. */
  quote: string;
  /** Contexto de cada lado, para escolher entre citações repetidas. */
  before: string;
  after: string;
  /** A citação aparecia mais de uma vez ao anotar: só o contexto diz qual delas é. */
  repeated: boolean;
  /** Citação como o leitor a viu (entre blocos há quebra; em `quote`, não). */
  shown: string;
  /** Título mais próximo acima do trecho, vazio se não houver. */
  heading: string;
  comment: string;
  /** A citação sumiu do documento. */
  resolved: boolean;
}

/** Texto do documento, com os nós de onde cada pedaço veio. */
export interface TextIndex {
  raw: string;
  nodes: Text[];
  /** Início de cada nó em `raw`. */
  starts: number[];
}

/** Trecho em `Collapsed.text`: `[start, end)`. */
export interface Span {
  start: number;
  end: number;
}

interface Collapsed {
  text: string;
  /** Para cada caractere de `text`, a posição em `raw`; o último item é o fim. */
  map: Int32Array;
}

const CONTEXT = 32;
/** Contexto igual mínimo para citação repetida: abaixo disso é outra ocorrência, não a anotada. */
const MIN_CONTEXT = 12;
const SKIP = "script, style, svg, .code-tools, .img-remote, .math, pre.mermaid";

export function textIndex(root: Node): TextIndex {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  const starts: number[] = [];
  let raw = "";
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push(n as Text);
    starts.push(raw.length);
    raw += n.nodeValue ?? "";
  }
  return { raw, nodes, starts };
}

/** Sequências de espaço viram um: parágrafo reflowado desenha igual e não mudou para quem lê. */
export function collapse(raw: string): Collapsed {
  const map = new Int32Array(raw.length + 1);
  let text = "";
  let space = false;
  for (let i = 0; i < raw.length; i++) {
    const isSpace = /\s/.test(raw[i]);
    if (isSpace && space) continue;
    map[text.length] = i;
    text += isSpace ? " " : raw[i];
    space = isSpace;
  }
  map[text.length] = raw.length;
  return { text, map: map.subarray(0, text.length + 1) };
}

const tidy = (s: string): string => collapse(s).text.trim();

function sharedPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function sharedSuffix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

/** Onde a citação está em `text`. Repetida, vale a que tiver mais contexto igual; sumiu, `null`. */
export function locate(text: string, note: Pick<Note, "quote" | "before" | "after" | "repeated">): Span | null {
  const { quote, before, after, repeated } = note;
  if (!quote) return null;
  let best: Span | null = null;
  let bestScore = -1;
  for (let i = text.indexOf(quote); i !== -1; i = text.indexOf(quote, i + 1)) {
    const end = i + quote.length;
    const score = sharedSuffix(text.slice(Math.max(0, i - before.length), i), before) + sharedPrefix(text.slice(end, end + after.length), after);
    if (score > bestScore) {
      best = { start: i, end };
      bestScore = score;
    }
  }
  return repeated && bestScore < MIN_CONTEXT ? null : best;
}

/** Título mais próximo acima de `node`, na ordem do documento. */
function headingAbove(root: Element, node: Node): string {
  let found = "";
  for (const h of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    if (!(h.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
    found = h.textContent ?? "";
  }
  return tidy(found);
}

/** Texto da seleção, sem o que a citação também ignora (rótulo de código, Mermaid, fórmula). */
function shownText(range: Range): string {
  const copy = range.cloneContents();
  copy.querySelectorAll(SKIP).forEach((el) => el.remove());
  return tidy(copy.textContent ?? "");
}

/** Lê a seleção como anotação sem comentário, ou `null` se ela não pegou texto do documento. */
export function captureNote(root: Element, range: Range, id: number): Note | null {
  const { raw, nodes, starts } = textIndex(root);
  let start = -1;
  let end = -1;
  let first: Text | null = null;
  nodes.forEach((n, i) => {
    if (!range.intersectsNode(n)) return;
    const from = n === range.startContainer ? range.startOffset : 0;
    const to = n === range.endContainer ? range.endOffset : n.length;
    if (to <= from) return;
    if (start < 0) {
      start = starts[i] + from;
      first = n;
    }
    end = starts[i] + to;
  });
  if (start < 0 || !first) return null;
  const quote = tidy(raw.slice(start, end));
  if (!quote) return null;
  const { text } = collapse(raw);
  return {
    id,
    quote,
    repeated: text.indexOf(quote) !== text.lastIndexOf(quote),
    before: collapse(raw.slice(Math.max(0, start - CONTEXT * 4), start)).text.slice(-CONTEXT),
    after: collapse(raw.slice(end, end + CONTEXT * 4)).text.slice(0, CONTEXT),
    shown: shownText(range) || quote,
    heading: headingAbove(root, first),
    comment: "",
    resolved: false,
  };
}

/** Os trechos do documento em que está cada anotação; `null` onde a citação sumiu. */
export function locateAll(index: TextIndex, notes: readonly Note[]): (Range | null)[] {
  if (notes.length === 0) return [];
  const { text, map } = collapse(index.raw);
  return notes.map((note) => {
    const span = locate(text, note);
    return span && rangeAt(index, map[span.start], map[span.end - 1] + 1);
  });
}

/** Range de `[start, end)` em `raw`. */
function rangeAt({ nodes, starts }: TextIndex, start: number, end: number): Range {
  const nodeAt = (pos: number): number => {
    let lo = 0;
    let hi = nodes.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const a = nodeAt(start);
  const b = nodeAt(end - 1);
  const r = document.createRange();
  r.setStart(nodes[a], start - starts[a]);
  r.setEnd(nodes[b], end - starts[b]);
  return r;
}

export interface ReviewLabels {
  title(source: string, count: number): string;
  section(heading: string): string;
  excerpt: string;
}

/** O que vai para a área de transferência: as anotações em aberto, em Markdown. */
export function formatReview(source: string, notes: readonly Note[], labels: ReviewLabels): string {
  const open = notes.filter((n) => !n.resolved);
  const blocks = open.map((n, i) => {
    const where = n.heading ? labels.section(n.heading) : labels.excerpt;
    const comment = n.comment.trim().replace(/\r?\n/g, "\n   ");
    return `${i + 1}. ${where}\n   > ${n.shown}\n   ${comment}`;
  });
  return [labels.title(source, open.length), ...blocks].join("\n\n") + "\n";
}
