/**
 * Painel da pasta aberta (Arquivo › Abrir pasta…), carregado só quando uma pasta abre: árvore dos
 * Markdown à esquerda do sumário, teclado do padrão ARIA de árvore (foco itinerante), sobreposição
 * em janela estreita. A decisão vive em `src/folder.ts`; aqui o desenho, o disco (pelo Rust) e
 * `leve.folder`. Por quê: docs/decisoes.md, "Abrir pasta: árvore lateral".
 */
import { invoke } from "@tauri-apps/api/core";
import "./folder.css";
import {
  type FolderList,
  type Row,
  ancestors,
  buildTree,
  parseSavedFolder,
  relIn,
  serializeFolder,
  treeKey,
  visibleRows,
} from "./folder";
import { t } from "./i18n";
import { icon } from "./icons";
import { FOLDER_KEY, readJson } from "./prefs";
import { applyTooltips, detectPlatform } from "./shortcuts";

/** O que o painel pede a `main.ts`. */
export interface FolderHost {
  isTauri: boolean;
  /** Abre o documento (caminho canônico) na aba ativa, ou em aba nova/existente com `newTab`. */
  open(path: string, newTab: boolean): Promise<unknown>;
  flash(msg: string, isError?: boolean): void;
  /** Caminho do documento ativo, para marcar na árvore. */
  currentPath(): string | null;
  /** O painel fechou (botão ou Arquivo › Fechar pasta). */
  onClose(): void;
}

export interface FolderPanel {
  readonly root: string;
  /** Lista do Rust já lida: nomes relativos para o abrir rápido. */
  readonly list: FolderList;
  /** Abre um Markdown da pasta pelo caminho relativo (árvore, abrir rápido). */
  openRel(rel: string, newTab: boolean): Promise<void>;
  setCurrent(path: string | null): void;
  refresh(): Promise<void>;
  /** Exibir › Pasta: mostra (e foca a árvore) ou esconde. */
  toggle(): void;
  close(): void;
}

/** Abaixo disso a árvore vira sobreposição (com o sumário fixo de 260 px, o texto não caberia). */
const NARROW = "(max-width: 959px)";

async function listFolder(root: string, isTauri: boolean): Promise<FolderList> {
  if (isTauri) return invoke<FolderList>("list_folder", { root });
  // Modo navegador: o servidor do Vite lista (plugin `leve-folder`, só em dev).
  const res = await fetch(`/@leve/folder?root=${encodeURIComponent(root)}`);
  if (!res.ok) throw new Error(`${root}: ${res.status}`);
  return (await res.json()) as FolderList;
}

/** Monta o painel para `root` (pasta concedida). Erro de leitura sobe para quem chamou. */
export async function mountFolder(root: string, host: FolderHost): Promise<FolderPanel> {
  let list = await listFolder(root, host.isTauri);
  root = list.root;
  const saved = parseSavedFolder(readJson<unknown>(FOLDER_KEY, null));
  const expanded = new Set(saved?.root === root ? saved.expanded : []);
  let tree = buildTree(list.files);
  let rows: Row[] = [];
  let currentRel: string | null = null;
  let focusPath: string | null = null;
  const narrow = window.matchMedia(NARROW);
  const body = document.body;

  const nav = document.createElement("nav");
  nav.id = "tree";
  nav.className = "tree";
  nav.setAttribute("aria-label", t("folder.label"));
  const head = document.createElement("div");
  head.className = "tree-head";
  const title = document.createElement("span");
  title.className = "tree-name";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "icon";
  closeBtn.title = t("folder.close");
  closeBtn.setAttribute("aria-label", t("folder.close"));
  closeBtn.innerHTML = icon("x", 14);
  head.append(title, closeBtn);
  const notice = document.createElement("p");
  notice.className = "tree-notice";
  const ul = document.createElement("ul");
  ul.setAttribute("role", "tree");
  nav.append(head, notice, ul);
  document.getElementById("body")?.prepend(nav);

  // Botão na barra, ao lado do sumário: só existe com pasta aberta.
  const btn = document.createElement("button");
  btn.id = "btn-tree";
  btn.className = "icon";
  btn.dataset.shortcut = "toggle-tree";
  btn.title = t("folder.toggle");
  btn.setAttribute("aria-label", t("folder.toggle"));
  btn.setAttribute("aria-controls", "tree");
  btn.innerHTML = icon("folder");
  document.getElementById("btn-toc")?.before(btn);
  applyTooltips(btn.parentElement ?? btn, detectPlatform());

  const save = (): void => {
    try {
      localStorage.setItem(FOLDER_KEY, serializeFolder(root, expanded));
    } catch (e) {
      // Armazenamento cheio ou bloqueado: a árvore funciona, só não volta na próxima abertura.
      console.warn("leve.folder:", e);
    }
  };

  const isOpen = (): boolean => (narrow.matches ? body.classList.contains("tree-peek") : !body.classList.contains("tree-hidden"));
  const syncAria = (): void => btn.setAttribute("aria-expanded", String(isOpen()));

  function render(): void {
    title.textContent = list.name;
    title.title = root;
    ul.setAttribute("aria-label", list.name);
    notice.hidden = !(list.truncated || list.files.length === 0);
    notice.textContent = list.files.length === 0 ? t("folder.empty") : t("folder.truncated", { n: list.files.length });
    rows = visibleRows(tree, expanded);
    if (focusPath === null || !rows.some((r) => r.path === focusPath)) {
      focusPath = rows.find((r) => r.path === currentRel)?.path ?? rows[0]?.path ?? null;
    }
    const hadFocus = nav.contains(document.activeElement) && document.activeElement !== closeBtn;
    ul.replaceChildren(
      ...rows.map((r) => {
        const li = document.createElement("li");
        li.setAttribute("role", "treeitem");
        li.dataset.path = r.path;
        li.setAttribute("aria-level", String(r.level));
        li.setAttribute("aria-setsize", String(r.setSize));
        li.setAttribute("aria-posinset", String(r.posInSet));
        li.tabIndex = r.path === focusPath ? 0 : -1;
        li.style.setProperty("--level", String(r.level - 1));
        li.className = r.kind;
        if (r.kind === "dir") {
          li.setAttribute("aria-expanded", String(r.expanded));
          li.innerHTML = icon("chevron-right", 14);
        } else {
          li.setAttribute("aria-selected", String(r.path === currentRel));
          if (r.path === currentRel) li.setAttribute("aria-current", "page");
        }
        const name = document.createElement("span");
        name.textContent = r.kind === "file" ? r.name.replace(/\.(md|markdown|mdown|mkd)$/i, "") : r.name;
        li.title = r.path;
        li.append(name);
        return li;
      }),
    );
    if (hadFocus) focusRow(focusPath);
    syncAria();
  }

  function focusRow(path: string | null): void {
    focusPath = path;
    for (const li of ul.children as HTMLCollectionOf<HTMLElement>) {
      const me = li.dataset.path === path;
      li.tabIndex = me ? 0 : -1;
      if (me) {
        li.focus({ preventScroll: true });
        li.scrollIntoView({ block: "nearest" });
      }
    }
  }

  function setExpanded(path: string, open: boolean): void {
    if (open) expanded.add(path);
    else expanded.delete(path);
    focusPath = path;
    save();
    render();
    focusRow(path);
  }

  async function openRel(rel: string, newTab: boolean): Promise<void> {
    try {
      const abs = host.isTauri ? await invoke<string>("open_in_folder", { root, rel }) : `${root.replace(/\/$/, "")}/${rel}`;
      await host.open(abs, newTab);
      // Sobreposição fecha ao escolher, como o sumário.
      if (narrow.matches) {
        body.classList.remove("tree-peek");
        syncAria();
      }
    } catch (e) {
      host.flash(String(e), true);
    }
  }

  ul.addEventListener("click", (ev) => {
    const li = (ev.target as HTMLElement).closest<HTMLElement>("li[role=treeitem]");
    const path = li?.dataset.path;
    if (!li || path === undefined) return;
    focusRow(path);
    if (li.classList.contains("dir")) setExpanded(path, !expanded.has(path));
    else void openRel(path, ev.metaKey || ev.ctrlKey);
  });
  ul.addEventListener("keydown", (ev) => {
    if (ev.altKey) return;
    // Tecla local do controle (como as setas das abas): não é atalho de menu.
    const mod = ev.metaKey || ev.ctrlKey;
    if (mod && ev.key !== "Enter") return;
    if (ev.key === "Escape" && narrow.matches) {
      ev.preventDefault();
      body.classList.remove("tree-peek");
      syncAria();
      document.getElementById("main")?.focus();
      return;
    }
    const move = treeKey(rows, rows.findIndex((r) => r.path === focusPath), ev.key);
    if (!move) return;
    ev.preventDefault();
    if ("focus" in move) focusRow(rows[move.focus]?.path ?? null);
    else if ("expand" in move) setExpanded(move.expand, true);
    else if ("collapse" in move) setExpanded(move.collapse, false);
    else void openRel(move.open, mod);
  });
  closeBtn.addEventListener("click", () => panel.close());
  btn.addEventListener("click", () => panel.toggle());
  // Sobreposição fecha ao tocar no documento ou ao voltar a janela larga.
  const closePeek = (): void => {
    body.classList.remove("tree-peek");
    syncAria();
  };
  const main = document.getElementById("main");
  main?.addEventListener("click", closePeek);
  narrow.addEventListener("change", closePeek);

  const panel: FolderPanel = {
    get root() {
      return root;
    },
    get list() {
      return list;
    },
    openRel,
    setCurrent(path) {
      const rel = path ? relIn(root, path) : null;
      if (rel === currentRel) return;
      currentRel = rel;
      if (rel) {
        for (const a of ancestors(rel)) expanded.add(a);
        focusPath = rel;
        save();
      }
      render();
      if (rel) ul.querySelector<HTMLElement>(`[aria-current="page"]`)?.scrollIntoView({ block: "nearest" });
    },
    async refresh() {
      try {
        list = await listFolder(root, host.isTauri);
      } catch (e) {
        host.flash(String(e), true);
        return;
      }
      tree = buildTree(list.files);
      render();
    },
    toggle() {
      if (narrow.matches) body.classList.toggle("tree-peek");
      else body.classList.toggle("tree-hidden");
      syncAria();
      if (isOpen()) focusRow(focusPath);
    },
    close() {
      nav.remove();
      btn.remove();
      body.classList.remove("tree-peek", "tree-hidden", "has-tree");
      main?.removeEventListener("click", closePeek);
      narrow.removeEventListener("change", closePeek);
      localStorage.removeItem(FOLDER_KEY);
      host.onClose();
    },
  };

  body.classList.add("has-tree");
  body.classList.remove("tree-hidden");
  save();
  panel.setCurrent(host.currentPath());
  render();
  return panel;
}
