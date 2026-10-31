/**
 * Recentes no estado vazio: lista com remoção e limpeza (os dados estão em `recent.ts`). `main.ts`
 * empresta a abertura e diz se há documento na tela: com documento, a lista não aparece.
 */
import { invoke } from "@tauri-apps/api/core";
import { confirmDialog } from "./dialog";
import { $ } from "./dom";
import { t } from "./i18n";
import { icon } from "./icons";
import { clearRecent, isFolderEntry, readRecent, removeRecent, splitPath } from "./recent";

export interface RecentHost {
  tauri: boolean;
  flash(msg: string, isError?: boolean, sticky?: boolean): void;
  hasDoc(): boolean;
  open(path: string): void;
  openFolder(root: string): void;
}

/** Quais dos caminhos ainda existem. No navegador, HEAD no servidor do Vite; no app, o Rust confere. */
async function pathsExist(h: RecentHost, paths: string[]): Promise<boolean[]> {
  if (h.tauri) return invoke<boolean[]>("paths_exist", { paths });
  return Promise.all(
    paths.map(async (p) => {
      try {
        const res = await fetch(p, { method: "HEAD" });
        return res.ok && !(res.headers.get("content-type") ?? "").includes("text/html");
      } catch {
        return false;
      }
    }),
  );
}

export function renderRecent(h: RecentHost): void {
  const box = $("recent");
  const recent = readRecent();
  box.replaceChildren();
  if (recent.length === 0) return;
  const head = document.createElement("div");
  head.className = "recent-head";
  const title = document.createElement("h2");
  title.id = "recent-title";
  title.textContent = t("recent.title");
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "link recent-clear";
  clear.textContent = t("recent.clear");
  clear.title = t("recent.clearLabel");
  clear.setAttribute("aria-label", t("recent.clearLabel"));
  clear.addEventListener("click", () => void askClearRecent(h));
  head.append(title, clear);
  box.appendChild(head);
  const ul = document.createElement("ul");
  ul.setAttribute("aria-labelledby", "recent-title");
  const items: { li: HTMLLIElement; open: HTMLButtonElement; path: string }[] = [];
  for (const p of recent) {
    const li = document.createElement("li");
    const { name, dir } = splitPath(p);
    const isFolder = isFolderEntry(p);
    const open = document.createElement("button");
    open.type = "button";
    open.className = "recent-item";
    open.title = p;
    open.innerHTML = `<strong>${isFolder ? icon("folder", 14) : ""}</strong><span></span>`;
    (open.firstElementChild as HTMLElement).append(name);
    (open.lastElementChild as HTMLElement).textContent = dir;
    open.addEventListener("click", () => {
      // Arquivo que sumiu: o clique tira da lista em vez de abrir e falhar.
      if (li.classList.contains("missing")) forgetRecent(h, p);
      else if (isFolder) h.openFolder(p.slice(0, -1));
      else h.open(p);
    });
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "icon recent-remove";
    rm.title = t("recent.remove");
    rm.setAttribute("aria-label", t("recent.removeNamed", { name }));
    rm.innerHTML = icon("x", 14);
    rm.addEventListener("click", (ev) => {
      ev.stopPropagation();
      forgetRecent(h, p);
    });
    li.append(open, rm);
    ul.appendChild(li);
    items.push({ li, open, path: p });
  }
  box.appendChild(ul);
  // Existência conferida depois: a lista aparece já, e o que sumiu fica apagado.
  void pathsExist(h, items.map((i) => i.path))
    .then((exists) => {
      if (!ul.isConnected) return;
      items.forEach(({ li, open, path }, i) => {
        if (exists[i]) return;
        li.classList.add("missing");
        open.title = t("recent.missing", { path });
        open.setAttribute("aria-label", t("recent.missingLabel", { name: splitPath(path).name }));
      });
    })
    .catch((e) => console.warn("recentes:", e));
}

/** Tira da lista e, no estado vazio, redesenha mantendo o foco de teclado na vizinhança. */
function forgetRecent(h: RecentHost, path: string): void {
  const box = $("recent");
  const idx = readRecent().indexOf(path);
  const hadFocus = box.contains(document.activeElement);
  removeRecent(path);
  if (h.hasDoc()) return;
  renderRecent(h);
  if (!hadFocus) return;
  const items = box.querySelectorAll<HTMLButtonElement>(".recent-item");
  const next = items[Math.min(Math.max(idx, 0), items.length - 1)] ?? $("empty-open");
  next.focus({ preventScroll: true });
}

export async function askClearRecent(h: RecentHost): Promise<void> {
  if (readRecent().length === 0) {
    h.flash(t("recent.none"));
    return;
  }
  const ok = await confirmDialog(t("recent.confirmTitle"), t("recent.confirmText"), t("recent.clear"));
  if (!ok) return;
  clearRecent();
  if (!h.hasDoc()) renderRecent(h);
  h.flash(t("recent.cleared"));
}
