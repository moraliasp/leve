/**
 * Revisão para IA: anotar a seleção e copiar as anotações, sem escrever nada. Carregado na primeira
 * vez que o leitor seleciona texto ou anota. A marca no texto é um Custom Highlight, como a da busca:
 * o documento não muda, e exportar, imprimir e o "o que mudou" nem ficam sabendo. A decisão vive em
 * `src/review.ts`; aqui o desenho. Por quê: docs/decisoes.md, "Revisão para IA".
 */
import { t } from "./i18n";
import { icon } from "./icons";
import { type Note, captureNote, formatReview, locateAll, textIndex } from "./review";
import "./review.css";
import type { Tab } from "./tabs";

type HighlightCtor = new (...ranges: Range[]) => unknown;
const highlights: Map<string, unknown> | undefined = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
const HighlightClass = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight;

/** O que o módulo pede a `main.ts`. */
export interface ReviewHost {
  content: HTMLElement;
  scroller: HTMLElement;
  tab(): Tab | null;
  doc(): { path: string; name: string; inMemory: boolean } | null;
  flash(msg: string, isError?: boolean): void;
  copyText(text: string): Promise<void>;
}

export interface ReviewUi {
  /** Documento novo ou recarregado na tela: procura as citações de novo. */
  sync(): void;
  /** O DOM mudou sem o documento mudar (realce de código troca os nós de texto). */
  refresh(): void;
  offer(): void;
  annotate(): void;
  copy(): void;
  has(tab: Tab): boolean;
  /** O documento colado foi salvo: o caminho mudou, as anotações ficam. */
  move(from: { tab: Tab; path: string }, to: { tab: Tab; path: string }): void;
}

export function mountReview(host: ReviewHost): ReviewUi {
  const byTab = new WeakMap<Tab, Map<string, Note[]>>();
  let nextId = 1;
  let shownPath: string | null = null;
  let ranges = new Map<number, Range>();
  let open = true;
  // Dentro de `#app`, onde `keepTabbable` alcança, e fora de `#main`, onde o documento não alcança.
  const ui = document.getElementById("app") ?? document.body;

  const notes = (): Note[] => {
    const tab = host.tab();
    const path = host.doc()?.path;
    return (tab && path && byTab.get(tab)?.get(path)) || [];
  };

  const addNote = (note: Note): void => {
    const tab = host.tab();
    const path = host.doc()?.path;
    if (!tab || !path) return;
    const paths = byTab.get(tab) ?? new Map<string, Note[]>();
    byTab.set(tab, paths);
    paths.set(path, [...(paths.get(path) ?? []), note]);
  };

  const removeNote = (id: number): void => {
    const tab = host.tab();
    const path = host.doc()?.path;
    const paths = tab && byTab.get(tab);
    if (!paths || !path) return;
    const left = (paths.get(path) ?? []).filter((n) => n.id !== id);
    if (left.length > 0) paths.set(path, left);
    else paths.delete(path);
    paint();
  };

  /* ---------- botão junto da seleção ---------- */
  const offerBtn = document.createElement("button");
  offerBtn.type = "button";
  offerBtn.className = "review-offer";
  offerBtn.hidden = true;
  offerBtn.textContent = t("review.annotate");
  // Clicar no botão não pode desfazer a seleção antes de ela ser lida.
  offerBtn.addEventListener("mousedown", (ev) => ev.preventDefault());
  offerBtn.addEventListener("click", () => annotate());
  ui.append(offerBtn);

  const selectedRange = (): Range | null => {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    return host.content.contains(r.commonAncestorContainer) ? r : null;
  };

  /** Encosta `el` abaixo do retângulo, dentro da janela. */
  const placeBelow = (el: HTMLElement, rect: DOMRect): void => {
    el.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - el.offsetWidth - 8))}px`;
    const below = rect.bottom + 6;
    const fits = below + el.offsetHeight <= innerHeight - 8;
    el.style.top = `${Math.max(8, fits ? below : rect.top - el.offsetHeight - 6)}px`;
  };

  document.addEventListener("selectionchange", () => {
    if (!selectedRange()) offerBtn.hidden = true;
  });
  // O botão fica parado na janela: rolando, a seleção sairia de baixo dele.
  host.scroller.addEventListener("scroll", () => (offerBtn.hidden = true), { passive: true });

  /* ---------- escrever a anotação ---------- */
  const compose = document.createElement("form");
  compose.className = "review-compose";
  compose.hidden = true;
  const field = document.createElement("textarea");
  field.rows = 3;
  field.placeholder = t("review.placeholder");
  field.setAttribute("aria-label", t("review.placeholder"));
  const row = document.createElement("div");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "text";
  cancel.textContent = t("review.cancel");
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "text";
  save.textContent = t("review.save");
  row.append(cancel, save);
  compose.append(field, row);
  ui.append(compose);
  let pending: Note | null = null;

  const closeCompose = (): void => {
    pending = null;
    compose.hidden = true;
    field.value = "";
    paint();
    host.scroller.focus({ preventScroll: true });
  };

  const saveCompose = (): void => {
    const comment = field.value.trim();
    if (!pending || !comment) return field.focus();
    addNote({ ...pending, comment });
    closeCompose();
    open = true;
    paint();
  };

  cancel.addEventListener("click", closeCompose);
  compose.addEventListener("submit", (ev) => {
    ev.preventDefault();
    saveCompose();
  });
  // Teclas locais ao controle: não são atalhos do app e não vão para o menu.
  field.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      closeCompose();
    } else if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      saveCompose();
    }
  });

  function annotate(): void {
    const range = selectedRange();
    const note = range && captureNote(host.content, range, nextId);
    if (!range || !note) {
      host.flash(t("review.select"));
      return;
    }
    nextId++;
    const rect = range.getBoundingClientRect();
    offerBtn.hidden = true;
    pending = note;
    compose.hidden = false;
    placeBelow(compose, rect);
    getSelection()?.removeAllRanges();
    paint();
    field.focus();
  }

  /* ---------- painel ---------- */
  const panel = document.createElement("aside");
  panel.className = "review-panel";
  panel.setAttribute("aria-label", t("review.panel"));
  panel.hidden = true;
  const head = document.createElement("div");
  head.className = "review-head";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "review-toggle";
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "text";
  copyBtn.textContent = t("review.copy");
  head.append(toggle, copyBtn);
  const list = document.createElement("ol");
  panel.append(head, list);
  ui.append(panel);

  toggle.addEventListener("click", () => {
    open = !open;
    drawPanel();
  });
  copyBtn.addEventListener("click", () => copy());

  const noteItem = (n: Note): HTMLLIElement => {
    const li = document.createElement("li");
    li.classList.toggle("resolved", n.resolved);
    const go = document.createElement("button");
    go.type = "button";
    go.className = "review-note";
    const quote = document.createElement("span");
    quote.className = "review-quote";
    quote.textContent = n.shown;
    const comment = document.createElement("span");
    comment.textContent = n.comment;
    go.append(quote, comment);
    if (n.resolved) {
      const tag = document.createElement("span");
      tag.className = "review-state";
      tag.textContent = t("review.resolved");
      go.append(tag);
    }
    go.addEventListener("click", () => {
      const r = ranges.get(n.id);
      if (!r) return;
      const box = host.scroller.getBoundingClientRect();
      host.scroller.scrollTop += r.getBoundingClientRect().top - box.top - box.height / 3;
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "review-del";
    del.innerHTML = icon("x", 14);
    del.setAttribute("aria-label", t("review.remove"));
    del.title = t("review.remove");
    del.addEventListener("click", () => removeNote(n.id));
    li.append(go, del);
    return li;
  };

  function drawPanel(): void {
    const all = notes();
    panel.hidden = all.length === 0;
    const pendingCount = all.filter((n) => !n.resolved).length;
    const done = all.length - pendingCount;
    const count = pendingCount === 1 ? t("review.countOne") : t("review.countMany", { n: pendingCount });
    toggle.textContent = done > 0 ? `${count} · ${t("review.resolvedCount", { n: done })}` : count;
    toggle.setAttribute("aria-expanded", String(open));
    list.hidden = !open;
    list.replaceChildren(...all.map(noteItem));
  }

  /** Procura as citações no DOM de agora: marca, conta as atendidas e redesenha o painel. */
  function paint(): void {
    const all = notes();
    const shown = pending ? [...all, pending] : all;
    const found = shown.length > 0 ? locateAll(textIndex(host.content), shown) : [];
    ranges = new Map();
    shown.forEach((n, i) => {
      const r = found[i];
      if (r) ranges.set(n.id, r);
      n.resolved = !r;
    });
    if (highlights && HighlightClass) {
      if (ranges.size > 0) highlights.set("leve-note", new HighlightClass(...ranges.values()));
      else highlights.delete("leve-note");
    }
    drawPanel();
  }

  function copy(): void {
    const doc = host.doc();
    const all = notes();
    if (!doc || all.every((n) => n.resolved)) {
      host.flash(t("review.none"));
      return;
    }
    const text = formatReview(doc.inMemory ? doc.name : doc.path, all, {
      title: (source, n) => (n === 1 ? t("review.titleOne", { source }) : t("review.titleMany", { source, n })),
      section: (heading) => t("review.section", { heading }),
      excerpt: t("review.excerpt"),
    });
    host.copyText(text).then(
      () => host.flash(t("review.copied")),
      (e) => host.flash(String(e), true),
    );
  }

  return {
    sync() {
      const path = host.doc()?.path ?? null;
      // Mesma aba e mesmo arquivo recarregado: quem escreve não perde o que digitou.
      if (path !== shownPath && pending) closeCompose();
      shownPath = path;
      offerBtn.hidden = true;
      paint();
    },
    refresh: paint,
    offer() {
      const range = selectedRange();
      if (!range || pending) return;
      offerBtn.hidden = false;
      placeBelow(offerBtn, range.getBoundingClientRect());
    },
    annotate,
    copy,
    has: (tab) => (byTab.get(tab)?.size ?? 0) > 0,
    move(from, to) {
      const source = byTab.get(from.tab);
      const moved = source?.get(from.path);
      if (!source || !moved) return;
      source.delete(from.path);
      const target = byTab.get(to.tab) ?? new Map<string, Note[]>();
      byTab.set(to.tab, target);
      target.set(to.path, [...(target.get(to.path) ?? []), ...moved]);
    },
  };
}
