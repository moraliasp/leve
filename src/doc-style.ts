/**
 * Estilos do documento (Exibir › Estilo, `leve.style`): conjuntos de tokens `--md-*`/`--hl-*` (e
 * umas poucas regras) por cima da base GitHub de `src/markdown.css`, independentes do tema claro ou
 * escuro. GitHub é a própria base e não carrega nada; os outros vêm sob demanda de
 * `src/doc-styles/<id>.css` e valem por `data-style` no `<html>`. Cada arquivo declara o conjunto
 * claro em `:root[data-style="<id>"]` e o escuro em `:root[data-style="<id>"][data-theme="dark"]`,
 * com as mesmas cores nos dois (o escuro da base perderia para o claro do estilo; teste em
 * `tests/doc-style.test.ts`). Por quê, e como se combina com a fonte: docs/decisoes.md, "Estilos do
 * documento".
 */
export const DOC_STYLES = ["github", "editor", "terminal", "livro"] as const;
export type DocStyle = (typeof DOC_STYLES)[number];

const LOADERS: Record<Exclude<DocStyle, "github">, () => Promise<{ default: string }>> = {
  editor: () => import("./doc-styles/editor.css?inline"),
  terminal: () => import("./doc-styles/terminal.css?inline"),
  livro: () => import("./doc-styles/livro.css?inline"),
};

export function isDocStyle(v: unknown): v is DocStyle {
  return typeof v === "string" && (DOC_STYLES as readonly string[]).includes(v);
}

/** CSS do estilo, como está no arquivo; "" para o GitHub (a base já é ele). */
export async function styleCss(id: DocStyle): Promise<string> {
  return id === "github" ? "" : (await LOADERS[id]()).default;
}

/**
 * Para o HTML exportado, que não tem `data-style` nem `data-theme` no `<html>`: tira o
 * `[data-style="<id>"]` dos seletores, então o conjunto claro vale em `:root` e o escuro (que
 * ainda pede `data-theme="dark"`) fica inerte, como o escuro da base.
 */
export function styleForExport(css: string, id: DocStyle): string {
  return css.split(`[data-style="${id}"]`).join("");
}

let styleEl: HTMLStyleElement | null = null;
let applying = 0;

/**
 * Carrega e aplica; a última chamada vence se duas se cruzarem. O `data-style` só muda depois de o
 * CSS chegar, para não sobrar um meio-termo (atributo novo com as regras do estilo anterior).
 */
export async function applyDocStyle(id: DocStyle): Promise<void> {
  const n = ++applying;
  if (document.documentElement.dataset.style === id) return;
  const css = await styleCss(id);
  if (n !== applying) return;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "style-css";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;
  document.documentElement.dataset.style = id;
}
