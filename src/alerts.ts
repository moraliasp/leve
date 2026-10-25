import type { MarkdownIt, StateCore } from "markdown-it";
import { t, type Key } from "./i18n";

/** Cinco tipos canônicos do GitHub; callouts Obsidian são mapeados para eles. */
type Kind = "note" | "tip" | "important" | "warning" | "caution";

const LABEL: Record<Kind, Key> = {
  note: "alert.note",
  tip: "alert.tip",
  important: "alert.important",
  warning: "alert.warning",
  caution: "alert.caution",
};

const ALIAS: Record<string, Kind> = {
  note: "note",
  info: "note",
  todo: "note",
  abstract: "note",
  summary: "note",
  tldr: "note",
  example: "note",
  quote: "note",
  cite: "note",
  tip: "tip",
  hint: "tip",
  success: "tip",
  check: "tip",
  done: "tip",
  important: "important",
  question: "important",
  help: "important",
  faq: "important",
  warning: "warning",
  attention: "warning",
  caution: "caution",
  failure: "caution",
  fail: "caution",
  missing: "caution",
  danger: "caution",
  error: "caution",
  bug: "caution",
};

const MARKER = /^\[!([a-zA-Z]+)\]([+-]?)[ \t]*([^\n]*)\n?/;

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Transforma `> [!TIPO] Título` (GitHub alerts e callouts Obsidian) em
 * `<div class="alert alert-tipo">` — ou `<details>` quando o marcador termina em
 * `+`/`-` (Obsidian colapsável). Roda depois do parse de blocos, antes do inline.
 */
function alertsRule(state: StateCore): void {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i].type !== "blockquote_open") continue;
    if (tokens[i + 1].type !== "paragraph_open" || tokens[i + 2].type !== "inline") continue;
    const inline = tokens[i + 2];
    const m = MARKER.exec(inline.content);
    if (!m) continue;
    const kind = ALIAS[m[1].toLowerCase()];
    if (!kind) continue;

    const fold = m[2];
    const title = m[3].trim() || t(LABEL[kind]);
    const rest = inline.content.slice(m[0].length);

    const open = tokens[i];
    const closeIdx = findClose(tokens, i);
    if (closeIdx === -1) continue;
    const close = tokens[closeIdx];

    const collapsible = fold !== "";
    open.tag = collapsible ? "details" : "div";
    close.tag = open.tag;
    open.attrJoin("class", `alert alert-${kind}`);
    if (fold === "+") open.attrSet("open", "");

    const titleTag = collapsible ? "summary" : "p";
    const titleTok = new state.Token("html_block", "", 0);
    titleTok.content = `<${titleTag} class="alert-title">${escapeHtml(title)}</${titleTag}>\n`;
    titleTok.level = open.level + 1;

    if (rest.trim() === "") {
      // Só o marcador: remove o parágrafo vazio.
      tokens.splice(i + 1, 3, titleTok);
    } else {
      inline.content = rest;
      tokens.splice(i + 1, 0, titleTok);
    }
  }
}

function findClose(tokens: StateCore["tokens"], openIdx: number): number {
  let depth = 0;
  for (let j = openIdx; j < tokens.length; j++) {
    if (tokens[j].type === "blockquote_open") depth++;
    else if (tokens[j].type === "blockquote_close" && --depth === 0) return j;
  }
  return -1;
}

export default function alerts(md: MarkdownIt): void {
  md.core.ruler.after("block", "alerts", alertsRule);
}
