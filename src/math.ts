import type { MarkdownIt, StateBlock, StateInline } from "markdown-it";
import { escapeHtml } from "./html";

const DOLLAR = 0x24;
const BACKSLASH = 0x5c;

const isSpace = (c: number): boolean => c === 0x20 || c === 0x09 || c === 0x0a;
const isDigit = (c: number): boolean => c >= 0x30 && c <= 0x39;

/**
 * `$...$` inline, regra do Pandoc: abre se não vier espaço depois do `$`; fecha se não
 * houver espaço antes nem dígito depois. "custa $5 e $10" continua texto.
 */
function mathInline(state: StateInline, silent: boolean): boolean {
  const { src, pos, posMax } = state;
  if (src.charCodeAt(pos) !== DOLLAR) return false;
  if (pos > 0 && src.charCodeAt(pos - 1) === BACKSLASH) return false;
  const next = src.charCodeAt(pos + 1);
  if (next === DOLLAR || isSpace(next) || pos + 1 >= posMax) return false;
  let end = pos + 1;
  for (;;) {
    end = src.indexOf("$", end);
    if (end < 0 || end >= posMax) return false;
    const prev = src.charCodeAt(end - 1);
    const after = src.charCodeAt(end + 1);
    if (prev === BACKSLASH || isSpace(prev) || isDigit(after)) {
      end += 1;
      continue;
    }
    break;
  }
  if (!silent) {
    const t = state.push("math_inline", "math", 0);
    t.markup = "$";
    t.content = src.slice(pos + 1, end);
  }
  state.pos = end + 1;
  return true;
}

/** Bloco `$$ ... $$`, em uma linha ou várias; fecha na linha que termina com `$$`. */
function mathBlock(state: StateBlock, start: number, end: number, silent: boolean): boolean {
  let pos = state.bMarks[start] + state.tShift[start];
  let max = state.eMarks[start];
  if (state.sCount[start] - state.blkIndent >= 4) return false;
  if (pos + 2 > max || state.src.slice(pos, pos + 2) !== "$$") return false;
  if (silent) return true;
  pos += 2;
  const first = state.src.slice(pos, max).trim();
  let next = start + 1;
  let content: string;
  if (first.length >= 2 && first.endsWith("$$")) {
    content = first.slice(0, -2).trim();
  } else {
    const lines: string[] = first ? [first] : [];
    for (; next < end; next++) {
      pos = state.bMarks[next] + state.tShift[next];
      max = state.eMarks[next];
      if (pos < max && state.sCount[next] < state.blkIndent) break;
      const line = state.src.slice(state.bMarks[next], max);
      const close = line.trimEnd().endsWith("$$");
      lines.push(close ? line.slice(0, line.lastIndexOf("$$")) : line);
      if (close) {
        next += 1;
        break;
      }
    }
    content = lines.join("\n").trim();
  }
  state.line = next;
  const t = state.push("math_block", "math", 0);
  t.block = true;
  t.markup = "$$";
  t.content = content;
  t.map = [start, next];
  return true;
}

/**
 * Plugin markdown-it: emite a fonte TeX em `.math` (inline ou bloco) sem depender do KaTeX;
 * `renderMath` carrega a lib só quando o documento tem fórmula.
 */
export function math(md: MarkdownIt): void {
  md.inline.ruler.before("escape", "math_inline", mathInline);
  md.block.ruler.after("blockquote", "math_block", mathBlock, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  md.renderer.rules.math_inline = (tokens, i) =>
    `<span class="math math-inline">${escapeHtml(tokens[i].content)}</span>`;
  md.renderer.rules.math_block = (tokens, i) =>
    `<div class="math math-block">${escapeHtml(tokens[i].content)}</div>\n`;
}

/** Renderiza `.math` com KaTeX sob demanda. Erro de sintaxe vira a fonte em vermelho (CSS `.katex-error`). */
export async function renderMath(container: HTMLElement): Promise<void> {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(".math:not([data-rendered])"));
  if (nodes.length === 0) return;
  const [{ default: katex }] = await Promise.all([import("katex"), import("katex/dist/katex.min.css")]);
  const errorColor = getComputedStyle(document.documentElement).getPropertyValue("--error").trim() || "#cc0000";
  for (const n of nodes) {
    const src = n.textContent ?? "";
    n.dataset.src = src;
    n.dataset.rendered = "1";
    katex.render(src, n, {
      displayMode: n.classList.contains("math-block"),
      throwOnError: false,
      errorColor,
      strict: "ignore",
    });
  }
}
