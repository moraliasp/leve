import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import "./styles.css";
import { icon, installIcons } from "./icons";
import * as theme from "./theme";
import { hydrateImages, joinPath, markBrokenImage, render, renderErrorBlock, renderMermaid, slugify } from "./render";
import { cancelHighlight, highlightLazily } from "./highlight";
import { LARGE_TOC_MAX_LEVEL, isLargeDoc } from "./limits";
import { applyRemotePolicy, remotePrefEnabled, setRemotePref } from "./remote-ui";
import { buildToc, updateActive, type TocItem } from "./toc";
import { Finder } from "./find";
import { keepTabbable, tabKeyTarget } from "./a11y";
import { applyAnchor, captureAnchor, onImagesSettled, type ScrollAnchor } from "./scroll";
import { decorateCodeBlocks } from "./code";
import { renderMath } from "./math";
import { MD_EXT, collectWikilinkTargets, markWikilinks } from "./wikilinks";
import { applyTooltips, detectPlatform, keysFor, shortcutRows, tooltip } from "./shortcuts";
import { SCROLL_KEY, addRecent, clearRecent, readRecent, removeRecent, splitPath } from "./recent";
import { PREF_KEYS, TABS_KEY, TIP_KEY, boolPref, readJson, resetPrefs, savedAnchor, savedTabs, setBoolPref } from "./prefs";
import { applyI18n, detectLang, lang, langPref, setLangPref, t, type Key, type LangPref } from "./i18n";
import { checkForUpdates, maybeDailyCheck, type UpdateUi } from "./updater";
import { clipboardDoc, isUntitled, persistableTabs, replaceInHistory, untitledId, untitledName } from "./untitled";

installIcons();
// Textos da interface antes de qualquer evento ligado (troca `innerHTML` de alguns trechos).
applyI18n(document);
/** `t` com outro nome onde uma variável local `t` (aba) o esconderia. */
const tr = t;

interface Doc {
  path: string;
  dir: string;
  name: string;
  content: string;
  /** Aviso de leitura do Rust (ex.: UTF-8 inválido substituído). Abre mesmo assim. */
  warning?: string | null;
  /** Documento só em memória (área de transferência): `path` é `untitled:N`, `dir` vazio. */
  unsaved?: boolean;
}

/** Texto dos documentos não salvos, por id `untitled:N` (src/untitled.ts). Sai ao fechar a aba ou salvar. */
const untitledDocs = new Map<string, string>();
let untitledSeq = 0;

/** Fora do Tauri (vite no navegador) o app roda em modo leitura via `?file=/docs/x.md`. */
const IS_TAURI = "__TAURI_INTERNALS__" in window;
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const els = {
  content: $("content"),
  empty: $("empty"),
  toc: $("toc"),
  main: $("main"),
  title: $("title"),
  status: $("status"),
  recent: $("recent"),
  drop: $("drop"),
  find: $("find"),
  findInput: $<HTMLInputElement>("find-input"),
  findCount: $("find-count"),
  btnBack: $<HTMLButtonElement>("btn-back"),
  btnFwd: $<HTMLButtonElement>("btn-fwd"),
  tabs: $("tabs"),
  remoteBanner: $("remote-banner"),
};

let current: Doc | null = null;
let tocItems: TocItem[] = [];

// ---------- abas: cada uma com seu documento, histórico e ponto de leitura ----------

interface Tab {
  id: number;
  path: string;
  name: string;
  hist: string[];
  histIdx: number;
  /** Ponto de leitura ao sair da aba; reaplicado ao voltar. */
  anchor: ScrollAnchor | null;
}

let tabs: Tab[] = [];
let active: Tab | null = null;
let tabSeq = 0;

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p;

function newTab(path: string, afterActive = true): Tab {
  const t: Tab = { id: ++tabSeq, path, name: baseName(path), hist: [path], histIdx: 0, anchor: null };
  const at = afterActive && active ? tabs.indexOf(active) + 1 : tabs.length;
  tabs.splice(at, 0, t);
  return t;
}

function saveTabs(): void {
  // Aba não salva não volta ao reabrir: o texto só existia em memória.
  const saved = persistableTabs(
    tabs.map((t) => t.path),
    active ? tabs.indexOf(active) : -1,
  );
  localStorage.setItem(TABS_KEY, JSON.stringify(saved));
}

function renderTabs(): void {
  // As abas são recriadas: se o foco estava nelas, volta para a aba ativa (teclado não se perde).
  const hadFocus = els.tabs.contains(document.activeElement);
  els.tabs.hidden = tabs.length === 0;
  els.tabs.replaceChildren();
  for (const t of tabs) {
    const el = document.createElement("div");
    el.className = "tab";
    el.setAttribute("role", "tab");
    el.setAttribute("aria-selected", String(t === active));
    el.tabIndex = t === active ? 0 : -1;
    el.id = `tab-${t.id}`;
    el.setAttribute("aria-controls", "main");
    el.title = isUntitled(t.path) ? t.name : t.path;
    const name = document.createElement("span");
    name.className = "tab-name";
    name.textContent = t.name;
    const close = document.createElement("button");
    close.className = "tab-close";
    close.type = "button";
    close.title = tooltip(tr("tab.close"), "close-tab", PLATFORM);
    close.setAttribute("aria-label", tr("tab.closeNamed", { name: t.name }));
    // Fora do Tab: na aba focada, Delete fecha (padrão ARIA de abas); ⌘W também.
    close.tabIndex = -1;
    // Fora do nome da aba no leitor de tela (senão vira "x.md Fechar x.md"); continua clicável.
    close.setAttribute("aria-hidden", "true");
    close.innerHTML = icon("x", 14);
    close.addEventListener("click", (ev) => {
      ev.stopPropagation();
      closeTab(t);
    });
    el.addEventListener("click", () => void activateTab(t));
    // Clique do meio fecha, como em navegador.
    el.addEventListener("auxclick", (ev) => {
      if (ev.button === 1) {
        ev.preventDefault();
        closeTab(t);
      }
    });
    el.append(name, close);
    els.tabs.appendChild(el);
  }
  const sel = els.tabs.querySelector<HTMLElement>('[aria-selected="true"]');
  sel?.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (hadFocus) (sel ?? els.main).focus({ preventScroll: true });
  saveTabs();
}

function rememberActive(): void {
  if (!active || !current) return;
  active.anchor = captureAnchor(els.main, els.content);
  saveScroll(current.path, active.anchor);
}

/** Troca para a aba e relê o arquivo (pode ter mudado enquanto ela estava em segundo plano). */
async function activateTab(t: Tab): Promise<void> {
  if (t === active && current?.path === t.path) return;
  rememberActive();
  active = t;
  renderTabs();
  const ok = await loadDoc(t.path, { push: false, anchor: t.anchor ?? undefined });
  if (!ok && tabs.includes(t)) closeTab(t);
}

function closeTab(t: Tab): void {
  const i = tabs.indexOf(t);
  if (i < 0) return;
  if (t === active) rememberActive();
  tabs.splice(i, 1);
  // O id `untitled:N` só existe no histórico desta aba: fechar descarta o texto.
  for (const p of t.hist) if (isUntitled(p)) untitledDocs.delete(p);
  if (t !== active) {
    renderTabs();
    return;
  }
  active = null;
  const next = tabs[i] ?? tabs[i - 1];
  if (next) void activateTab(next);
  else {
    renderTabs();
    showEmpty();
  }
}

function cycleTab(delta: number): void {
  if (!active || tabs.length < 2) return;
  const i = (tabs.indexOf(active) + delta + tabs.length) % tabs.length;
  void activateTab(tabs[i]);
}

/**
 * Abas salvas voltam sem ler nada: cada uma só é lida (e checada no Rust) quando ativada.
 * Com "Reabrir abas ao iniciar" desligado (`savedTabs`), nenhuma volta.
 */
function restoreTabs(): Tab | null {
  const { paths, active: idx } = savedTabs();
  for (const p of paths) if (!tabs.some((t) => t.path === p)) newTab(p, false);
  return tabs[idx] ?? tabs[0] ?? null;
}
let zoom = Number(localStorage.getItem(PREF_KEYS.zoom) ?? "1") || 1;

// ---------- leitura: largura e fonte (menu Exibir, persistidas) ----------

const WIDTHS: Record<"narrow" | "normal" | "wide", Key> = { narrow: "width.narrow", normal: "width.normal", wide: "width.wide" };
const FONTS = { sans: "sans", serif: "serif", mono: "mono" } as const;
type Width = keyof typeof WIDTHS;
type Font = keyof typeof FONTS;

function readChoice<T extends string>(key: string, allowed: Record<T, string>, fallback: T): T {
  const v = localStorage.getItem(key);
  return v !== null && v in allowed ? (v as T) : fallback;
}

let readWidth: Width = readChoice(PREF_KEYS.width, WIDTHS, "normal");
let readFont: Font = readChoice(PREF_KEYS.font, FONTS, "sans");

function applyReading(): void {
  document.body.dataset.width = readWidth;
  document.body.dataset.font = readFont;
  localStorage.setItem(PREF_KEYS.width, readWidth);
  localStorage.setItem(PREF_KEYS.font, readFont);
  if (IS_TAURI) void invoke("sync_view_menu", { width: readWidth, font: readFont });
}
const finder = new Finder(els.content, els.main, els.findCount, $("find-live"));

// ---------- persistência leve (localStorage) ----------

type ScrollStore = Record<string, ScrollAnchor | number>;

function saveScroll(path: string, anchor: ScrollAnchor): void {
  if (isUntitled(path)) return;
  const map = readJson<ScrollStore>(SCROLL_KEY, {});
  map[path] = anchor;
  const keys = Object.keys(map);
  if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete map[k];
  localStorage.setItem(SCROLL_KEY, JSON.stringify(map));
}

/** Ponto de leitura a reaplicar; o topo quando a preferência "Restaurar posição" está desligada. */
const restoreScroll = savedAnchor;

// ---------- rolagem pendente: reaplicada quando Mermaid/imagens mudam a altura ----------

type Pending = { hash: string } | { anchor: ScrollAnchor };
let pending: Pending | null = null;
let lastSetTop = -1;

/** Aplica a rolagem pedida; chamada de novo a cada render assíncrono até o leitor rolar. */
function applyPending(): void {
  if (!pending || !current) return;
  if ("hash" in pending) scrollToAnchor(pending.hash);
  else applyAnchor(els.main, els.content, pending.anchor);
  lastSetTop = els.main.scrollTop;
  updateActive(tocItems, els.main);
}

// ---------- UI helpers ----------

let flashTimer: number | undefined;
/** Aviso do documento atual (leitura, modo grande): fica na barra até o próximo documento. */
let docNotice = { msg: "", isError: false };
/** Erro fica até a próxima mensagem; o resto some em 2,5 s, salvo `sticky`. */
function flash(msg: string, isError = false, sticky = isError): void {
  els.status.textContent = msg;
  els.status.classList.toggle("error", isError);
  window.clearTimeout(flashTimer);
  // Mensagem passageira some e devolve a barra ao aviso do documento, se houver.
  if (msg && !sticky) flashTimer = window.setTimeout(() => flash(docNotice.msg, docNotice.isError, true), 2500);
}

/** Troca o aviso do documento. Sem aviso novo, só limpa a barra se ela mostrava aviso ou erro. */
function setDocNotice(msg: string, isError: boolean): void {
  const had = docNotice.msg !== "";
  docNotice = { msg, isError };
  if (msg || had || els.status.classList.contains("error")) flash(msg, isError, true);
}

function applyZoom(): void {
  els.content.style.zoom = String(zoom);
  localStorage.setItem(PREF_KEYS.zoom, String(zoom));
}

// Abaixo de 720 px o sumário é sobreposição (styles.css): o botão abre/fecha `toc-peek`, só na
// sessão, e `leve.toc` (a preferência para janela larga) não é tocada.
const narrowMq = window.matchMedia("(max-width: 719px)");

function syncTocAria(): void {
  const open = narrowMq.matches ? document.body.classList.contains("toc-peek") : !document.body.classList.contains("toc-hidden");
  $("btn-toc").setAttribute("aria-expanded", String(open));
}

function setTocVisible(visible: boolean): void {
  document.body.classList.toggle("toc-hidden", !visible);
  setBoolPref(PREF_KEYS.toc, visible);
  syncTocAria();
}

function closeTocPeek(): void {
  document.body.classList.remove("toc-peek");
  syncTocAria();
}

function toggleToc(): void {
  if (narrowMq.matches) {
    document.body.classList.toggle("toc-peek");
    syncTocAria();
  } else {
    setTocVisible(document.body.classList.contains("toc-hidden"));
  }
}

function scrollToAnchor(raw: string): void {
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    /* ignora */
  }
  const target =
    document.getElementById(id) ??
    document.getElementById(slugify(id)) ??
    document.getElementById(`user-content-${id}`);
  if (!target) return;
  els.main.scrollTop = target.offsetTop - 16;
  // Leva o foco junto: o próximo Tab e o leitor de tela continuam dali, não do sumário.
  if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
  target.focus({ preventScroll: true });
}

function updateNavButtons(): void {
  els.btnBack.disabled = !active || active.histIdx <= 0;
  els.btnFwd.disabled = !active || active.histIdx >= active.hist.length - 1;
}

function showEmpty(): void {
  current = null;
  setDocNotice("", false);
  els.remoteBanner.hidden = true;
  els.content.hidden = true;
  els.empty.hidden = false;
  els.title.textContent = "";
  els.toc.replaceChildren();
  setWindowTitle("Leve");
  showTipOnce();
  renderRecent();
}

// ---------- recentes: lista do estado vazio, com remoção e limpeza ----------

/** Quais dos caminhos ainda existem. No navegador, HEAD no servidor do Vite; no app, o Rust confere. */
async function pathsExist(paths: string[]): Promise<boolean[]> {
  if (IS_TAURI) return invoke<boolean[]>("paths_exist", { paths });
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

/**
 * Confirmação no próprio app (`#confirm`, mesmo estilo do Sobre): Esc e "Cancelar" devolvem
 * falso; só o botão de ação devolve verdadeiro. Igual no app e no navegador.
 */
function confirmDialog(title: string, message: string, ok: string): Promise<boolean> {
  const dlg = $<HTMLDialogElement>("confirm");
  $("confirm-title").textContent = title;
  $("confirm-text").textContent = message;
  $("confirm-ok").textContent = ok;
  dlg.returnValue = "";
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok"), { once: true });
    dlg.showModal();
  });
}

function renderRecent(): void {
  const recent = readRecent();
  els.recent.replaceChildren();
  if (recent.length === 0) return;
  const head = document.createElement("div");
  head.className = "recent-head";
  const h = document.createElement("h2");
  h.id = "recent-title";
  h.textContent = t("recent.title");
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "link recent-clear";
  clear.textContent = t("recent.clear");
  clear.title = t("recent.clearLabel");
  clear.setAttribute("aria-label", t("recent.clearLabel"));
  clear.addEventListener("click", () => void askClearRecent());
  head.append(h, clear);
  els.recent.appendChild(head);
  const ul = document.createElement("ul");
  ul.setAttribute("aria-labelledby", "recent-title");
  const items: { li: HTMLLIElement; open: HTMLButtonElement; path: string }[] = [];
  for (const p of recent) {
    const li = document.createElement("li");
    const { name, dir } = splitPath(p);
    const open = document.createElement("button");
    open.type = "button";
    open.className = "recent-item";
    open.title = p;
    open.innerHTML = `<strong></strong><span></span>`;
    (open.firstElementChild as HTMLElement).textContent = name;
    (open.lastElementChild as HTMLElement).textContent = dir;
    open.addEventListener("click", () => {
      // Arquivo que sumiu: o clique tira da lista em vez de abrir e falhar.
      if (li.classList.contains("missing")) forgetRecent(p);
      else void loadDoc(p, { target: "new" });
    });
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "icon recent-remove";
    rm.title = t("recent.remove");
    rm.setAttribute("aria-label", t("recent.removeNamed", { name }));
    rm.innerHTML = icon("x", 14);
    rm.addEventListener("click", (ev) => {
      ev.stopPropagation();
      forgetRecent(p);
    });
    li.append(open, rm);
    ul.appendChild(li);
    items.push({ li, open, path: p });
  }
  els.recent.appendChild(ul);
  // Existência conferida depois: a lista aparece já, e o que sumiu fica apagado.
  void pathsExist(items.map((i) => i.path))
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
function forgetRecent(path: string): void {
  const idx = readRecent().indexOf(path);
  const hadFocus = els.recent.contains(document.activeElement);
  removeRecent(path);
  if (current) return;
  renderRecent();
  if (!hadFocus) return;
  const items = els.recent.querySelectorAll<HTMLButtonElement>(".recent-item");
  const next = items[Math.min(Math.max(idx, 0), items.length - 1)] ?? $("empty-open");
  next.focus({ preventScroll: true });
}

async function askClearRecent(): Promise<void> {
  if (readRecent().length === 0) {
    flash(t("recent.none"));
    return;
  }
  const ok = await confirmDialog(t("recent.confirmTitle"), t("recent.confirmText"), t("recent.clear"));
  if (!ok) return;
  clearRecent();
  if (!current) renderRecent();
  flash(t("recent.cleared"));
}

// ---------- carregamento ----------

interface LoadOpts {
  push?: boolean;
  keepScroll?: boolean;
  hash?: string;
  /** Ponto de leitura a restaurar (troca de aba). */
  anchor?: ScrollAnchor;
  /** "new": abre em aba nova, ou foca a aba que já tem o arquivo. Padrão: aba atual. */
  target?: "current" | "new";
}

async function readDoc(path: string): Promise<Doc> {
  if (isUntitled(path)) return untitledDoc(path);
  if (IS_TAURI) return invoke<Doc>("read_markdown", { path });
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  const name = path.split("/").pop() ?? path;
  return { path, dir: path.slice(0, path.length - name.length - 1) || "/", name, content: await res.text() };
}

/** Documento não salvo a partir do texto em memória. */
function untitledDoc(id: string): Doc {
  const content = untitledDocs.get(id);
  if (content === undefined) throw new Error(t("doc.notFound", { path: t("untitled.name") }));
  return { path: id, dir: "", name: untitledName(id, t("untitled.name")), content, unsaved: true };
}

/**
 * Resolve wikilinks na pasta do documento. No Tauri o backend tenta `nota.md` na pasta e,
 * quando houver pasta raiz aberta (fase 2), busca recursiva nela; no navegador só a pasta.
 */
async function resolveWikilinks(dir: string, targets: string[]): Promise<Record<string, string | null>> {
  if (IS_TAURI) return invoke<Record<string, string | null>>("resolve_wikilinks", { dir, root: null, targets });
  const out: Record<string, string | null> = {};
  await Promise.all(
    targets.map(async (t) => {
      const abs = joinPath(dir, MD_EXT.test(t) ? t : `${t}.md`);
      try {
        const res = await fetch(abs, { method: "HEAD" });
        const html = (res.headers.get("content-type") ?? "").includes("text/html");
        out[t] = res.ok && !html ? abs : null;
      } catch {
        out[t] = null;
      }
    }),
  );
  return out;
}

// ---------- conteúdo remoto: bloqueado ao abrir, carregado só a pedido (src/remote-ui.ts) ----------

/** Documentos em que o leitor pediu para carregar tudo (só nesta execução). */
const remoteAllowed = new Set<string>();
let remoteAuto = remotePrefEnabled();

/** Imagem liberada depois do render: `hydrateImages` já passou, então o erro é vigiado aqui. */
const watchRemote = (img: HTMLImageElement, url: string): void => {
  img.addEventListener("error", () => markBrokenImage(img, url), { once: true });
};

function applyRemote(doc: Doc): void {
  applyRemotePolicy(els.content, els.remoteBanner, {
    allowAll: remoteAuto || remoteAllowed.has(doc.path),
    onAllowAll: () => {
      remoteAllowed.add(doc.path);
      flash(t("remote.loadedDoc"));
    },
    watch: watchRemote,
  });
}

function syncRemoteMenu(): void {
  if (IS_TAURI) void invoke("sync_remote_menu", { on: remoteAuto });
}

function setWindowTitle(t: string): void {
  document.title = t;
  if (IS_TAURI) void getCurrentWindow().setTitle(t);
}

async function loadDoc(path: string, opts: LoadOpts = {}): Promise<boolean> {
  let doc: Doc;
  try {
    doc = await readDoc(path);
  } catch (e) {
    flash(String(e), true);
    return false;
  }
  return showDoc(doc, opts);
}

/**
 * Mostra um documento já lido (do disco ou da memória) na aba ativa ou numa nova. Documento não
 * salvo (`unsaved`) não tem pasta, vigia, Recentes nem ponto de leitura guardado.
 */
async function showDoc(doc: Doc, opts: LoadOpts = {}): Promise<boolean> {
  if (opts.target === "new" || !active) {
    const open = tabs.find((t) => t.path === doc.path);
    if (open) {
      if (open !== active) await activateTab(open);
      if (opts.hash) scrollToAnchor(opts.hash);
      return true;
    }
    rememberActive();
    active = newTab(doc.path);
    opts = { ...opts, push: false };
  }
  const tab = active;
  const prevAnchor = current ? captureAnchor(els.main, els.content) : null;
  if (current && prevAnchor && current.path !== doc.path) saveScroll(current.path, prevAnchor);
  current = doc;

  // Marcas de desempenho (DevTools › Performance, ou performance.getEntriesByType("measure")).
  performance.mark("leve:start");
  // Modo documento grande (src/limits.ts): sem links automáticos, sem realce, sumário até h2.
  const large = isLargeDoc(doc.content);
  try {
    const html = render(doc.content, { large });
    performance.measure("leve:render", "leve:start");
    els.content.innerHTML = html;
  } catch (e) {
    // Markdown patológico não deixa a tela vazia: o erro aparece no lugar do documento.
    els.content.replaceChildren(renderErrorBlock("Markdown", String(e), doc.content.slice(0, 4000)));
  }
  performance.measure("leve:dom", "leve:start");
  // Aviso de leitura e de modo grande ficam até o próximo documento; documento sem aviso limpa o anterior.
  setDocNotice(
    [doc.unsaved ? t("untitled.notice") : "", doc.warning, large ? t("doc.large") : ""].filter(Boolean).join(" · "),
    Boolean(doc.warning),
  );
  applyRemote(doc);
  // Sem pasta, imagem relativa não tem de onde vir: aparece como não encontrada.
  await hydrateImages(els.content, doc.unsaved ? null : doc.dir, IS_TAURI);
  decorateCodeBlocks(els.content);
  const wikiTargets = collectWikilinkTargets(els.content);
  if (doc.unsaved) {
    if (wikiTargets.length > 0) markWikilinks(els.content, Object.fromEntries(wikiTargets.map((w) => [w, null])));
  } else if (wikiTargets.length > 0) {
    const content = els.content;
    void resolveWikilinks(doc.dir, wikiTargets)
      .then((r) => {
        if (current?.path === doc.path) markWikilinks(content, r);
      })
      .catch((e) => console.warn("wikilinks:", e));
  }
  tocItems = buildToc(els.content, els.toc, large ? LARGE_TOC_MAX_LEVEL : undefined);
  // Sem foco em lugar nenhum (abriu pelo menu ou pelo sistema): foco no documento, setas já rolam.
  if (document.activeElement === document.body) els.main.focus({ preventScroll: true });
  els.empty.hidden = true;
  els.content.hidden = false;
  els.title.textContent = doc.name;
  els.title.title = doc.unsaved ? doc.name : doc.path;
  setWindowTitle(`${doc.name} — Leve`);

  if (opts.push !== false) {
    tab.hist.splice(tab.histIdx + 1);
    tab.hist.push(doc.path);
    tab.histIdx = tab.hist.length - 1;
  }
  tab.path = doc.path;
  tab.name = doc.name;
  tab.anchor = null;
  renderTabs();
  updateNavButtons();
  if (!doc.unsaved) {
    addRecent(doc.path);
    if (IS_TAURI) invoke("watch_file", { path: doc.path }).catch((e) => flash(String(e), true));
  }

  if (opts.hash) pending = { hash: opts.hash };
  else if (opts.anchor) pending = { anchor: opts.anchor };
  else if (opts.keepScroll && prevAnchor) pending = { anchor: prevAnchor };
  else pending = { anchor: restoreScroll(doc.path) };
  applyPending();
  performance.measure("leve:layout", "leve:start");

  if (!els.find.classList.contains("hidden") && els.findInput.value) finder.search(els.findInput.value);
  onImagesSettled(els.content, applyPending);
  void renderMermaid(els.content, theme.isDark()).then(applyPending);
  if (large) cancelHighlight();
  else void highlightLazily(els.content, els.main, () => finder.refresh());
  renderMath(els.content)
    .then(applyPending)
    .catch((e) => flash(`KaTeX: ${String(e)}`, true));
  return true;
}

/** O diálogo roda no Rust: só o que o usuário escolher ali fica liberado para leitura. */
async function pickAndOpen(): Promise<void> {
  if (!IS_TAURI) {
    flash(t("doc.browserOpen"), true);
    return;
  }
  try {
    const picked = await invoke<string | null>("pick_markdown");
    if (picked) await loadDoc(picked, { target: "new" });
  } catch (e) {
    flash(String(e), true);
  }
}

/** Lê o clipboard: no app pelo Rust (`read_clipboard`); no navegador, só para prova manual. */
async function readClipboard(): Promise<string | null> {
  if (IS_TAURI) return invoke<string | null>("read_clipboard");
  return navigator.clipboard.readText();
}

/** Arquivo › Abrir da área de transferência: o texto vira documento "Sem título" numa aba nova. */
async function openClipboard(): Promise<void> {
  let text: string | null;
  try {
    text = clipboardDoc(await readClipboard());
  } catch (e) {
    // No navegador, permissão negada ou conteúdo não-texto: mesmo aviso do clipboard vazio.
    if (IS_TAURI) {
      flash(String(e), true);
      return;
    }
    text = null;
  }
  if (text === null) {
    flash(t("untitled.emptyClipboard"));
    return;
  }
  const id = untitledId(++untitledSeq);
  untitledDocs.set(id, text);
  await showDoc(untitledDoc(id), { target: "new" });
}

/**
 * Salvar (Mod+S): só a aba não salva tem o que salvar. O diálogo e a escrita ficam no Rust
 * (`save_markdown_as`), que concede o caminho escolhido; depois disso a aba vira documento normal.
 */
async function saveUntitled(): Promise<void> {
  const tab = active;
  const id = current?.path;
  if (!tab || !id || !isUntitled(id)) {
    if (current) flash(t("untitled.alreadySaved"));
    return;
  }
  if (!IS_TAURI) {
    flash(t("untitled.saveBrowser"), true);
    return;
  }
  const text = untitledDocs.get(id);
  if (text === undefined) return;
  let saved: string | null;
  try {
    saved = await invoke<string | null>("save_markdown_as", { text });
  } catch (e) {
    flash(String(e), true);
    return;
  }
  if (!saved) return;
  untitledDocs.delete(id);
  tab.hist = replaceInHistory(tab.hist, id, saved);
  tab.path = saved;
  flash(t("untitled.saved", { name: baseName(saved) }));
  // Relê do disco na própria aba: vigia, Recentes e título passam a valer.
  if (tab === active && current?.path === id) await loadDoc(saved, { push: false, keepScroll: true });
  else renderTabs();
}

function go(delta: number): void {
  if (!active) return;
  const i = active.histIdx + delta;
  if (i < 0 || i >= active.hist.length) return;
  active.histIdx = i;
  void loadDoc(active.hist[i], { push: false });
}

// ---------- ações (menu nativo + botões) ----------

/** Quem tinha o foco antes da busca, para devolver ao fechar. */
let focusBeforeFind: HTMLElement | null = null;

function openFind(): void {
  if (els.find.classList.contains("hidden")) {
    const prev = document.activeElement;
    focusBeforeFind = prev instanceof HTMLElement && prev !== document.body ? prev : null;
  }
  els.find.classList.remove("hidden");
  els.findInput.focus();
  els.findInput.select();
}

function closeFind(): void {
  els.find.classList.add("hidden");
  finder.clear();
  const back = focusBeforeFind?.isConnected ? focusBeforeFind : els.main;
  focusBeforeFind = null;
  back.focus({ preventScroll: true });
}

// ---------- recarga: uma de cada vez, a última vence ----------

let reloading: Promise<boolean> | null = null;
let reloadAgain = false;

/**
 * Recarrega o documento atual mantendo o ponto de leitura. Se uma recarga ainda está em
 * andamento (render de documento grande), só marca: ao terminar, roda mais uma, com o conteúdo
 * mais novo do disco. Eventos intermediários do watcher caem nessa marca única (coalescing).
 */
function reloadCurrent(): void {
  if (!current) return;
  if (reloading) {
    reloadAgain = true;
    return;
  }
  reloading = loadDoc(current.path, { push: false, keepScroll: true }).finally(() => {
    reloading = null;
    if (reloadAgain) {
      reloadAgain = false;
      reloadCurrent();
    }
  });
}

const actions: Record<string, () => void> = {
  open: () => void pickAndOpen(),
  "open-clipboard": () => void openClipboard(),
  save: () => void saveUntitled(),
  // Documento não salvo não tem arquivo para reler nem pasta para mostrar.
  reload: () => {
    if (!current?.unsaved) reloadCurrent();
  },
  reveal: () => {
    if (current && !current.unsaved) void invoke("reveal_in_folder", { path: current.path });
  },
  print: () => window.print(),
  find: openFind,
  "toggle-toc": toggleToc,
  "cycle-theme": () => flashTheme(theme.cycle()),
  "zoom-in": () => {
    zoom = Math.min(2.5, Math.round((zoom + 0.1) * 10) / 10);
    applyZoom();
  },
  "zoom-out": () => {
    zoom = Math.max(0.5, Math.round((zoom - 0.1) * 10) / 10);
    applyZoom();
  },
  "zoom-reset": () => {
    zoom = 1;
    applyZoom();
  },
  back: () => go(-1),
  forward: () => go(1),
  "close-tab": () => {
    if (active) closeTab(active);
  },
  "clear-recent": () => void askClearRecent(),
  "next-tab": () => cycleTab(1),
  "prev-tab": () => cycleTab(-1),
  about: openAbout,
  "check-updates": checkUpdatesNow,
  shortcuts: openShortcuts,
  preferences: openPreferences,
  // Preferência global (Exibir): liga/desliga e reaplica ao documento aberto, com o ponto de leitura.
  "remote-auto": () => {
    remoteAuto = !remoteAuto;
    setRemotePref(remoteAuto);
    // Desligar volta a bloquear tudo, inclusive o que foi liberado "neste documento".
    if (!remoteAuto) remoteAllowed.clear();
    syncRemoteMenu();
    flash(remoteAuto ? t("remote.always") : t("remote.blocked"));
    reloadCurrent();
  },
};

// ---------- Preferências (Mod+,): mesmas chaves e mesmas ações do menu ----------

function flashTheme(m: theme.ThemeMode): void {
  flash(t("theme.flash", { mode: t(`theme.${m}`) }));
}

function setTheme(m: theme.ThemeMode): void {
  theme.setMode(m);
  flashTheme(m);
}

/** Lê o estado vivo para os controles da tela; chamada ao abrir e depois de cada ação. */
function syncPrefsUI(): void {
  const dlg = $<HTMLDialogElement>("prefs");
  if (!dlg.open) return;
  const choose = (name: string, value: string): void => {
    for (const r of dlg.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)) r.checked = r.value === value;
  };
  choose("theme", theme.getMode());
  choose("font", readFont);
  choose("width", readWidth);
  $("prefs-zoom-value").textContent = `${Math.round(zoom * 100)} %`;
  $<HTMLInputElement>("prefs-toc").checked = boolPref(PREF_KEYS.toc, true);
  $<HTMLInputElement>("prefs-restore-scroll").checked = boolPref(PREF_KEYS.restoreScroll, true);
  $<HTMLInputElement>("prefs-restore-tabs").checked = boolPref(PREF_KEYS.restoreTabs, true);
  $<HTMLInputElement>("prefs-remote").checked = remoteAuto;
  $<HTMLInputElement>("prefs-auto-update").checked = boolPref(PREF_KEYS.autoUpdate, false);
  choose("lang", langPref());
}

/**
 * Troca de idioma recarrega a página: todo texto (inclusive o do documento renderizado, como
 * títulos de alerta) sai de novo no idioma novo, e o menu nativo acompanha por `set_locale`.
 * As abas e o ponto de leitura voltam pelo `beforeunload`.
 */
function changeLang(p: LangPref): void {
  const before = lang();
  setLangPref(p);
  const next = p === "auto" ? detectLang(navigator.languages) : p;
  if (next !== before) location.reload();
}

function openPreferences(): void {
  const dlg = $<HTMLDialogElement>("prefs");
  const first = !dlg.open;
  if (first) dlg.showModal();
  syncPrefsUI();
  // O diálogo foca o primeiro rádio na ordem do DOM; o foco vai para o que está marcado.
  if (first) dlg.querySelector<HTMLInputElement>('input[name="theme"]:checked')?.focus();
}

/** Ação do menu (nativo ou do navegador); a tela Preferências, se aberta, acompanha. */
function runAction(id: string): void {
  actions[id]?.();
  syncPrefsUI();
}

/** Apaga as chaves de preferência e reaplica os padrões; recentes e abas ficam. */
function resetPreferences(): void {
  const langBefore = langPref();
  resetPrefs();
  theme.setMode("auto");
  readWidth = "normal";
  readFont = "sans";
  applyReading();
  zoom = 1;
  applyZoom();
  setTocVisible(true);
  // Reaplica ao documento aberto, como o item do menu.
  if (remoteAuto) actions["remote-auto"]();
  syncPrefsUI();
  flash(t("prefs.restored"));
  if (langBefore !== "auto") location.reload();
}

/**
 * Esquece as concessões de leitura do Rust (menos as abas abertas, que continuam funcionando),
 * os recentes e os pontos de leitura. A lista de abas salva já é só a das abas abertas.
 */
async function askForgetGrants(): Promise<void> {
  const ok = await confirmDialog(t("prefs.forgetTitle"), t("prefs.forgetText"), t("prefs.forgetOk"));
  if (!ok) return;
  if (IS_TAURI) {
    try {
      await invoke("forget_grants", { keep: tabs.map((t) => t.path).filter((p) => !isUntitled(p)) });
    } catch (e) {
      flash(String(e), true);
      return;
    }
  }
  clearRecent();
  saveTabs();
  if (!current) renderRecent();
  flash(t("prefs.forgotten"));
}

function wirePreferences(): void {
  const dlg = $<HTMLDialogElement>("prefs");
  dlg.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement)) return;
    switch (t.name) {
      case "theme":
        setTheme(t.value as theme.ThemeMode);
        break;
      case "font":
      case "width":
        actions[`${t.name}-${t.value}`]?.();
        break;
      case "toc":
        setTocVisible(t.checked);
        break;
      case "restore-scroll":
        setBoolPref(PREF_KEYS.restoreScroll, t.checked);
        break;
      case "restore-tabs":
        setBoolPref(PREF_KEYS.restoreTabs, t.checked);
        break;
      case "remote":
        if (t.checked !== remoteAuto) actions["remote-auto"]();
        break;
      case "auto-update":
        setBoolPref(PREF_KEYS.autoUpdate, t.checked);
        if (t.checked && IS_TAURI) maybeDailyCheck(updateUi, appInfo.version);
        break;
      case "lang":
        changeLang(t.value as LangPref);
        return;
    }
    syncPrefsUI();
  });
  $("prefs-zoom-out").addEventListener("click", () => runAction("zoom-out"));
  $("prefs-zoom-in").addEventListener("click", () => runAction("zoom-in"));
  $("prefs-zoom-reset").addEventListener("click", () => runAction("zoom-reset"));
  $("prefs-clear-recent").addEventListener("click", () => void askClearRecent());
  $("prefs-forget-grants").addEventListener("click", () => void askForgetGrants());
  // Abrem por cima da tela; Esc volta para ela.
  $("prefs-shortcuts").addEventListener("click", openShortcuts);
  $("prefs-about").addEventListener("click", openAbout);
  $("prefs-check-update").addEventListener("click", checkUpdatesNow);
  $("prefs-reset").addEventListener("click", resetPreferences);
}

// ---------- ajuda: Sobre, Atalhos e a dica da primeira abertura ----------

interface AppInfo {
  name: string;
  version: string;
  repo: string;
}

const REPO_URL = "https://github.com/moraliasp/leve";
let appInfo: AppInfo = { name: "Leve", version: "dev", repo: REPO_URL };

/** Versão e repositório vêm do Rust (Cargo.toml); no navegador fica "dev". */
async function loadAppInfo(): Promise<void> {
  if (!IS_TAURI) return;
  try {
    appInfo = await invoke<AppInfo>("app_info");
  } catch (e) {
    flash(String(e), true);
  }
}

const updateUi: UpdateUi = { flash, confirm: confirmDialog };

function checkUpdatesNow(): void {
  if (!IS_TAURI) {
    flash(t("update.browser"), true);
    return;
  }
  void checkForUpdates(updateUi, true, appInfo.version);
}

/** Plataforma só para rótulos (⌘ × Ctrl); os atalhos em si vivem no menu nativo. */
const PLATFORM = detectPlatform();

function openShortcuts(): void {
  const dl = $("shortcuts-list");
  if (dl.childElementCount === 0) {
    for (const [what, keys] of shortcutRows(PLATFORM)) {
      const dt = document.createElement("dt");
      dt.textContent = what;
      const dd = document.createElement("dd");
      dd.textContent = keys;
      dl.append(dt, dd);
    }
  }
  $<HTMLDialogElement>("shortcuts").showModal();
}

function openAbout(): void {
  const info = appInfo;
  $("about-version").textContent = info.version;
  const repo = $<HTMLAnchorElement>("about-repo");
  repo.href = info.repo;
  repo.textContent = info.repo.replace(/^https?:\/\//, "");
  $<HTMLDialogElement>("about").showModal();
}

/** Uma vez só: na primeira vez que o estado vazio aparece. */
function showTipOnce(): void {
  if (localStorage.getItem(TIP_KEY) === "1") return;
  localStorage.setItem(TIP_KEY, "1");
  $("tip").hidden = false;
}
for (const w of Object.keys(WIDTHS) as Width[]) {
  actions[`width-${w}`] = () => {
    readWidth = w;
    applyReading();
    flash(t("width.flash", { value: t(WIDTHS[w]) }));
  };
}
for (const f of Object.keys(FONTS) as Font[]) {
  actions[`font-${f}`] = () => {
    readFont = f;
    applyReading();
    flash(t("font.flash", { value: FONTS[f] }));
  };
}

// ---------- wiring ----------

function wire(): void {
  // Abas, padrão ARIA: setas/Home/End trocam (ativação automática), Delete fecha a focada.
  els.tabs.addEventListener("keydown", (ev) => {
    if (!active || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const i = tabs.indexOf(active);
    if (ev.key === "Delete" || ev.key === "Backspace") {
      ev.preventDefault();
      closeTab(active);
      return;
    }
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      return;
    }
    const to = tabKeyTarget(ev.key, i, tabs.length);
    if (to === null) return;
    ev.preventDefault();
    void activateTab(tabs[to]);
  });

  // Link de pulo: foca o documento (o hash sozinho não move o foco no WebKit) sem navegar.
  $("skip").addEventListener("click", (ev) => {
    ev.preventDefault();
    els.main.focus({ preventScroll: true });
  });
  $("btn-toc").addEventListener("click", actions["toggle-toc"]);
  $("btn-back").addEventListener("click", actions.back);
  $("btn-fwd").addEventListener("click", actions.forward);
  $("btn-theme").addEventListener("click", actions["cycle-theme"]);
  $("btn-open").addEventListener("click", actions.open);
  $("empty-open").addEventListener("click", actions.open);
  $("empty-clipboard").addEventListener("click", actions["open-clipboard"]);
  $("empty-clipboard-keys").textContent = `(${keysFor("open-clipboard", PLATFORM)})`;
  $("find-prev").addEventListener("click", () => finder.prev());
  $("find-next").addEventListener("click", () => finder.next());
  $("find-close").addEventListener("click", closeFind);
  $("tip-close").addEventListener("click", () => ($("tip").hidden = true));
  // O link do Sobre fica fora de #content: abre no navegador do sistema, nunca na janela.
  $("about-update").addEventListener("click", checkUpdatesNow);
  $("about-repo").addEventListener("click", (ev) => {
    ev.preventDefault();
    const href = (ev.currentTarget as HTMLAnchorElement).href;
    if (IS_TAURI) void invoke("open_external", { target: href });
    else window.open(href, "_blank", "noopener");
  });

  let debounce: number | undefined;
  els.findInput.addEventListener("input", () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => finder.search(els.findInput.value), 120);
  });
  els.findInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      if (ev.shiftKey) finder.prev();
      else finder.next();
    } else if (ev.key === "Escape") {
      closeFind();
    }
  });
  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !els.find.classList.contains("hidden")) closeFind();
  });

  // Links: externos abrem no navegador, .md relativos navegam aqui, âncoras rolam.
  // `<area>` (mapa de imagem) é link também: sem isto o clique navegaria a janela para fora.
  els.content.addEventListener("click", (ev) => {
    const a = (ev.target as HTMLElement).closest<HTMLAnchorElement | HTMLAreaElement>("a, area");
    if (!a) return;
    ev.preventDefault();
    const href = a.getAttribute("href");
    if (!href) return;
    // ⌘/Ctrl-clique abre o documento em aba nova.
    const where: LoadOpts["target"] = ev.metaKey || ev.ctrlKey ? "new" : "current";
    if (a instanceof HTMLAnchorElement && a.classList.contains("wikilink")) {
      const target = a.dataset.target ?? "";
      const hash = a.dataset.hash || undefined;
      if (!target) {
        if (hash) scrollToAnchor(hash);
      } else if (a.dataset.path) {
        void loadDoc(a.dataset.path, { hash, target: where });
      } else {
        flash(t("doc.noteNotFound", { name: target }));
      }
      return;
    }
    if (/^(https?:|mailto:)/i.test(href)) {
      if (IS_TAURI) void invoke("open_external", { target: href });
      else window.open(href, "_blank", "noopener");
      return;
    }
    if (href.startsWith("#")) {
      scrollToAnchor(href.slice(1));
      return;
    }
    if (!current) return;
    const [rel, hash] = href.split("#");
    if (current.unsaved) {
      flash(t("untitled.noFolder"));
      return;
    }
    let relDecoded = rel;
    try {
      relDecoded = decodeURIComponent(rel);
    } catch {
      /* ignora */
    }
    const dir = current.dir;
    const resolve = IS_TAURI
      ? invoke<string>("resolve_path", { dir, rel: relDecoded })
      : Promise.resolve(joinPath(dir, relDecoded));
    void resolve
      .then((abs) => (MD_EXT.test(abs) ? loadDoc(abs, { hash, target: where }) : invoke("open_external", { target: abs })))
      .catch((e) => flash(typeof e === "string" ? e : t("doc.notFound", { path: rel }), true));
  });

  // Sumário: rolagem suave dentro do painel principal.
  els.toc.addEventListener("click", (ev) => {
    const a = (ev.target as HTMLElement).closest("a");
    if (!a) return;
    ev.preventDefault();
    scrollToAnchor(a.getAttribute("href")?.slice(1) ?? "");
    closeTocPeek();
  });
  // Sobreposição fecha ao tocar no documento ou ao voltar a janela larga.
  els.main.addEventListener("click", closeTocPeek);
  narrowMq.addEventListener("change", closeTocPeek);

  let raf = 0;
  els.main.addEventListener("scroll", () => {
    // Rolagem que não foi nossa: o leitor assumiu, para de reaplicar a âncora.
    if (pending && els.main.scrollTop !== lastSetTop) pending = null;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      updateActive(tocItems, els.main);
    });
  });
  window.addEventListener("beforeunload", () => {
    rememberActive();
    saveTabs();
  });

  theme.onChange((dark) => {
    if (!current) return;
    // Diagrama re-renderizado no tema novo pode mudar de altura: segura o ponto visual.
    const a = captureAnchor(els.main, els.content);
    void renderMermaid(els.content, dark).then(() => applyAnchor(els.main, els.content, a));
  });
}

async function wireTauri(): Promise<void> {
  await listen<string>("menu", ({ payload }) => runAction(payload));
  await listen<string>("open-file", ({ payload }) => void loadDoc(payload, { target: "new" }));
  await listen<string>("file-changed", ({ payload }) => {
    if (current && payload === current.path) {
      reloadCurrent();
      flash(t("doc.reloaded"));
    }
  });
  await getCurrentWebview().onDragDropEvent((ev) => {
    const t = ev.payload.type;
    if (t === "enter" || t === "over") els.drop.classList.remove("hidden");
    else if (t === "leave") els.drop.classList.add("hidden");
    else if (t === "drop") {
      els.drop.classList.add("hidden");
      const p = ev.payload.paths.find((x) => MD_EXT.test(x));
      const mds = ev.payload.paths.filter((x) => MD_EXT.test(x));
      if (p) void (async () => {
        for (const m of mds) await loadDoc(m, { target: "new" });
      })();
      else flash(tr("doc.onlyMarkdown"), true);
    }
  });
}

function wireBrowserShortcuts(): void {
  const keys: Record<string, string> = {
    f: "find",
    b: "toggle-toc",
    r: "reload",
    "[": "back",
    "]": "forward",
    "/": "shortcuts",
    ",": "preferences",
    // Com Shift a tecla chega maiúscula; Mod+V sozinho continua sendo colar.
    V: "open-clipboard",
    s: "save",
  };
  window.addEventListener("keydown", (ev) => {
    if (!(ev.metaKey || ev.ctrlKey)) return;
    const a = keys[ev.key];
    if (a) {
      ev.preventDefault();
      runAction(a);
    }
  });
}

async function main(): Promise<void> {
  // Menu nativo e mensagens do Rust no mesmo idioma da página, antes de sincronizar os itens.
  if (IS_TAURI) await invoke("set_locale", { lang: lang() }).catch((e) => console.warn("set_locale:", e));
  keepTabbable($("app"));
  applyTooltips($("app"), PLATFORM);
  setTocVisible(boolPref(PREF_KEYS.toc, true));
  applyZoom();
  applyReading();
  syncRemoteMenu();
  wire();
  wirePreferences();
  if (IS_TAURI) await wireTauri();
  else {
    wireBrowserShortcuts();
    // Modo navegador: ações do menu nativo ficam acessíveis no console para prova manual.
    (window as unknown as { leveActions: typeof actions }).leveActions = actions;
  }
  const pending = IS_TAURI
    ? await invoke<string | null>("take_pending_open")
    : new URLSearchParams(location.search).get("file");
  const restored = restoreTabs();
  renderTabs();
  if (pending) await loadDoc(pending, { target: "new" });
  else if (restored) await activateTab(restored);
  if (!active) showEmpty();
  await loadAppInfo();
  if (IS_TAURI) {
    maybeDailyCheck(updateUi, appInfo.version);
    window.setInterval(() => maybeDailyCheck(updateUi, appInfo.version), 60 * 60 * 1000);
  }
}

void main();
