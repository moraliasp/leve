import { beforeEach, describe, expect, it } from "vitest";
import { FOLDER_KEY, PREF_KEYS, savedFolderRoot } from "../src/prefs";
import {
  ancestors,
  buildTree,
  parseSavedFolder,
  relIn,
  serializeFolder,
  treeKey,
  visibleRows,
  type Row,
} from "../src/folder";

const FILES = ["b.md", "A.md", "guia/10-fim.md", "guia/9-meio.md", "guia/sub/fundo.md", "arquivo/x.md", "README.md"];

const names = (rows: Row[]): string[] => rows.map((r) => `${"  ".repeat(r.level - 1)}${r.name}`);

describe("árvore da pasta", () => {
  it("pastas antes de arquivos, nome sem caixa e número em ordem natural", () => {
    const tree = buildTree(FILES);
    expect(tree.dirs.map((d) => d.name)).toEqual(["arquivo", "guia"]);
    expect(tree.files.map((f) => f.name)).toEqual(["A.md", "b.md", "README.md"]);
    const guia = tree.dirs[1];
    expect(guia.path).toBe("guia");
    expect(guia.files.map((f) => f.path)).toEqual(["guia/9-meio.md", "guia/10-fim.md"]);
    expect(guia.dirs[0].path).toBe("guia/sub");
  });

  it("linhas visíveis mostram só o conteúdo das pastas abertas, com nível e posição", () => {
    const tree = buildTree(FILES);
    expect(names(visibleRows(tree, new Set()))).toEqual(["arquivo", "guia", "A.md", "b.md", "README.md"]);
    const rows = visibleRows(tree, new Set(["guia", "guia/sub"]));
    expect(names(rows)).toEqual(["arquivo", "guia", "  sub", "    fundo.md", "  9-meio.md", "  10-fim.md", "A.md", "b.md", "README.md"]);
    expect(rows[1]).toMatchObject({ kind: "dir", expanded: true, level: 1, setSize: 5, posInSet: 2 });
    expect(rows[4]).toMatchObject({ kind: "file", level: 2, setSize: 3, posInSet: 2 });
    // Pasta aberta dentro de pasta fechada não aparece.
    expect(names(visibleRows(tree, new Set(["guia/sub"])))).toEqual(["arquivo", "guia", "A.md", "b.md", "README.md"]);
  });

  it("lista vazia: árvore sem linhas", () => {
    expect(visibleRows(buildTree([]), new Set())).toEqual([]);
  });
});

describe("teclado da árvore (padrão ARIA)", () => {
  const rows = visibleRows(buildTree(FILES), new Set(["guia"]));
  // arquivo, guia, ·sub, ·9-meio, ·10-fim, A, b, README
  it("setas, Home e End movem o foco sem dar a volta", () => {
    expect(treeKey(rows, 0, "ArrowDown")).toEqual({ focus: 1 });
    expect(treeKey(rows, 0, "ArrowUp")).toEqual({ focus: 0 });
    expect(treeKey(rows, rows.length - 1, "ArrowDown")).toEqual({ focus: rows.length - 1 });
    expect(treeKey(rows, 3, "Home")).toEqual({ focus: 0 });
    expect(treeKey(rows, 3, "End")).toEqual({ focus: rows.length - 1 });
  });

  it("direita abre a pasta fechada e, aberta, desce ao primeiro filho", () => {
    expect(treeKey(rows, 0, "ArrowRight")).toEqual({ expand: "arquivo" });
    expect(treeKey(rows, 1, "ArrowRight")).toEqual({ focus: 2 });
    expect(treeKey(rows, 3, "ArrowRight")).toBeNull();
  });

  it("esquerda fecha a pasta aberta ou sobe à pasta-mãe", () => {
    expect(treeKey(rows, 1, "ArrowLeft")).toEqual({ collapse: "guia" });
    expect(treeKey(rows, 4, "ArrowLeft")).toEqual({ focus: 1 });
    expect(treeKey(rows, 0, "ArrowLeft")).toBeNull();
  });

  it("Enter e espaço abrem arquivo ou alternam pasta", () => {
    expect(treeKey(rows, 3, "Enter")).toEqual({ open: "guia/9-meio.md" });
    expect(treeKey(rows, 1, " ")).toEqual({ collapse: "guia" });
    expect(treeKey(rows, 0, "Enter")).toEqual({ expand: "arquivo" });
    expect(treeKey(rows, 0, "a")).toBeNull();
  });

  it("sem linha focada, seta para baixo vai à primeira", () => {
    expect(treeKey(rows, -1, "ArrowDown")).toEqual({ focus: 0 });
    expect(treeKey([], -1, "ArrowDown")).toBeNull();
  });
});

describe("caminhos", () => {
  it("ancestors devolve as pastas a abrir para mostrar o arquivo", () => {
    expect(ancestors("a/b/c.md")).toEqual(["a", "a/b"]);
    expect(ancestors("c.md")).toEqual([]);
  });

  it("relIn: dentro da raiz vira relativo com /, fora é null", () => {
    expect(relIn("/x/docs", "/x/docs/a/b.md")).toBe("a/b.md");
    expect(relIn("/x/docs/", "/x/docs/a.md")).toBe("a.md");
    expect(relIn("/x/docs", "/x/docs-2/a.md")).toBeNull();
    expect(relIn("/x/docs", "/x/outra.md")).toBeNull();
    expect(relIn("/x/docs", "/x/docs")).toBeNull();
    expect(relIn("C:\\x\\docs", "C:\\x\\docs\\sub\\a.md")).toBe("sub/a.md");
    expect(relIn("/", "/docs/a.md")).toBe("docs/a.md");
    expect(relIn("C:\\", "C:\\a.md")).toBe("a.md");
  });
});

describe("leve.folder", () => {
  it("ida e volta", () => {
    const s = serializeFolder("/x/docs", new Set(["guia", "guia/sub"]));
    expect(s).toBe('{"root":"/x/docs","expanded":["guia","guia/sub"]}');
    expect(parseSavedFolder(JSON.parse(s))).toEqual({ root: "/x/docs", expanded: ["guia", "guia/sub"] });
  });

  it("tolerante a lixo", () => {
    expect(parseSavedFolder(null)).toBeNull();
    expect(parseSavedFolder("x")).toBeNull();
    expect(parseSavedFolder({ root: "" })).toBeNull();
    expect(parseSavedFolder({ root: 3 })).toBeNull();
    expect(parseSavedFolder({ root: "/a", expanded: ["b", 2, null] })).toEqual({ root: "/a", expanded: ["b"] });
    expect(parseSavedFolder({ root: "/a" })).toEqual({ root: "/a", expanded: [] });
  });
});

describe("savedFolderRoot", () => {
  beforeEach(() => localStorage.clear());

  it("lê a raiz de leve.folder e obedece a Reabrir abas ao iniciar", () => {
    expect(savedFolderRoot()).toBeNull();
    localStorage.setItem(FOLDER_KEY, serializeFolder("/x/docs", []));
    expect(savedFolderRoot()).toBe("/x/docs");
    localStorage.setItem(PREF_KEYS.restoreTabs, "0");
    expect(savedFolderRoot()).toBeNull();
  });

  it("lixo vira null", () => {
    localStorage.setItem(FOLDER_KEY, "{");
    expect(savedFolderRoot()).toBeNull();
    localStorage.setItem(FOLDER_KEY, '{"root":7}');
    expect(savedFolderRoot()).toBeNull();
  });
});
