import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./styles.css";
import "./document.css";
import { icon, installIcons } from "./icons";
import * as theme from "./theme";
import { DOC_STYLES, applyDocStyle, type DocStyle } from "./doc-style";
import { hydrateImages, joinPath, markBrokenImage, render, renderErrorBlock, renderMermaid, slugify } from "./render";
import { cancelHighlight, highlightAll, highlightLazily } from "./highlight";
import { LARGE_TOC_MAX_LEVEL, isLargeDoc } from "./limits";
import { hasFrontMatter, loadYaml } from "./yaml";
import { applyRemotePolicy } from "./remote-ui";
import { applyHiddenPolicy } from "./hidden-ui";
import { type CommentSink, newCommentSink, stableCommentMarks } from "./hidden";
import { buildToc, updateActive, type TocItem } from "./toc";
import { Finder } from "./find";
import { keepTabbable, tabKeyTarget } from "./a11y";
import { applyAnchor, captureAnchor, onImagesSettled, type ScrollAnchor } from "./scroll";
import { copyText, decorateCodeBlocks } from "./code";
import { renderMath } from "./math";
import { blockKeys, markChanges, stepChange, track, type Hunk, type Snapshot } from "./changes";
import type { ExportResult, ImageEmbed } from "./export";
import { MD_EXT, collectWikilinkTargets, markWikilinks } from "./wikilinks";
import { applyTooltips, detectPlatform, keysFor, shortcutRows, tooltip } from "./shortcuts";
import { SCROLL_KEY, addRecent, clearRecent, folderEntry, isFolderEntry, readRecent, removeRecent, splitPath } from "./recent";
import { FOLDER_KEY, PREF_KEYS, TABS_KEY, TIP_KEY, TOP, boolPref, readJson, resetPrefs, savedAnchor, savedFolderRoot, savedTabs, setBoolPref } from "./prefs";
import type { FolderPanel } from "./folder-ui";
import { applyI18n, detectLang, lang, langPref, setLangPref, t, type Key, type LangPref } from "./i18n";
import { checkForUpdates, maybeDailyCheck, updateSource, type UpdateUi } from "./updater";
import { type Tab, canGoBack, canGoForward, commitDoc, cycleTarget, findTab, insertTab, removeTab, restoreSaved, serializeTabs, stepHistory, tabFactory } from "./tabs";
import { SAMPLE_SESSION_KEY, SESSION_KEY, isSample, sampleOnLaunch, samplePath, sampleText, sampleToReplace } from "./sample";
import { clipName, clipText, dropClip, inMemory, isClip } from "./clip";
import type { ClipHost } from "./clip-ui";
import { installErrorReporting } from "./errors";
import { reportPainted } from "./bench";
import { type EditorInfo, editablePath, editorOptions, editorPref, isEditorId, setEditorPref } from "./editor";

// Erro não tratado (promessa com `void`, exceção em callback) aparece na barra, não só no console.
// Instalado antes de tudo; `reportUnexpected` cobre o erro que chega antes de `els` existir.
installErrorReporting(reportUnexpected);
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
}

/** Fora do Tauri (vite no navegador) o app roda em modo leitura via `?file=/docs/x.md`. */
const IS_TAURI = "__TAURI_INTERNALS__" in window;

/**
 * Rótulos desta janela e deste webview, de onde `getCurrentWindow`/`getCurrentWebview` os leem.
 * Os módulos `window` e `webview` da API (~16 kB no chunk de abertura) só serviam ao título e ao
 * arrastar arquivo, que falam direto com `invoke`/`listen`.
 */
type TauriMeta = { currentWindow: { label: string }; currentWebview: { label: string } };
const tauriMeta = (): TauriMeta => (window as unknown as { __TAURI_INTERNALS__: { metadata: TauriMeta } }).__TAURI_INTERNALS__.metadata;

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
  hiddenBanner: $("hidden-banner"),
  changes: $<HTMLButtonElement>("changes"),
};

let current: Doc | null = null;
let tocItems: TocItem[] = [];

// ---------- abas: cada uma com seu documento, histórico e ponto de leitura ----------

// Decisões (onde entra, qual fica ativa, ciclo, histórico, `leve.tabs`) em src/tabs.ts; aqui, os efeitos.
let tabs: Tab[] = [];
let active: Tab | null = null;
const makeTab = tabFactory();

const baseName = (p: string): string =>
  isSample(p) ? t("sample.title") : isClip(p) ? clipName(p, t("clip.untitled")) : (p.split(/[\\/]/).pop() ?? p);

/**
 * Aba do exemplo (`sample:*`) aberta sozinha na abertura direta, enquanto o leitor não mexeu nela:
 * rolar a área do documento ou clicar nela zera a marca. Se um arquivo chegar do SO e ela for a
 * única aba, sai para dar lugar a ele (`sampleToReplace`).
 */
let sampleAuto: Tab | null = null;

function newTab(path: string, afterActive = true): Tab {
  const t = makeTab(path, baseName(path));
  insertTab(tabs, t, active, afterActive);
  return t;
}

/** Exemplo e colado não são arquivo: ficam fora de `leve.tabs` (na recarga da página volta por `SAMPLE_SESSION_KEY`). */
function saveTabs(): void {
  localStorage.setItem(TABS_KEY, serializeTabs(tabs, active));
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
    el.title = inMemory(t.path) ? t.name : t.path;
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
  if (!inMemory(current.path)) saveScroll(current.path, active.anchor);
}

/** Troca para a aba e relê o arquivo (pode ter mudado enquanto ela estava em segundo plano). */
async function activateTab(t: Tab): Promise<void> {
  if (t === active && current?.path === t.path) return;
  rememberActive();
  active = t;
  renderTabs();
  const ok = await loadDoc(t.path, { push: false, anchor: t.anchor ?? undefined });
  if (!ok && tabs.includes(t)) await closeTab(t);
}

/** Resolve quando a aba seguinte (se houver) terminou de abrir: a abertura espera a cadeia toda. */
function closeTab(t: Tab): Promise<void> {
  const removed = removeTab(tabs, t, active);
  if (!removed) return Promise.resolve();
  if (t === sampleAuto) sampleAuto = null;
  // O texto colado só existe nesta aba: fechar descarta.
  for (const p of t.hist) if (isClip(p)) dropClip(p);
  if (t === active) rememberActive();
  if (t !== active) {
    renderTabs();
    return Promise.resolve();
  }
  active = null;
  if (removed.next) return activateTab(removed.next);
  renderTabs();
  showEmpty();
  return Promise.resolve();
}

function cycleTab(delta: number): void {
  const to = cycleTarget(tabs, active, delta);
  if (to) void activateTab(to);
}

/**
 * Abas salvas voltam sem ler nada: cada uma só é lida (e checada no Rust) quando ativada.
 * Com "Reabrir abas ao iniciar" desligado (`savedTabs`), nenhuma volta.
 */
function restoreTabs(): Tab | null {
  return restoreSaved(tabs, savedTabs(), (p) => makeTab(p, baseName(p)));
}
let zoom = Number(localStorage.getItem(PREF_KEYS.zoom) ?? "1") || 1;

// ---------- leitura: estilo, largura e fonte (menu Exibir, persistidas) ----------

const WIDTHS: Record<"narrow" | "normal" | "wide", Key> = { narrow: "width.narrow", normal: "width.normal", wide: "width.wide" };
/** "auto" = a fonte do estilo (`src/doc-style.ts`); as outras sobrepõem só a fonte. */
const FONTS = { auto: "font.auto", sans: "Sans", serif: "Serif", mono: "Mono" } as const;
/** GitHub é nome próprio do visual, igual nos dois idiomas; os outros são chave de `t`. */
const STYLES: Record<DocStyle, Key | "GitHub"> = { github: "GitHub", editor: "style.editor", terminal: "style.terminal", livro: "style.livro" };
type Width = keyof typeof WIDTHS;
type Font = keyof typeof FONTS;
const fontLabel = (f: Font): string => (f === "auto" ? t(FONTS.auto) : FONTS[f]);
const styleLabel = (s: DocStyle): string => (s === "github" ? "GitHub" : t(STYLES[s] as Key));

function readChoice<T extends string>(key: string, allowed: Record<T, string>, fallback: T): T {
  const v = localStorage.getItem(key);
  return v !== null && v in allowed ? (v as T) : fallback;
}

let readWidth: Width = readChoice(PREF_KEYS.width, WIDTHS, "normal");
let readFont: Font = readChoice(PREF_KEYS.font, FONTS, "auto");
let docStyle: DocStyle = readChoice(PREF_KEYS.style, STYLES, "github");

function applyReading(): void {
  document.body.dataset.width = readWidth;
  document.body.dataset.font = readFont;
  localStorage.setItem(PREF_KEYS.width, readWidth);
  localStorage.setItem(PREF_KEYS.font, readFont);
  localStorage.setItem(PREF_KEYS.style, docStyle);
  void applyDocStyle(docStyle);
  if (IS_TAURI) void invoke("sync_view_menu", { style: docStyle, width: readWidth, font: readFont });
}
const finder = new Finder(els.content, els.main, els.findCount, $("find-live"));

// ---------- persistência leve (localStorage) ----------

type ScrollStore = Record<string, ScrollAnchor | number>;

function saveScroll(path: string, anchor: ScrollAnchor): void {
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

/** Erro inesperado: passageiro (a barra volta ao aviso do documento). Antes de `els`, escreve direto. */
function reportUnexpected(msg: string): void {
  try {
    flash(msg, true, false);
  } catch {
    const status = document.getElementById("status");
    if (status) {
      status.textContent = msg;
      status.classList.add("error");
    }
  }
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
  els.btnBack.disabled = !canGoBack(active);
  els.btnFwd.disabled = !canGoForward(active);
}

function showEmpty(): void {
  current = null;
  setDocNotice("", false);
  syncSaveMenu(false);
  showChanges([]);
  els.remoteBanner.hidden = true;
  els.hiddenBanner.hidden = true;
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
      if (li.classList.contains("missing")) forgetRecent(p);
      else if (isFolder) void openFolder(p.slice(0, -1));
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
  // Exemplo: texto do bundle, sem passar pelo Rust (nada a conceder nem a ler do disco).
  if (isSample(path)) return { path, dir: "", name: t("sample.title"), content: await sampleText(path) };
  // Colado: texto em memória (src/clip.ts), também sem o Rust.
  if (isClip(path)) {
    const content = clipText(path);
    if (content === undefined) throw new Error(t("doc.notFound", { path: baseName(path) }));
    return { path, dir: "", name: baseName(path), content };
  }
  if (IS_TAURI) return invoke<Doc>("read_markdown", { path });
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  const name = path.split("/").pop() ?? path;
  return { path, dir: path.slice(0, path.length - name.length - 1) || "/", name, content: await res.text() };
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
let remoteAuto = boolPref(PREF_KEYS.remote, false);

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

// ---------- conteúdo oculto: avisado ao abrir, mostrado só a pedido (src/hidden-ui.ts) ----------

/** Documentos em que o leitor pediu "Mostrar" (só nesta execução). */
const hiddenShown = new Set<string>();
let hiddenAuto = boolPref(PREF_KEYS.showHidden, false);

/** Antes de `applyRemote`: a classe que ele põe nas imagens bloqueadas não é do documento. */
function applyHidden(doc: Doc, comments: CommentSink | null): void {
  applyHiddenPolicy(els.content, els.hiddenBanner, {
    reveal: hiddenAuto || hiddenShown.has(doc.path),
    comments,
    source: doc.content,
    onReveal: () => {
      hiddenShown.add(doc.path);
      els.main.focus({ preventScroll: true });
    },
  });
}

function syncHiddenMenu(): void {
  if (IS_TAURI) void invoke("sync_hidden_menu", { on: hiddenAuto });
}

function setWindowTitle(t: string): void {
  document.title = t;
  // O que `Window.setTitle` manda (permissão `core:window:allow-set-title`).
  if (IS_TAURI) void invoke("plugin:window|set_title", { label: tauriMeta().currentWindow.label, value: t });
}

// ---------- o que mudou desde a recarga anterior (src/changes.ts): só em memória, por aba ----------

/** Versão anterior de cada aba nesta sessão; some com a aba. Nada vai para o disco. */
const snapshots = new WeakMap<Tab, Snapshot>();
/** Um bloco por trecho marcado, em ordem: alvo de Próxima/Anterior mudança. */
let changeTargets: HTMLElement[] = [];

function showChanges(hunks: readonly Hunk[]): void {
  changeTargets = markChanges(els.content, hunks);
  const n = hunks.length;
  els.changes.hidden = n === 0;
  els.changes.textContent = n === 1 ? t("changes.one") : t("changes.many", { n });
}

/** Rola até o trecho `i` como o sumário rola até um título, e leva o foco junto. */
function goToChange(i: number): void {
  const el = changeTargets[i];
  if (!el) return;
  els.main.scrollTop = el.offsetTop - 16;
  if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
  el.focus({ preventScroll: true });
  flash(t("changes.position", { i: i + 1, n: changeTargets.length }));
}

function stepToChange(dir: 1 | -1): void {
  if (changeTargets.length === 0) {
    flash(t("changes.none"));
    return;
  }
  // +16: o trecho para onde `goToChange` rolou está no topo e não conta como "próximo".
  goToChange(stepChange(changeTargets.map((el) => el.offsetTop), els.main.scrollTop + 16, dir));
}

/** Exibir › Limpar marcas de mudança: a versão atual vira a base, sem marcas. */
function clearChanges(): void {
  const snap = active && snapshots.get(active);
  if (active && snap) snapshots.set(active, { ...snap, hunks: [] });
  showChanges([]);
}

async function loadDoc(path: string, opts: LoadOpts = {}): Promise<boolean> {
  let doc: Doc;
  try {
    doc = await readDoc(path);
  } catch (e) {
    flash(String(e), true);
    return false;
  }
  // Front matter precisa do `yaml`, que vem sob demanda (src/yaml.ts); o render é síncrono.
  if (hasFrontMatter(doc.content)) await loadYaml();
  if (opts.target === "new" || !active) {
    const open = findTab(tabs, doc.path);
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
  if (current && prevAnchor && current.path !== doc.path && !inMemory(current.path)) saveScroll(current.path, prevAnchor);
  // Exemplo e colado: sem pasta, Recentes, vigia nem ponto de leitura guardado.
  const mem = inMemory(doc.path);
  current = doc;

  // Marcas de desempenho (DevTools › Performance, ou performance.getEntriesByType("measure")).
  performance.mark("leve:start");
  // Modo documento grande (src/limits.ts): sem links automáticos, sem realce, sumário até h2.
  const large = isLargeDoc(doc.content);
  let comments: CommentSink | null = newCommentSink();
  let keys: number[] = [];
  try {
    const html = render(doc.content, { large, comments });
    performance.measure("leve:render", "leve:start");
    els.content.innerHTML = html;
    // Antes dos pós-processos, que mudam o DOM sem o documento mudar (src/changes.ts).
    keys = blockKeys(els.content, (h) => stableCommentMarks(h, comments));
  } catch (e) {
    // Markdown patológico não deixa a tela vazia: o erro aparece no lugar do documento.
    els.content.replaceChildren(renderErrorBlock("Markdown", String(e), doc.content.slice(0, 4000)));
    comments = null;
  }
  performance.measure("leve:dom", "leve:start");
  // Aviso de leitura e de modo grande ficam até o próximo documento; documento sem aviso limpa o anterior.
  setDocNotice([isClip(doc.path) ? t("clip.notSaved") : "", doc.warning, large ? t("doc.large") : ""].filter(Boolean).join(" · "), Boolean(doc.warning));
  syncSaveMenu(isClip(doc.path));
  applyHidden(doc, comments);
  applyRemote(doc);
  await hydrateImages(els.content, doc.dir, IS_TAURI);
  decorateCodeBlocks(els.content);
  const snap = track(snapshots.get(tab), doc.path, keys);
  snapshots.set(tab, snap);
  showChanges(snap.hunks);
  performance.measure("leve:changes", "leve:start");
  const wikiTargets = collectWikilinkTargets(els.content);
  // Exemplo e colado não têm pasta: seus wikilinks para outras notas aparecem como não encontrados.
  if (mem) markWikilinks(els.content, {});
  else if (wikiTargets.length > 0) {
    const content = els.content;
    void resolveWikilinks(doc.dir, wikiTargets)
      .then((r) => {
        if (current?.path === doc.path) markWikilinks(content, r);
      })
      .catch((e) => {
        // O erro do Rust pode trazer caminho do sistema: ao leitor, só a mensagem genérica.
        console.warn("wikilinks:", e);
        if (current?.path === doc.path) flash(t("doc.wikilinksFailed"), true);
      });
  }
  tocItems = buildToc(els.content, els.toc, large ? LARGE_TOC_MAX_LEVEL : undefined);
  // Sem foco em lugar nenhum (abriu pelo menu ou pelo sistema): foco no documento, setas já rolam.
  if (document.activeElement === document.body) els.main.focus({ preventScroll: true });
  els.empty.hidden = true;
  els.content.hidden = false;
  els.title.textContent = doc.name;
  els.title.title = mem ? doc.name : doc.path;
  setWindowTitle(`${doc.name} — Leve`);

  commitDoc(tab, doc.path, doc.name, opts.push !== false);
  renderTabs();
  folder?.setCurrent(doc.path);
  updateNavButtons();
  // Exemplo e colado não são arquivo: fora dos Recentes e sem vigia.
  if (!mem) {
    addRecent(doc.path);
    if (IS_TAURI) invoke("watch_file", { path: doc.path }).catch((e) => flash(String(e), true));
  }

  if (opts.hash) pending = { hash: opts.hash };
  else if (opts.anchor) pending = { anchor: opts.anchor };
  else if (opts.keepScroll && prevAnchor) pending = { anchor: prevAnchor };
  else pending = { anchor: mem ? TOP : restoreScroll(doc.path) };
  applyPending();
  performance.measure("leve:layout", "leve:start");
  reportPainted(doc.path);

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

// ---------- pasta aberta (src/folder-ui.ts, carregado só quando uma pasta abre) ----------

let folder: FolderPanel | null = null;

/**
 * Painel da pasta `root` (concedida pelo Rust em `pick_folder`) e a pasta nos Recentes. Na abertura
 * (`atLaunch`), pasta que sumiu ou foi esquecida sai de `leve.folder` sem aviso.
 */
async function openFolder(root: string, atLaunch = false): Promise<void> {
  try {
    const { mountFolder } = await import("./folder-ui");
    folder?.close();
    folder = await mountFolder(root, {
      isTauri: IS_TAURI,
      open: (path, newTab) => loadDoc(path, { target: newTab ? "new" : undefined }),
      flash,
      currentPath: () => current?.path ?? null,
      onClose: () => (folder = null),
    });
    addRecent(folderEntry(folder.root));
    if (!current) renderRecent();
  } catch (e) {
    if (!atLaunch) flash(String(e), true);
    else {
      console.warn("pasta salva:", e);
      localStorage.removeItem(FOLDER_KEY);
    }
  }
}

async function pickFolder(): Promise<void> {
  if (!IS_TAURI) {
    flash(t("doc.browserOpen"), true);
    return;
  }
  try {
    const picked = await invoke<string | null>("pick_folder");
    if (picked) await openFolder(picked);
  } catch (e) {
    flash(String(e), true);
  }
}

/** Arquivo › Salvar… só vale com o documento colado ativo; o item do menu acompanha. */
function syncSaveMenu(on: boolean): void {
  if (IS_TAURI) void invoke("sync_save_menu", { on });
}

/** Abrir da área de transferência e salvar o colado (src/clip-ui.ts, sob demanda). */
const clipHost: ClipHost = {
  tauri: IS_TAURI,
  flash,
  tabs: () => tabs,
  active: () => active,
  open: (p) => loadDoc(p, { target: "new" }),
  reopen: (p) => loadDoc(p, { push: false, keepScroll: true }),
  activate: activateTab,
  close: closeTab,
  renderTabs,
};
const clipUi = (f: "openClipboard" | "saveClip"): void => void import("./clip-ui").then((m) => m[f](clipHost));

function go(delta: number): void {
  if (!active) return;
  const path = stepHistory(active, delta);
  if (path !== null) void loadDoc(path, { push: false });
}

// ---------- Exportar HTML / Copiar como HTML (src/export.ts) ----------

/** Sheet `#export` aberta para gravar arquivo ou para copiar; o botão principal decide. */
let exportMode: "file" | "copy" = "file";

/** Abre a sheet com a opção dos links `.md`. Nada é montado até o leitor confirmar. */
function openExport(mode: "file" | "copy"): void {
  if (!current) {
    flash(t("export.noDoc"), true);
    return;
  }
  exportMode = mode;
  $("export-title").textContent = t(mode === "copy" ? "export.copyTitle" : "export.title");
  $("export-ok").textContent = t(mode === "copy" ? "export.copy" : "export.ok");
  $<HTMLInputElement>("export-md-links").checked = boolPref(PREF_KEYS.exportMdLinks, false);
  $<HTMLDialogElement>("export").showModal();
}

/**
 * Imagens locais do documento como data URI. No app, o Rust lê só o que `allow_assets` já liberaria
 * (pasta de documento concedido, caminho relativo, extensão de imagem) e recusa acima de 5 MB sem ler;
 * no navegador, `fetch` no servidor do Vite.
 */
async function readExportImages(dir: string, rels: string[], max: number): Promise<Record<string, ImageEmbed>> {
  if (rels.length === 0) return {};
  if (IS_TAURI) return invoke<Record<string, ImageEmbed>>("export_images", { dir, rels });
  const { blobToDataUri } = await import("./export");
  const out: Record<string, ImageEmbed> = {};
  await Promise.all(
    rels.map(async (rel) => {
      out[rel] = { data: null, tooBig: false };
      try {
        const res = await fetch(joinPath(dir, rel));
        const blob = await res.blob();
        if (!res.ok || blob.type.includes("text/html")) return;
        if (blob.size > max) out[rel].tooBig = true;
        else out[rel].data = await blobToDataUri(blob);
      } catch {
        /* fica com o caminho relativo */
      }
    }),
  );
  return out;
}

/**
 * Monta o HTML a partir de um clone do documento desenhado: realce completo (fora do modo grande),
 * Mermaid redesenhado no tema claro se a página está no escuro ou ainda não terminou, KaTeX pendente,
 * CSS claro com as fontes usadas e imagens locais embutidas. A página não é tocada.
 */
async function buildExport(doc: Doc): Promise<ExportResult> {
  const [ex, { exportCss }] = await Promise.all([import("./export"), import("./export-css")]);
  const root = ex.cloneContent(els.content);
  if (!isLargeDoc(doc.content)) await highlightAll(root);
  const unrendered = Array.from(root.querySelectorAll("pre.mermaid")).some((p) => !p.querySelector("svg") && !p.classList.contains("has-error"));
  if (theme.isDark() || unrendered) await renderMermaid(root, false);
  await renderMath(root);
  const [css, images] = await Promise.all([
    exportCss(root, docStyle),
    readExportImages(doc.dir, ex.localImageRels(root), ex.EXPORT_IMAGE_MAX_BYTES),
  ]);
  const mdLinks = boolPref(PREF_KEYS.exportMdLinks, false) ? "html" : "text";
  return ex.buildExportHtml(root, { fileName: doc.name, lang: lang(), css, mdLinks, images });
}

function oversizedNotice(n: number): string {
  return n === 0 ? "" : n === 1 ? t("export.oversizedOne") : t("export.oversizedMany", { n });
}

/** Grava pelo diálogo nativo do Rust (`save_html`): o frontend manda o documento de origem e o HTML, nunca o destino. */
async function saveExport(doc: Doc, pending: Promise<ExportResult>): Promise<void> {
  try {
    const { html, oversized } = await pending;
    let saved: string | null;
    if (IS_TAURI) saved = await invoke<string | null>("save_html", { doc: doc.path, html });
    else {
      // Modo navegador: download do arquivo, para a prova manual.
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      a.download = doc.name.replace(/\.[^.]+$/, "") + ".html";
      a.click();
      URL.revokeObjectURL(a.href);
      saved = a.download;
    }
    if (!saved) return;
    flash([t("export.saved", { path: saved }), oversizedNotice(oversized)].filter(Boolean).join(" · "), false, oversized > 0);
  } catch (e) {
    flash(t("export.failed", { error: String(e) }), true);
  }
}

/**
 * Copia o HTML como texto. Chamada dentro do clique do botão da sheet: o WebKit só aceita escrever
 * na área de transferência com um gesto do leitor, e o `ClipboardItem` com promessa segura o gesto
 * enquanto o HTML é montado. Sem `ClipboardItem`, `copyText` (Clipboard API ou `execCommand`).
 */
async function copyExport(pending: Promise<ExportResult>): Promise<void> {
  try {
    let copied = false;
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      const blob = pending.then((r) => new Blob([r.html], { type: "text/plain" }));
      // Recusa (permissão negada pelo WebView) cai no caminho de `copyText`.
      copied = await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]).then(
        () => true,
        () => false,
      );
    }
    if (!copied) await copyText((await pending).html);
    const { oversized } = await pending;
    flash([t("export.copied"), oversizedNotice(oversized)].filter(Boolean).join(" · "), false, oversized > 0);
  } catch (e) {
    flash(t("export.failed", { error: String(e) }), true);
  }
}

function wireExport(): void {
  $("export-ok").addEventListener("click", () => {
    setBoolPref(PREF_KEYS.exportMdLinks, $<HTMLInputElement>("export-md-links").checked);
    const doc = current;
    if (!doc) return;
    const pending = buildExport(doc);
    if (exportMode === "copy") void copyExport(pending);
    else void saveExport(doc, pending);
  });
}

// ---------- Copiar como texto formatado (src/rich.ts) ----------

/**
 * Editar › Copiar como texto formatado (Mod+Shift+C): `text/html` com estilo inline + `text/plain`
 * (o Markdown-fonte, ou o texto da seleção) num `ClipboardItem` só. A escrita começa aqui, de forma
 * síncrona, dentro do gesto do leitor; o conteúdo chega pelas promessas, montado por `src/rich.ts`
 * (carregado sob demanda, como o resto: reserva por `execCommand` e aviso).
 */
function copyRich(): void {
  const doc = current;
  if (!doc) {
    flash(t("rich.noDoc"), true);
    return;
  }
  const sel = window.getSelection();
  const range = sel && !sel.isCollapsed && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  const rich = import("./rich");
  const job = rich.then((m) =>
    m.richCopyJob({
      content: els.content,
      range,
      source: doc.content,
      large: isLargeDoc(doc.content),
      readImages: (rels, max) => readExportImages(doc.dir, rels, max),
    }),
  );
  const write =
    typeof ClipboardItem !== "undefined" && navigator.clipboard?.write
      ? navigator.clipboard.write([
          new ClipboardItem({
            "text/html": job.then((j) => new Blob([j.html], { type: "text/html" })),
            "text/plain": job.then((j) => new Blob([j.plain], { type: "text/plain" })),
          }),
        ])
      : Promise.reject(new Error("ClipboardItem indisponível"));
  rich
    .then((m) => m.finishCopy(job, write))
    .then(
      ({ message, oversized }) => flash([message, oversizedNotice(oversized)].filter(Boolean).join(" · "), false, oversized > 0),
      (e) => flash(t("rich.failed", { error: String(e) }), true),
    );
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
  "open-clipboard": () => clipUi("openClipboard"),
  save: () => clipUi("saveClip"),
  reload: reloadCurrent,
  reveal: () => {
    if (current && !inMemory(current.path)) void invoke("reveal_in_folder", { path: current.path });
  },
  "open-in-editor": () => void openInEditor(),
  "install-cli": () => void installCli(),
  print: () => window.print(),
  "export-html": () => openExport("file"),
  "copy-html": () => openExport("copy"),
  "copy-rich": copyRich,
  find: openFind,
  "next-change": () => stepToChange(1),
  "prev-change": () => stepToChange(-1),
  "clear-changes": clearChanges,
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
  "open-folder": () => void pickFolder(),
  "close-folder": () => folder?.close(),
  // Sem pasta aberta, Exibir › Pasta pede uma.
  "toggle-tree": () => (folder ? folder.toggle() : void pickFolder()),
  "next-tab": () => cycleTab(1),
  "prev-tab": () => cycleTab(-1),
  about: openAbout,
  "check-updates": checkUpdatesNow,
  shortcuts: openShortcuts,
  // Ajuda › Documento de exemplo: aba nova, ou foca a que já está aberta.
  sample: () => void loadDoc(samplePath(lang()), { target: "new" }),
  preferences: openPreferences,
  // Preferência global (Exibir): liga/desliga e reaplica ao documento aberto, com o ponto de leitura.
  "remote-auto": () => {
    remoteAuto = !remoteAuto;
    setBoolPref(PREF_KEYS.remote, remoteAuto);
    // Desligar volta a bloquear tudo, inclusive o que foi liberado "neste documento".
    if (!remoteAuto) remoteAllowed.clear();
    syncRemoteMenu();
    flash(remoteAuto ? t("remote.always") : t("remote.blocked"));
    reloadCurrent();
  },
  // Exibir › Mostrar conteúdo oculto: mesma forma da preferência acima.
  "show-hidden": () => {
    hiddenAuto = !hiddenAuto;
    setBoolPref(PREF_KEYS.showHidden, hiddenAuto);
    if (!hiddenAuto) hiddenShown.clear();
    syncHiddenMenu();
    flash(hiddenAuto ? t("hidden.always") : t("hidden.warnOnly"));
    reloadCurrent();
  },
};

// ---------- Abrir no editor e comando `leve` (Preferências › Integração) ----------

/** Lista vinda do Rust (`list_editors`), lida ao abrir as Preferências e antes de abrir no editor. */
let editors: EditorInfo[] = [];

async function loadEditors(): Promise<EditorInfo[]> {
  if (!IS_TAURI) return editors;
  try {
    editors = await invoke<EditorInfo[]>("list_editors");
  } catch (e) {
    flash(String(e), true);
  }
  return editors;
}

/** Arquivo › Abrir no editor: o documento ativo no editor escolhido. O Rust monta o comando. */
async function openInEditor(): Promise<void> {
  if (!current) {
    flash(t("editor.noDoc"));
    return;
  }
  const path = editablePath(current.path);
  if (!path) {
    flash(isClip(current.path) ? t("clip.saveFirst") : t("editor.sample"));
    return;
  }
  if (!IS_TAURI) {
    flash(t("editor.browser"), true);
    return;
  }
  const id = editorPref();
  try {
    await invoke("open_in_editor", { editor: id, path });
    const name = editors.find((e) => e.id === id)?.name ?? (await loadEditors()).find((e) => e.id === id)?.name ?? id;
    flash(t("editor.opened", { name }));
  } catch (e) {
    flash(String(e), true);
  }
}

interface CliOutcome {
  status: "installed" | "needs-admin" | "cancelled";
  path?: string;
}

/** Leve › Instalar comando 'leve' (macOS): sem senha se der; senão pergunta antes de pedir a senha. */
async function installCli(): Promise<void> {
  if (!IS_TAURI || PLATFORM !== "mac") {
    flash(t("cli.pc"));
    return;
  }
  try {
    let out = await invoke<CliOutcome>("install_cli", { admin: false });
    if (out.status === "needs-admin") {
      const ok = await confirmDialog(t("cli.adminTitle"), t("cli.adminText", { path: out.path ?? "" }), t("cli.adminOk"));
      if (!ok) return;
      out = await invoke<CliOutcome>("install_cli", { admin: true });
    }
    if (out.status === "installed") flash(t("cli.installed", { path: out.path ?? "" }), false, true);
    else if (out.status === "cancelled") flash(t("cli.cancelled"));
  } catch (e) {
    flash(String(e), true);
  }
}

/** Preenche o seletor de editor com o que está instalado e o escolhido (mesmo se sumiu). */
function renderEditorSelect(): void {
  const sel = $<HTMLSelectElement>("prefs-editor");
  const chosen = editorPref();
  const list = editors.length ? editors : [{ id: "system", name: t("prefs.editorSystem"), available: true, selfDefault: false } as EditorInfo];
  sel.replaceChildren(
    ...editorOptions(list, chosen).map((o) => {
      const opt = document.createElement("option");
      opt.value = o.id;
      // "Aplicativo padrão" indisponível é o caso do padrão ser o Leve: a dica abaixo explica.
      opt.textContent = o.missing && o.id !== "system" ? t("prefs.editorMissing", { name: o.name }) : o.name;
      return opt;
    }),
  );
  sel.value = chosen;
  const self = editors.find((e) => e.id === "system")?.selfDefault && chosen === "system";
  $("prefs-editor-hint").textContent = self ? t("prefs.editorSelf") : t("prefs.editorHint");
}

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
  choose("style", docStyle);
  choose("font", readFont);
  choose("width", readWidth);
  $("prefs-zoom-value").textContent = `${Math.round(zoom * 100)} %`;
  $<HTMLInputElement>("prefs-toc").checked = boolPref(PREF_KEYS.toc, true);
  $<HTMLInputElement>("prefs-restore-scroll").checked = boolPref(PREF_KEYS.restoreScroll, true);
  $<HTMLInputElement>("prefs-restore-tabs").checked = boolPref(PREF_KEYS.restoreTabs, true);
  $<HTMLInputElement>("prefs-sample").checked = boolPref(PREF_KEYS.sample, true);
  $<HTMLInputElement>("prefs-remote").checked = remoteAuto;
  $<HTMLInputElement>("prefs-hidden").checked = hiddenAuto;
  $<HTMLInputElement>("prefs-auto-update").checked = boolPref(PREF_KEYS.autoUpdate, false);
  choose("lang", langPref());
  renderEditorSelect();
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
  // A detecção roda no Rust (LaunchServices, PATH); a lista chega depois e o seletor se refaz.
  if (first) void loadEditors().then(syncPrefsUI);
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
  readFont = "auto";
  docStyle = "github";
  applyReading();
  zoom = 1;
  applyZoom();
  setTocVisible(true);
  // Reaplica ao documento aberto, como o item do menu.
  if (remoteAuto) actions["remote-auto"]();
  if (hiddenAuto) actions["show-hidden"]();
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
      const keep = tabs.map((t) => t.path).filter((p) => !inMemory(p));
      // A pasta aberta no painel continua concedida, como as abas.
      if (folder) keep.push(folder.root);
      await invoke("forget_grants", { keep });
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
      case "style":
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
      case "sample":
        setBoolPref(PREF_KEYS.sample, t.checked);
        break;
      case "remote":
        if (t.checked !== remoteAuto) actions["remote-auto"]();
        break;
      case "hidden":
        if (t.checked !== hiddenAuto) actions["show-hidden"]();
        break;
      case "auto-update":
        setBoolPref(PREF_KEYS.autoUpdate, t.checked);
        if (t.checked && updateSource(IS_TAURI, appInfo.flatpak) === "app") maybeDailyCheck(updateUi, appInfo.version);
        break;
      case "lang":
        changeLang(t.value as LangPref);
        return;
    }
    syncPrefsUI();
  });
  $<HTMLSelectElement>("prefs-editor").addEventListener("change", (ev) => {
    const v = (ev.target as HTMLSelectElement).value;
    if (isEditorId(v)) setEditorPref(v);
    syncPrefsUI();
  });
  $("prefs-cli-hint").textContent = PLATFORM === "mac" ? t("prefs.cliHintMac") : t("prefs.cliHintPc");
  $("prefs-cli-actions").hidden = PLATFORM !== "mac";
  $("prefs-cli-install").addEventListener("click", () => void installCli());
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
  /** Instalado pelo Flatpak: atualização pelo `flatpak update`, sem o atualizador do app. */
  flatpak: boolean;
}

const REPO_URL = "https://github.com/moraliasp/leve";
let appInfo: AppInfo = { name: "Leve", version: "dev", repo: REPO_URL, flatpak: false };

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
  const source = updateSource(IS_TAURI, appInfo.flatpak);
  if (source === "none") {
    flash(t("update.browser"), true);
    return;
  }
  if (source === "flatpak") {
    flash(t("update.flatpak"));
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
    flash(t("font.flash", { value: fontLabel(f) }));
  };
}
// Trocar de estilo volta a fonte para a do estilo: o estilo é o visual inteiro, e uma fonte
// escolhida para outro visual o desmancharia (docs/decisoes.md, "Estilos do documento").
for (const s of DOC_STYLES) {
  actions[`style-${s}`] = () => {
    docStyle = s;
    readFont = "auto";
    applyReading();
    flash(t("style.flash", { value: styleLabel(s) }));
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
  $("empty-clip").addEventListener("click", actions["open-clipboard"]);
  $("empty-clip-keys").textContent = keysFor("open-clipboard", PLATFORM);
  els.changes.addEventListener("click", () => goToChange(0));
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
    // Colado não tem pasta: link relativo só depois de salvar.
    if (isClip(current.path)) {
      flash(t("clip.saveFirst"));
      return;
    }
    const [rel, hash] = href.split("#");
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
  // Clique no documento (link ou não) conta como mexer no exemplo da abertura.
  els.main.addEventListener("click", () => {
    if (active === sampleAuto) sampleAuto = null;
  });
  narrowMq.addEventListener("change", closeTocPeek);
  // A árvore não tem vigia (docs/decisoes.md): relê a pasta quando a janela volta ao foco.
  window.addEventListener("focus", () => void folder?.refresh());

  let raf = 0;
  els.main.addEventListener("scroll", () => {
    // Rolagem que não foi nossa: o leitor assumiu, para de reaplicar a âncora.
    if (els.main.scrollTop !== lastSetTop) {
      if (pending) pending = null;
      if (active === sampleAuto) sampleAuto = null;
    }
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      updateActive(tocItems, els.main);
    });
  });
  window.addEventListener("beforeunload", () => {
    rememberActive();
    saveTabs();
    // Troca de idioma recarrega a página: o exemplo aberto volta, no idioma novo.
    const sample = tabs.find((t) => isSample(t.path));
    session.set(SAMPLE_SESSION_KEY, sample ? (sample === active ? "active" : "open") : null);
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
  await listen<string>("open-file", ({ payload }) => void openFromSystem(payload));
  await listen<string>("file-changed", ({ payload }) => {
    if (current && payload === current.path) {
      reloadCurrent();
      flash(t("doc.reloaded"));
    }
  });
  // Arrastar arquivo: os quatro eventos que `onDragDropEvent` escuta, no mesmo alvo (este webview).
  // Quem concede o caminho é o Rust (`WindowEvent::DragDrop`); aqui só a tela e a abertura.
  const target = { kind: "Webview", label: tauriMeta().currentWebview.label } as const;
  const showDrop = (): void => els.drop.classList.remove("hidden");
  await Promise.all([
    listen("tauri://drag-enter", showDrop, { target }),
    listen("tauri://drag-over", showDrop, { target }),
    listen("tauri://drag-leave", () => els.drop.classList.add("hidden"), { target }),
    listen<{ paths: string[] }>(
      "tauri://drag-drop",
      ({ payload }) => {
        els.drop.classList.add("hidden");
        const mds = payload.paths.filter((x) => MD_EXT.test(x));
        if (mds.length) void (async () => {
          for (const m of mds) await loadDoc(m, { target: "new" });
        })();
        else flash(tr("doc.onlyMarkdown"), true);
      },
      { target },
    ),
  ]);
}

/**
 * Arquivo pedido pelo SO com o app aberto (2ª instância, duplo-clique no macOS, inclusive o que
 * chega depois de a abertura assentar). Se o exemplo da abertura ainda é a única aba e o leitor
 * não mexeu nele, ele sai e o arquivo fica sozinho.
 */
async function openFromSystem(path: string): Promise<void> {
  const replace = sampleToReplace(tabs, sampleAuto);
  const ok = await loadDoc(path, { target: "new" });
  if (ok && replace && active !== replace) void closeTab(replace);
}

/** sessionStorage com tolerância a falha (modo privado, armazenamento bloqueado). */
const session = {
  get(k: string): string | null {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null): void {
    try {
      if (v === null) sessionStorage.removeItem(k);
      else sessionStorage.setItem(k, v);
    } catch {
      /* ignora */
    }
  },
};

/**
 * Abertura: arquivo pedido pelo SO (ou `?file=`), abas salvas e, sem nenhum dos dois, o exemplo
 * (`sampleOnLaunch`). No app, `launch_open` só responde depois de a abertura assentar no Rust:
 * no macOS o duplo-clique pode chegar depois de a página carregar (docs/decisoes.md).
 */
async function openAtLaunch(): Promise<void> {
  const reload = session.get(SESSION_KEY) === "1";
  session.set(SESSION_KEY, "1");
  const sampleBefore = session.get(SAMPLE_SESSION_KEY);
  session.set(SAMPLE_SESSION_KEY, null);
  const file = IS_TAURI
    ? await invoke<string | null>("launch_open")
    : new URLSearchParams(location.search).get("file");
  const restored = restoreTabs();
  renderTabs();
  if (file) await loadDoc(file, { target: "new" });
  else if (restored) await activateTab(restored);
  const showSample = sampleOnLaunch({
    fileArrived: Boolean(file),
    restoredTabs: tabs.length > 0,
    prefOn: boolPref(PREF_KEYS.sample, true),
    reload,
    sampleWasOpen: sampleBefore !== null,
  });
  if (!showSample) return;
  const path = samplePath(lang());
  if (reload && sampleBefore !== "active" && active) {
    // Estava aberto em segundo plano: volta como aba, sem tirar o foco da ativa.
    newTab(path, false);
    renderTabs();
    return;
  }
  await loadDoc(path, { target: "new" });
  // Pela identidade, não por `active`: um arquivo que chegue durante o `await` vira a ativa.
  if (!reload) sampleAuto = tabs.find((t) => t.path === path) ?? null;
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
  syncHiddenMenu();
  wire();
  wirePreferences();
  wireExport();
  if (IS_TAURI) await wireTauri();
  else {
    wireBrowserShortcuts();
    // Modo navegador: ações do menu nativo ficam acessíveis no console para prova manual.
    (window as unknown as { leveActions: typeof actions }).leveActions = actions;
  }
  await openAtLaunch();
  if (!active) showEmpty();
  // Pasta da sessão anterior volta como as abas; no navegador, `?folder=/docs`.
  const folderRoot = IS_TAURI ? savedFolderRoot() : new URLSearchParams(location.search).get("folder");
  if (folderRoot) await openFolder(folderRoot, true);
  await loadAppInfo();
  // No Flatpak a checagem diária não existe: some a linha dela nas Preferências.
  const source = updateSource(IS_TAURI, appInfo.flatpak);
  $("prefs-auto-update-row").hidden = source === "flatpak";
  if (source === "app") {
    maybeDailyCheck(updateUi, appInfo.version);
    window.setInterval(() => maybeDailyCheck(updateUi, appInfo.version), 60 * 60 * 1000);
  }
}

void main();
