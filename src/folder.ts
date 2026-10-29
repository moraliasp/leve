/**
 * Pasta aberta (Arquivo › Abrir pasta…): estado da árvore, sem efeito (sem DOM, sem `invoke`, sem
 * localStorage), como `src/tabs.ts`. `folder-ui.ts` desenha, lê o disco pelo Rust e grava; aqui só a
 * decisão: a árvore a partir da lista do Rust, as linhas visíveis, o que cada tecla faz e o que vai
 * para `leve.folder`. Por quê: docs/decisoes.md, "Abrir pasta: árvore lateral".
 */

/** O que `list_folder` devolve: Markdown relativos à raiz, com `/`, e se algum limite cortou. */
export interface FolderList {
  root: string;
  name: string;
  files: string[];
  truncated: boolean;
}

export interface TreeFile {
  kind: "file";
  name: string;
  /** Caminho relativo à raiz, com `/`. */
  path: string;
}

export interface TreeDir {
  kind: "dir";
  name: string;
  /** Caminho relativo à raiz, com `/`; a raiz é "". */
  path: string;
  dirs: TreeDir[];
  files: TreeFile[];
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const byName = (a: { name: string }, b: { name: string }): number => collator.compare(a.name, b.name);

/** Árvore da lista plana: pastas antes de arquivos, cada grupo em ordem de nome (10 depois de 9). */
export function buildTree(files: readonly string[]): TreeDir {
  const root: TreeDir = { kind: "dir", name: "", path: "", dirs: [], files: [] };
  for (const file of files) {
    const parts = file.split("/").filter(Boolean);
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      const path = dir.path ? `${dir.path}/${part}` : part;
      let next = dir.dirs.find((d) => d.name === part);
      if (!next) {
        next = { kind: "dir", name: part, path, dirs: [], files: [] };
        dir.dirs.push(next);
      }
      dir = next;
    }
    const name = parts[parts.length - 1];
    if (name) dir.files.push({ kind: "file", name, path: parts.join("/") });
  }
  const sort = (d: TreeDir): void => {
    d.dirs.sort(byName);
    d.files.sort(byName);
    d.dirs.forEach(sort);
  };
  sort(root);
  return root;
}

/** Uma linha da árvore desenhada (`role="treeitem"` com `aria-level`, `-setsize`, `-posinset`). */
export interface Row {
  kind: "dir" | "file";
  name: string;
  path: string;
  /** 1 no topo, como `aria-level`. */
  level: number;
  expanded: boolean;
  setSize: number;
  posInSet: number;
}

/** Linhas visíveis: a raiz não aparece; pasta só mostra o conteúdo se estiver em `expanded`. */
export function visibleRows(tree: TreeDir, expanded: ReadonlySet<string>): Row[] {
  const rows: Row[] = [];
  const walk = (d: TreeDir, level: number): void => {
    const kids = [...d.dirs, ...d.files];
    kids.forEach((k, i) => {
      const open = k.kind === "dir" && expanded.has(k.path);
      rows.push({ kind: k.kind, name: k.name, path: k.path, level, expanded: open, setSize: kids.length, posInSet: i + 1 });
      if (open) walk(k as TreeDir, level + 1);
    });
  };
  walk(tree, 1);
  return rows;
}

/** O que uma tecla faz na árvore (padrão ARIA de árvore). `null`: a tecla não é da árvore. */
export type TreeMove =
  | { focus: number }
  | { expand: string }
  | { collapse: string }
  | { open: string };

export function treeKey(rows: readonly Row[], i: number, key: string): TreeMove | null {
  const row = rows[i];
  if (!row) return rows.length > 0 && (key === "ArrowDown" || key === "Home") ? { focus: 0 } : null;
  switch (key) {
    case "ArrowDown":
      return { focus: Math.min(i + 1, rows.length - 1) };
    case "ArrowUp":
      return { focus: Math.max(i - 1, 0) };
    case "Home":
      return { focus: 0 };
    case "End":
      return { focus: rows.length - 1 };
    case "ArrowRight":
      if (row.kind !== "dir") return null;
      if (!row.expanded) return { expand: row.path };
      // Aberta: vai ao primeiro filho, se houver.
      return rows[i + 1]?.level === row.level + 1 ? { focus: i + 1 } : null;
    case "ArrowLeft": {
      if (row.kind === "dir" && row.expanded) return { collapse: row.path };
      for (let j = i - 1; j >= 0; j--) if (rows[j].level === row.level - 1) return { focus: j };
      return null;
    }
    case "Enter":
    case " ":
      if (row.kind === "file") return { open: row.path };
      return row.expanded ? { collapse: row.path } : { expand: row.path };
    default:
      return null;
  }
}

/** Pastas que contêm `rel` ("a/b/c.md" → ["a", "a/b"]): abertas para mostrar o documento atual. */
export function ancestors(rel: string): string[] {
  const parts = rel.split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

/**
 * Caminho de `path` relativo a `root`, com `/`, ou `null` se estiver fora. Os dois vêm do Rust em
 * forma canônica; no Windows com `\`, então a comparação normaliza o separador.
 */
export function relIn(root: string, path: string): string | null {
  const norm = (p: string): string => p.replace(/\\/g, "/").replace(/\/+$/, "");
  // Raiz do disco ("/") vira "" e o prefixo fica "/".
  const r = norm(root);
  const p = norm(path);
  if (!p.startsWith(`${r}/`)) return null;
  return p.slice(r.length + 1) || null;
}

// ---------- `leve.folder` ----------

export interface SavedFolder {
  root: string;
  /** Pastas abertas na árvore, relativas à raiz. */
  expanded: string[];
}

/** O que vai para `leve.folder`: `{"root":"...","expanded":[...]}`. */
export function serializeFolder(root: string, expanded: Iterable<string>): string {
  return JSON.stringify({ root, expanded: [...expanded] });
}

/** Lê `leve.folder`, tolerante a lixo: sem raiz de texto, `null`; `expanded` só com textos. */
export function parseSavedFolder(saved: unknown): SavedFolder | null {
  if (typeof saved !== "object" || saved === null) return null;
  const s = saved as { root?: unknown; expanded?: unknown };
  if (typeof s.root !== "string" || !s.root) return null;
  const expanded = Array.isArray(s.expanded) ? s.expanded.filter((p): p is string => typeof p === "string") : [];
  return { root: s.root, expanded };
}
