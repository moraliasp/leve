/**
 * Abrir rápido (`Mod+P`, Arquivo › Abrir rápido…), carregado só quando chamado: caixa de busca sobre
 * os Markdown da pasta aberta (ou, sem pasta, sobre os Recentes), com busca aproximada
 * (`src/fuzzy.ts`). Combobox + listbox do padrão ARIA; o foco fica no campo e a opção ativa vai por
 * `aria-activedescendant`. Por quê: docs/decisoes.md, "Abrir rápido".
 */
import "./quick-open.css";
import { fuzzyFilter, type Match } from "./fuzzy";
import { t, type Key } from "./i18n";

export interface QuickSource {
  /** Caminhos a buscar: relativos à pasta, ou absolutos (Recentes). */
  items: string[];
  placeholder: Key;
  open(item: string, newTab: boolean): void;
}

const MAX = 50;
let dialog: HTMLDialogElement | null = null;

/** Abre a caixa (cria na primeira vez). Chamar de novo com ela aberta só reposiciona o foco. */
export function openQuick(src: QuickSource): void {
  if (dialog?.open) {
    dialog.querySelector("input")?.select();
    return;
  }
  dialog?.remove();
  const dlg = document.createElement("dialog");
  dlg.id = "quick";
  dlg.className = "sheet quick";
  dlg.setAttribute("aria-label", t("quick.label"));
  const input = document.createElement("input");
  input.type = "search";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = t(src.placeholder);
  input.setAttribute("aria-label", t(src.placeholder));
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-controls", "quick-list");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-autocomplete", "list");
  const list = document.createElement("ul");
  list.id = "quick-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", t("quick.label"));
  const empty = document.createElement("p");
  empty.className = "quick-empty";
  empty.textContent = t("quick.none");
  dlg.append(input, list, empty);
  document.getElementById("app")?.append(dlg);
  dialog = dlg;

  let matches: Match[] = [];
  let sel = 0;

  const choose = (i: number, newTab: boolean): void => {
    const m = matches[i];
    if (!m) return;
    dlg.close();
    src.open(m.item, newTab);
  };

  function select(i: number): void {
    sel = Math.max(0, Math.min(i, matches.length - 1));
    for (const [k, li] of [...list.children].entries()) {
      const on = k === sel;
      li.setAttribute("aria-selected", String(on));
      if (on) {
        input.setAttribute("aria-activedescendant", li.id);
        li.scrollIntoView({ block: "nearest" });
      }
    }
    if (matches.length === 0) input.removeAttribute("aria-activedescendant");
  }

  function render(): void {
    matches = fuzzyFilter(input.value, src.items, MAX);
    list.replaceChildren(
      ...matches.map((m, i) => {
        const li = document.createElement("li");
        li.id = `quick-${i}`;
        li.setAttribute("role", "option");
        const cut = Math.max(m.item.lastIndexOf("/"), m.item.lastIndexOf("\\")) + 1;
        const name = document.createElement("span");
        name.className = "quick-name";
        const dir = document.createElement("span");
        dir.className = "quick-dir";
        // Letras casadas em <mark>, sempre como texto.
        const hits = new Set(m.hits);
        [...m.item].forEach((c, k) => {
          const into = k >= cut ? name : dir;
          if (hits.has(k)) {
            const mark = document.createElement("mark");
            mark.textContent = c;
            into.append(mark);
          } else into.append(c);
        });
        li.append(name, dir);
        li.title = m.item;
        return li;
      }),
    );
    empty.hidden = matches.length > 0;
    select(0);
  }

  input.addEventListener("input", render);
  input.addEventListener("keydown", (ev) => {
    // Teclas locais da caixa; Esc fecha pelo próprio <dialog>.
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      select(sel + (ev.key === "ArrowDown" ? 1 : -1));
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      choose(sel, ev.metaKey || ev.ctrlKey);
    }
  });
  list.addEventListener("mousedown", (ev) => ev.preventDefault());
  list.addEventListener("click", (ev) => {
    const li = (ev.target as HTMLElement).closest("li");
    if (li) choose([...list.children].indexOf(li), ev.metaKey || ev.ctrlKey);
  });
  dlg.addEventListener("click", (ev) => {
    if (ev.target === dlg) dlg.close();
  });
  render();
  dlg.showModal();
  input.focus();
}
