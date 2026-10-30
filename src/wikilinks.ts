import type { MarkdownIt, StateInline } from "markdown-it";
import { t as tr } from "./i18n";

/** Extensões de Markdown reconhecidas em links internos. */
export const MD_EXT = /\.(md|markdown|mdown|mkd)$/i;

export interface Wikilink {
  /** Nome da nota (sem `.md`, pode ter subpasta). Vazio em `[[#Título]]`. */
  target: string;
  /** Título dentro da nota (`[[nota#Título]]`). Vazio quando ausente. */
  hash: string;
  /** Texto exibido: o alias após `|`, ou o alvo. */
  label: string;
  /** Caminho relativo que o link representa (`nota.md`), ou "" para o próprio documento. */
  file: string;
}

/** Interpreta o miolo de `[[...]]`: `alvo`, `alvo|rótulo`, `alvo#título`, `#título`. */
export function parseWikilink(inner: string): Wikilink | null {
  const pipe = inner.indexOf("|");
  const ref = (pipe < 0 ? inner : inner.slice(0, pipe)).trim();
  const alias = pipe < 0 ? "" : inner.slice(pipe + 1).trim();
  const sharp = ref.indexOf("#");
  const target = (sharp < 0 ? ref : ref.slice(0, sharp)).trim();
  const hash = sharp < 0 ? "" : ref.slice(sharp + 1).trim();
  if (!target && !hash) return null;
  const label = alias || (target && hash ? `${target} › ${hash}` : target || hash);
  const file = target ? (MD_EXT.test(target) ? target : `${target}.md`) : "";
  return { target, hash, label, file };
}

const BRACKET = 0x5b; // [
const BANG = 0x21; // !

function wikilinkRule(state: StateInline, silent: boolean): boolean {
  const { src, pos, posMax } = state;
  if (src.charCodeAt(pos) !== BRACKET || src.charCodeAt(pos + 1) !== BRACKET) return false;
  // `![[x]]` é embed (fora de escopo): fica como texto.
  if (pos > 0 && src.charCodeAt(pos - 1) === BANG) return false;
  const end = src.indexOf("]]", pos + 2);
  if (end < 0 || end + 2 > posMax) return false;
  const inner = src.slice(pos + 2, end);
  if (/[[\]\n]/.test(inner)) return false;
  const link = parseWikilink(inner);
  if (!link) return false;
  if (!silent) {
    const href = link.hash ? `${link.file}#${link.hash}` : link.file;
    const open = state.push("link_open", "a", 1);
    open.attrs = [
      ["href", href],
      ["class", "wikilink"],
      ["data-target", link.target],
      ["data-hash", link.hash],
    ];
    open.markup = "[[";
    open.info = "wikilink";
    const text = state.push("text", "", 0);
    text.content = link.label;
    state.push("link_close", "a", -1);
  }
  state.pos = end + 2;
  return true;
}

/** Plugin markdown-it: `[[nota]]` vira `<a class="wikilink" data-target="nota">`. */
export function wikilinks(md: MarkdownIt): void {
  md.inline.ruler.before("link", "wikilink", wikilinkRule);
}

/** Alvos únicos dos wikilinks do documento (sem os `[[#título]]` do próprio arquivo). */
export function collectWikilinkTargets(container: HTMLElement): string[] {
  const out = new Set<string>();
  for (const a of container.querySelectorAll<HTMLAnchorElement>("a.wikilink[data-target]")) {
    if (a.dataset.target) out.add(a.dataset.target);
  }
  return [...out];
}

/**
 * Aplica o resultado da resolução: caminho absoluto em `data-path`, ou classe `missing`. Pode rodar
 * de novo sobre o mesmo documento (a pasta aberta depois resolve o que antes faltava).
 */
export function markWikilinks(container: HTMLElement, resolved: Record<string, string | null>): void {
  for (const a of container.querySelectorAll<HTMLAnchorElement>("a.wikilink[data-target]")) {
    const t = a.dataset.target;
    if (!t) continue;
    const abs = resolved[t];
    if (abs) {
      a.dataset.path = abs;
      a.title = abs;
      a.classList.remove("missing");
    } else {
      delete a.dataset.path;
      a.classList.add("missing");
      a.title = tr("doc.noteNotFound", { name: t });
    }
  }
}
