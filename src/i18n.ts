/**
 * Interface em português brasileiro e inglês, sem biblioteca: um dicionário tipado por idioma.
 * `pt` é a referência; `en` tem o mesmo conjunto de chaves por tipo, então chave faltando ou a
 * mais quebra o `tsc`. Texto com parâmetro usa `{nome}`, trocado por `t(chave, { nome })`.
 *
 * Idioma: preferência `leve.lang` ("auto", "pt-BR" ou "en"); "auto" segue o sistema
 * (`navigator.languages`): qualquer português vira pt-BR, o resto vira inglês. O menu nativo e as
 * mensagens do Rust recebem o idioma resolvido por `set_locale` (lib.rs). No HTML, `data-i18n`
 * (texto), `data-i18n-html` (texto do dicionário com marcação), `data-i18n-title`,
 * `data-i18n-aria-label` e `data-i18n-placeholder` são preenchidos por `applyI18n`.
 */
import { PREF_KEYS } from "./prefs";

export type Lang = "pt-BR" | "en";
export type LangPref = Lang | "auto";

const pt = {
  "app.tagline": "Visualizador leve de Markdown.",
  "app.privacy":
    "Lê Markdown local. Sem telemetria. A rede só é usada nos links que você abre, nas imagens remotas que você pedir e para procurar atualizações, quando você pede ou liga a checagem diária.",
  "app.license": "Código sob a licença MIT. Nome, logo e marca Moralia não fazem parte da licença.",
  "app.credits": "Ícones de interface: Lucide (lucide.dev), licença ISC.",

  "common.close": "Fechar",
  "common.cancel": "Cancelar",
  "common.confirm": "Confirmar",

  "bar.skip": "Ir para o documento",
  "bar.toc": "Sumário",
  "bar.back": "Voltar",
  "bar.forward": "Avançar",
  "bar.theme": "Tema",
  "bar.themeToggle": "Alternar tema",
  "bar.open": "Abrir",
  "bar.openEllipsis": "Abrir…",
  "bar.tabs": "Documentos abertos",
  "bar.document": "Documento",

  "find.placeholder": "Buscar no documento",
  "find.prev": "Anterior",
  "find.prevLabel": "Resultado anterior",
  "find.next": "Próximo",
  "find.nextLabel": "Próximo resultado",
  "find.closeLabel": "Fechar busca",
  "find.none": "Nenhum resultado",
  "find.one": "1 resultado",
  "find.nth": "Resultado {i} de {n}",

  "empty.lead": "Arraste um arquivo <code>.md</code> para cá ou",
  "empty.open": "abra um arquivo",
  "empty.tip":
    "Dica: no Finder ou no Explorer, o duplo-clique num <code>.md</code> abre aqui; “Abrir com” também. Atalhos em Ajuda › Atalhos.",
  "empty.tipClose": "Entendi",
  "empty.tipCloseLabel": "Fechar dica",
  "empty.drop": "Solte para abrir",

  "tab.close": "Fechar aba",
  "tab.closeNamed": "Fechar {name}",

  "recent.title": "Recentes",
  "recent.clear": "Limpar",
  "recent.clearLabel": "Limpar recentes",
  "recent.remove": "Remover dos recentes",
  "recent.removeNamed": "Remover {name} dos recentes",
  "recent.missing": "Arquivo não encontrado: {path}",
  "recent.missingLabel": "{name}, arquivo não encontrado; clique para remover dos recentes",
  "recent.none": "Nenhum recente para limpar",
  "recent.confirmTitle": "Limpar recentes?",
  "recent.confirmText":
    "A lista de arquivos recentes e as posições de leitura guardadas serão apagadas. Os arquivos continuam no disco.",
  "recent.cleared": "Recentes limpos",

  "remote.loadedDoc": "Imagens remotas carregadas neste documento",
  "remote.always": "Imagens remotas: carregar sempre",
  "remote.blocked": "Imagens remotas: bloquear até pedir",
  "remote.bannerOne": "1 recurso remoto bloqueado para proteger sua privacidade.",
  "remote.bannerMany": "{n} recursos remotos bloqueados para proteger sua privacidade.",
  "remote.loadAll": "Carregar imagens remotas neste documento",
  "remote.placeholder": "Imagem remota bloqueada · carregar",
  "remote.placeholderTitle": "Carregar esta imagem de {host}: {url}",
  "remote.placeholderLabel": "Imagem remota bloqueada{alt}; carregar de {host}",

  "doc.reloaded": "Recarregado",
  "sample.title": "Guia de Markdown",
  "doc.onlyMarkdown": "Só arquivos Markdown (.md)",
  "doc.browserOpen": "Abrir arquivo só no app; no navegador use ?file=",
  "doc.notFound": "Não encontrado: {path}",
  "app.unexpectedError": "Erro inesperado: {error}",
  "doc.wikilinksFailed": "Não foi possível resolver os wikilinks deste documento",
  "doc.noteNotFound": "Nota não encontrada: {name}",
  "doc.large": "Documento grande: links automáticos, realce e sumário reduzidos",
  "doc.metadata": "Metadados",
  "doc.metadataInvalid": "Metadados (YAML inválido)",
  "doc.yes": "sim",
  "doc.no": "não",
  "doc.image": "imagem",
  "doc.imageMissing": "Imagem não encontrada: {path}",
  "code.copy": "Copiar código",
  "code.copied": "Copiado",
  "code.copyFailed": "Não foi possível copiar",

  "export.title": "Exportar HTML",
  "export.lead":
    "Um arquivo .html só, que abre em qualquer navegador, sem internet: tema claro, código realçado, fórmulas, diagramas e imagens locais de até 5 MB embutidos.",
  "export.mdLinks": "Links para outros .md apontam para o .html de mesmo nome",
  "export.mdLinksHint":
    "Para exportar vários documentos lado a lado. Desligado, esses links viram texto com o caminho. Vale também para Copiar como HTML.",
  "export.ok": "Exportar…",
  "export.copyTitle": "Copiar como HTML",
  "export.copy": "Copiar",
  "export.saved": "HTML exportado: {path}",
  "export.copied": "HTML copiado",
  "export.failed": "Não foi possível exportar: {error}",
  "export.oversizedOne": "1 imagem acima de 5 MB ficou fora do arquivo, com o caminho relativo",
  "export.oversizedMany": "{n} imagens acima de 5 MB ficaram fora do arquivo, com o caminho relativo",
  "export.noDoc": "Abra um documento para exportar",
  "export.remoteBlocked": "Imagem remota não incluída",

  "alert.note": "Nota",
  "alert.tip": "Dica",
  "alert.important": "Importante",
  "alert.warning": "Atenção",
  "alert.caution": "Cuidado",

  "theme.flash": "Tema: {mode}",
  "theme.auto": "Sistema",
  "theme.light": "Claro",
  "theme.dark": "Escuro",
  "width.flash": "Largura: {value}",
  "width.narrow": "Estreita",
  "width.normal": "Padrão",
  "width.wide": "Larga",
  "font.flash": "Fonte: {value}",

  "prefs.title": "Preferências",
  "prefs.look": "Aparência",
  "prefs.language": "Idioma",
  "prefs.langAuto": "Sistema",
  "prefs.theme": "Tema",
  "prefs.font": "Fonte",
  "prefs.width": "Largura",
  "prefs.zoom": "Tamanho do texto",
  "prefs.zoomOut": "Diminuir",
  "prefs.zoomOutLabel": "Diminuir texto",
  "prefs.zoomIn": "Aumentar",
  "prefs.zoomInLabel": "Aumentar texto",
  "prefs.zoomReset": "Tamanho padrão",
  "prefs.zoomResetShort": "Padrão",
  "prefs.reading": "Leitura",
  "prefs.tocOpen": "Sumário visível ao abrir",
  "prefs.restoreScroll": "Restaurar a posição de leitura ao reabrir",
  "prefs.restoreTabs": "Reabrir as abas ao iniciar",
  "prefs.sample": "Mostrar documento de exemplo ao abrir",
  "prefs.privacy": "Privacidade",
  "prefs.remote": "Carregar imagens remotas",
  "prefs.remoteHint": "Desligado, imagens de outros sites só carregam quando você pedir, documento a documento.",
  "prefs.clearRecent": "Limpar recentes…",
  "prefs.forget": "Esquecer arquivos autorizados…",
  "prefs.forgetHint":
    "Esquecer tira a permissão de leitura dos arquivos abertos antes e apaga os recentes; as abas abertas agora continuam.",
  "prefs.updates": "Atualizações",
  "prefs.autoUpdate": "Procurar atualizações uma vez por dia",
  "prefs.autoUpdateHint": "Consulta as releases do Leve no GitHub; nada sobre você ou seus arquivos é enviado.",
  "prefs.shortcuts": "Atalhos",
  "prefs.about": "Sobre",
  "prefs.reset": "Restaurar padrões",
  "prefs.restored": "Preferências restauradas",
  "prefs.forgetTitle": "Esquecer arquivos autorizados?",
  "prefs.forgetText":
    "O app deixa de poder ler os arquivos abertos antes, e a lista de recentes e as posições de leitura são apagadas. As abas abertas agora continuam. Os arquivos ficam no disco.",
  "prefs.forgetOk": "Esquecer",
  "prefs.forgotten": "Arquivos autorizados esquecidos",
  "prefs.integration": "Integração",
  "prefs.editor": "Editor",
  "prefs.editorSystem": "Aplicativo padrão para .md",
  "prefs.editorHint": "Arquivo › Abrir no editor abre o documento ativo nele.",
  "prefs.editorMissing": "{name} (não encontrado)",
  "prefs.editorSelf": "O aplicativo padrão para .md é o próprio Leve; escolha um editor.",
  "prefs.cli": "Comando no terminal",
  "prefs.cliHintMac": "Instala o comando leve: leve arquivo.md abre no Leve.",
  "prefs.cliHintPc": "Com a pasta do Leve no PATH, leve arquivo.md abre no Leve. Passo a passo em docs/instalacao.md.",
  "prefs.cliInstall": "Instalar comando 'leve'…",

  "editor.sample": "O documento de exemplo não é um arquivo; abra um arquivo para editar",
  "editor.noDoc": "Nenhum documento aberto",
  "editor.opened": "Aberto em {name}",
  "editor.browser": "Abrir no editor só no app",
  "cli.installed": "Comando instalado em {path}. No terminal: leve arquivo.md",
  "cli.adminTitle": "Instalar o comando 'leve'?",
  "cli.adminText": "Nenhuma pasta do seu PATH aceita gravação sem senha. O Leve pode gravar {path}, e o macOS vai pedir a senha de administrador.",
  "cli.adminOk": "Instalar",
  "cli.cancelled": "Instalação cancelada",
  "cli.pc": "No Windows e no Linux o comando vem com a pasta do Leve no PATH; veja docs/instalacao.md",

  "update.check": "Verificar atualizações…",
  "update.checking": "Procurando atualizações…",
  "update.upToDate": "O Leve está atualizado ({version}).",
  "update.availableTitle": "Atualização disponível",
  "update.availableText": "O Leve {version} está disponível (você tem o {current}). Baixar e instalar agora? O app reinicia ao terminar.",
  "update.install": "Instalar",
  "update.downloading": "Baixando atualização… {progress}",
  "update.installing": "Instalando atualização…",
  "update.failed": "Não foi possível atualizar: {error}",
  "update.browser": "Atualizações só no app",

  "shortcuts.title": "Atalhos",
  "shortcuts.open": "Abrir…",
  "shortcuts.reload": "Recarregar",
  "shortcuts.revealMac": "Mostrar no Finder",
  "shortcuts.revealPc": "Mostrar no Explorer",
  "shortcuts.openInEditor": "Abrir no editor",
  "shortcuts.print": "Imprimir / Exportar PDF",
  "shortcuts.find": "Buscar no documento",
  "shortcuts.toc": "Sumário",
  "shortcuts.theme": "Alternar tema",
  "shortcuts.zoom": "Aumentar / Diminuir / Tamanho padrão",
  "shortcuts.nav": "Voltar / Avançar",
  "shortcuts.tabs": "Próxima aba / Aba anterior",
  "shortcuts.close": "Fechar aba / Fechar janela",
  "shortcuts.linkNewTab": "Abrir link em aba nova",
  "shortcuts.preferences": "Preferências…",
  "shortcuts.shortcuts": "Atalhos",
  "keys.click": "clique",
} as const;

export type Key = keyof typeof pt;
type Dict = Record<Key, string>;

const en: Dict = {
  "app.tagline": "A lightweight Markdown viewer.",
  "app.privacy":
    "Reads local Markdown. No telemetry. The network is used only for links you open, remote images you ask for, and update checks, when you ask or turn on the daily check.",
  "app.license": "Code under the MIT license. The Leve name, logo and the Moralia brand are not part of the license.",
  "app.credits": "Interface icons: Lucide (lucide.dev), ISC license.",

  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",

  "bar.skip": "Skip to document",
  "bar.toc": "Contents",
  "bar.back": "Back",
  "bar.forward": "Forward",
  "bar.theme": "Theme",
  "bar.themeToggle": "Toggle theme",
  "bar.open": "Open",
  "bar.openEllipsis": "Open…",
  "bar.tabs": "Open documents",
  "bar.document": "Document",

  "find.placeholder": "Find in document",
  "find.prev": "Previous",
  "find.prevLabel": "Previous match",
  "find.next": "Next",
  "find.nextLabel": "Next match",
  "find.closeLabel": "Close find",
  "find.none": "No results",
  "find.one": "1 result",
  "find.nth": "Result {i} of {n}",

  "empty.lead": "Drag a <code>.md</code> file here or",
  "empty.open": "open a file",
  "empty.tip":
    "Tip: double-click a <code>.md</code> file in Finder or Explorer to open it here; “Open With” works too. Shortcuts are in Help › Keyboard Shortcuts.",
  "empty.tipClose": "Got it",
  "empty.tipCloseLabel": "Dismiss tip",
  "empty.drop": "Drop to open",

  "tab.close": "Close Tab",
  "tab.closeNamed": "Close {name}",

  "recent.title": "Recent",
  "recent.clear": "Clear",
  "recent.clearLabel": "Clear recent files",
  "recent.remove": "Remove from recent files",
  "recent.removeNamed": "Remove {name} from recent files",
  "recent.missing": "File not found: {path}",
  "recent.missingLabel": "{name}, file not found; click to remove it from recent files",
  "recent.none": "No recent files to clear",
  "recent.confirmTitle": "Clear recent files?",
  "recent.confirmText":
    "The recent files list and saved reading positions will be deleted. The files themselves stay on disk.",
  "recent.cleared": "Recent files cleared",

  "remote.loadedDoc": "Remote images loaded for this document",
  "remote.always": "Remote images: always load",
  "remote.blocked": "Remote images: blocked until you ask",
  "remote.bannerOne": "1 remote resource blocked to protect your privacy.",
  "remote.bannerMany": "{n} remote resources blocked to protect your privacy.",
  "remote.loadAll": "Load remote images in this document",
  "remote.placeholder": "Remote image blocked · load",
  "remote.placeholderTitle": "Load this image from {host}: {url}",
  "remote.placeholderLabel": "Remote image blocked{alt}; load from {host}",

  "doc.reloaded": "Reloaded",
  "sample.title": "Markdown Primer",
  "doc.onlyMarkdown": "Markdown files only (.md)",
  "doc.browserOpen": "Opening files works only in the app; in the browser use ?file=",
  "doc.notFound": "Not found: {path}",
  "app.unexpectedError": "Unexpected error: {error}",
  "doc.wikilinksFailed": "Couldn't resolve the wikilinks in this document",
  "doc.noteNotFound": "Note not found: {name}",
  "doc.large": "Large document: automatic links, highlighting and contents reduced",
  "doc.metadata": "Metadata",
  "doc.metadataInvalid": "Metadata (invalid YAML)",
  "doc.yes": "yes",
  "doc.no": "no",
  "doc.image": "image",
  "doc.imageMissing": "Image not found: {path}",
  "code.copy": "Copy code",
  "code.copied": "Copied",
  "code.copyFailed": "Couldn’t copy",

  "export.title": "Export HTML",
  "export.lead":
    "A single .html file that opens in any browser, offline: light theme, highlighted code, math, diagrams and local images up to 5 MB embedded.",
  "export.mdLinks": "Links to other .md files point to the .html file with the same name",
  "export.mdLinksHint":
    "For exporting several documents side by side. When off, those links become text with the path. Also applies to Copy as HTML.",
  "export.ok": "Export…",
  "export.copyTitle": "Copy as HTML",
  "export.copy": "Copy",
  "export.saved": "HTML exported: {path}",
  "export.copied": "HTML copied",
  "export.failed": "Couldn’t export: {error}",
  "export.oversizedOne": "1 image over 5 MB was left out of the file, with its relative path",
  "export.oversizedMany": "{n} images over 5 MB were left out of the file, with their relative paths",
  "export.noDoc": "Open a document to export",
  "export.remoteBlocked": "Remote image not included",

  "alert.note": "Note",
  "alert.tip": "Tip",
  "alert.important": "Important",
  "alert.warning": "Warning",
  "alert.caution": "Caution",

  "theme.flash": "Theme: {mode}",
  "theme.auto": "System",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "width.flash": "Width: {value}",
  "width.narrow": "Narrow",
  "width.normal": "Default",
  "width.wide": "Wide",
  "font.flash": "Font: {value}",

  "prefs.title": "Settings",
  "prefs.look": "Appearance",
  "prefs.language": "Language",
  "prefs.langAuto": "System",
  "prefs.theme": "Theme",
  "prefs.font": "Font",
  "prefs.width": "Width",
  "prefs.zoom": "Text size",
  "prefs.zoomOut": "Zoom Out",
  "prefs.zoomOutLabel": "Decrease text size",
  "prefs.zoomIn": "Zoom In",
  "prefs.zoomInLabel": "Increase text size",
  "prefs.zoomReset": "Actual Size",
  "prefs.zoomResetShort": "Default",
  "prefs.reading": "Reading",
  "prefs.tocOpen": "Show contents when opening",
  "prefs.restoreScroll": "Restore reading position when reopening",
  "prefs.restoreTabs": "Reopen tabs at startup",
  "prefs.sample": "Show sample document at startup",
  "prefs.privacy": "Privacy",
  "prefs.remote": "Load remote images",
  "prefs.remoteHint": "When off, images from other sites load only when you ask, one document at a time.",
  "prefs.clearRecent": "Clear Recent…",
  "prefs.forget": "Forget Authorized Files…",
  "prefs.forgetHint":
    "Forgetting revokes read access to files opened before and clears recent files; tabs open now keep working.",
  "prefs.updates": "Updates",
  "prefs.autoUpdate": "Check for updates once a day",
  "prefs.autoUpdateHint": "Contacts Leve’s releases on GitHub; nothing about you or your files is sent.",
  "prefs.shortcuts": "Keyboard Shortcuts",
  "prefs.about": "About",
  "prefs.reset": "Restore Defaults",
  "prefs.restored": "Settings restored",
  "prefs.forgetTitle": "Forget authorized files?",
  "prefs.forgetText":
    "The app will no longer be able to read files opened before, and the recent files list and reading positions will be deleted. Tabs open now keep working. The files stay on disk.",
  "prefs.forgetOk": "Forget",
  "prefs.forgotten": "Authorized files forgotten",
  "prefs.integration": "Integration",
  "prefs.editor": "Editor",
  "prefs.editorSystem": "Default app for .md",
  "prefs.editorHint": "File › Open in Editor opens the active document in it.",
  "prefs.editorMissing": "{name} (not found)",
  "prefs.editorSelf": "The default app for .md is Leve itself; choose an editor.",
  "prefs.cli": "Terminal command",
  "prefs.cliHintMac": "Installs the leve command: leve file.md opens in Leve.",
  "prefs.cliHintPc": "With Leve's folder in your PATH, leve file.md opens in Leve. Steps in docs/instalacao.md.",
  "prefs.cliInstall": "Install 'leve' Command…",

  "editor.sample": "The sample document isn't a file; open a file to edit it",
  "editor.noDoc": "No document open",
  "editor.opened": "Opened in {name}",
  "editor.browser": "Open in Editor works only in the app",
  "cli.installed": "Command installed at {path}. In a terminal: leve file.md",
  "cli.adminTitle": "Install the 'leve' command?",
  "cli.adminText": "No folder in your PATH can be written without a password. Leve can write {path}, and macOS will ask for an administrator password.",
  "cli.adminOk": "Install",
  "cli.cancelled": "Installation cancelled",
  "cli.pc": "On Windows and Linux the command comes from having Leve's folder in your PATH; see docs/instalacao.md",

  "update.check": "Check for Updates…",
  "update.checking": "Checking for updates…",
  "update.upToDate": "Leve is up to date ({version}).",
  "update.availableTitle": "Update available",
  "update.availableText": "Leve {version} is available (you have {current}). Download and install now? The app restarts when done.",
  "update.install": "Install",
  "update.downloading": "Downloading update… {progress}",
  "update.installing": "Installing update…",
  "update.failed": "Couldn’t update: {error}",
  "update.browser": "Updates are available only in the app",

  "shortcuts.title": "Keyboard Shortcuts",
  "shortcuts.open": "Open…",
  "shortcuts.reload": "Reload",
  "shortcuts.revealMac": "Show in Finder",
  "shortcuts.revealPc": "Show in Explorer",
  "shortcuts.openInEditor": "Open in Editor",
  "shortcuts.print": "Print / Export PDF",
  "shortcuts.find": "Find in Document",
  "shortcuts.toc": "Contents",
  "shortcuts.theme": "Toggle Theme",
  "shortcuts.zoom": "Zoom In / Zoom Out / Actual Size",
  "shortcuts.nav": "Back / Forward",
  "shortcuts.tabs": "Next Tab / Previous Tab",
  "shortcuts.close": "Close Tab / Close Window",
  "shortcuts.linkNewTab": "Open link in a new tab",
  "shortcuts.preferences": "Settings…",
  "shortcuts.shortcuts": "Keyboard Shortcuts",
  "keys.click": "click",
};

export const DICTS: Record<Lang, Dict> = { "pt-BR": pt, en };

export const LANG_KEY = PREF_KEYS.lang;

/** Idioma de uma lista de preferências do sistema: português (qualquer região) ou inglês. */
export function detectLang(languages: readonly string[]): Lang {
  for (const l of languages) {
    if (/^pt\b/i.test(l)) return "pt-BR";
    if (/^en\b/i.test(l)) return "en";
  }
  return "en";
}

export function langPref(): LangPref {
  const v = localStorage.getItem(LANG_KEY);
  return v === "pt-BR" || v === "en" ? v : "auto";
}

export function setLangPref(p: LangPref): void {
  if (p === "auto") localStorage.removeItem(LANG_KEY);
  else localStorage.setItem(LANG_KEY, p);
}

let cached: Lang | null = null;

/** Idioma em uso: a preferência ou, em "auto", o do sistema. Resolvido uma vez por página. */
export function lang(): Lang {
  if (cached) return cached;
  const p = langPref();
  cached = p === "auto" ? detectLang(navigator.languages?.length ? navigator.languages : [navigator.language]) : p;
  return cached;
}

/** Fixa o idioma (testes; a troca pelo usuário recarrega a página). */
export function setLang(l: Lang): void {
  cached = l;
}

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  return DICTS[lang()][key].replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const ATTRS = ["title", "aria-label", "placeholder"] as const;

/** Preenche os textos marcados no HTML. Roda antes de ligar eventos (troca `innerHTML`). */
export function applyI18n(root: ParentNode): void {
  if (root instanceof Document) root.documentElement.lang = lang();
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = t(el.dataset.i18n as Key);
  // Só texto do próprio dicionário, nunca do documento: marcação estática (`<code>`).
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml as Key);
  for (const attr of ATTRS) {
    for (const el of root.querySelectorAll<HTMLElement>(`[data-i18n-${attr}]`)) {
      el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`) as Key));
    }
  }
}
